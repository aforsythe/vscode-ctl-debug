// SPDX-License-Identifier: BSD-3-Clause
// Copyright Contributors to the CTL project.
//
// CTL Debug extension for VS Code.
//
// Mental model:
//   - A launch configuration describes the TRANSFORM (which .ctl file,
//     which function, where its imports live).
//   - The pixel + uniform params are the TEST INPUTS, edited live via
//     a persistent status-bar control.  Pressing F5 always uses
//     whatever's in the status bar, unless the launch.json explicitly
//     hardcodes a `pixel`/`params` field (which still wins).

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { findInlineIdentifiers } from './inlineIdentifiers';
import { detectCtlRepo, CtlRepoLayout } from './ctlRepoDetect';
import { parseColorValue, colorToCss } from './colorSwatches';

const TRACE_LOG = '/tmp/ctl-debug-extension.log';
function log(msg: string) {
    try { fs.appendFileSync(TRACE_LOG, `${new Date().toISOString()} ${msg}\n`); }
    catch { /* /tmp not writable */ }
}

// ---------------------------------------------------------------------------
// Pixel presets (also used by the status-bar quick-pick)
// ---------------------------------------------------------------------------

const PIXEL_PRESETS: Array<{ label: string; pixel: number[] }> = [
    { label: 'Black (0, 0, 0)',                  pixel: [0.0,  0.0,  0.0] },
    { label: 'Mid-grey 18% (0.18, 0.18, 0.18)',  pixel: [0.18, 0.18, 0.18] },
    { label: '50% grey (0.5, 0.5, 0.5)',         pixel: [0.5,  0.5,  0.5] },
    { label: '100% white (1, 1, 1)',             pixel: [1.0,  1.0,  1.0] },
    { label: 'Saturated red (1, 0, 0)',          pixel: [1.0,  0.0,  0.0] },
    { label: 'Saturated green (0, 1, 0)',        pixel: [0.0,  1.0,  0.0] },
    { label: 'Saturated blue (0, 0, 1)',         pixel: [0.0,  0.0,  1.0] },
    { label: 'HDR over-range (1.5, 0.5, 0.2)',   pixel: [1.5,  0.5,  0.2] },
    { label: 'HDR linear (4.0, 4.0, 4.0)',       pixel: [4.0,  4.0,  4.0] },
];
const DEFAULT_PIXEL = [0.18, 0.18, 0.18];

// Workspace-state key for the live pixel.
const STATE_KEY_PIXEL = 'ctl.currentPixel';

// ---------------------------------------------------------------------------
// ctldap path resolution
// ---------------------------------------------------------------------------

function autoDetectCtldap(): string | undefined {
    const buildSubpaths = [
        'build-dbg-on/ctldap/ctldap',
        'build-dbg/ctldap/ctldap',
        'build/ctldap/ctldap',
    ];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        for (const sub of buildSubpaths) {
            const p = path.join(folder.uri.fsPath, sub);
            try { fs.accessSync(p, fs.constants.X_OK); return p; }
            catch { /* not found, try next */ }
        }
    }
    try {
        const out = cp.execSync('command -v ctldap', { encoding: 'utf8' }).trim();
        if (out && fs.existsSync(out)) return out;
    } catch { /* not on PATH */ }
    return undefined;
}

async function resolveCtldapPath(perLaunchOverride?: string): Promise<string | undefined> {
    if (perLaunchOverride && perLaunchOverride.length > 0) return perLaunchOverride;
    const cfg = vscode.workspace.getConfiguration('ctl');
    const fromSetting = cfg.get<string>('ctldapPath', '').trim();
    if (fromSetting) return fromSetting;

    const detected = autoDetectCtldap();
    if (detected) {
        await cfg.update('ctldapPath', detected, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(
            `CTL: auto-detected ctldap at ${detected} (saved to user settings)`);
        return detected;
    }

    // No binary on disk and not on PATH.  If the workspace looks like a
    // CTL source checkout, offer to build it instead of dropping straight
    // into a file picker.  Saves new contributors from having to read
    // README first.
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        const repo = detectCtlRepo(folder.uri.fsPath);
        if (!repo) { continue; }
        const built = await offerBuildCtldap(repo);
        if (built) {
            await cfg.update('ctldapPath', built, vscode.ConfigurationTarget.Global);
            return built;
        }
        // User declined to build — fall through to the file picker, in
        // case they have a ctldap somewhere else.
        break;
    }

    const picked = await vscode.window.showOpenDialog({
        title:           'Locate the ctldap binary',
        openLabel:       'Use this ctldap',
        canSelectMany:    false,
        canSelectFolders: false,
        canSelectFiles:   true,
        defaultUri:       vscode.workspace.workspaceFolders?.[0]?.uri,
    });
    if (!picked || picked.length === 0) return undefined;
    const p = picked[0].fsPath;
    await cfg.update('ctldapPath', p, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`CTL: set ctl.ctldapPath = ${p}`);
    return p;
}

// Prompt the user to build ctldap inside the detected CTL source repo.
// Runs cmake configure (if needed) + build target ctldap inside a
// progress notification; returns the resulting binary path on success
// or undefined on cancel/failure.  Build output streams to a dedicated
// "CTL Debug" output channel so failures are inspectable without
// hunting through the developer console.
async function offerBuildCtldap(repo: CtlRepoLayout): Promise<string | undefined> {
    if (repo.builtCtldap) { return repo.builtCtldap; }

    const choice = await vscode.window.showInformationMessage(
        `CTL: ctldap not built yet.  Build it now in ${path.basename(repo.buildDir)}/ ? `
        + '(takes ~30s on first run; cached afterwards.)',
        { modal: true },
        'Build', 'Locate manually');
    if (choice !== 'Build') { return undefined; }

    const channel = getBuildChannel();
    channel.show(true);
    channel.appendLine(`==> Building ctldap in ${repo.buildDir}`);

    const ok = await vscode.window.withProgress({
        location:    vscode.ProgressLocation.Notification,
        title:       'CTL: building ctldap',
        cancellable: false,
    }, async () => {
        try {
            // Configure (idempotent — cmake skips if already configured).
            await runStreaming('cmake',
                ['-B', repo.buildDir, '-S', repo.rootPath,
                 '-DCMAKE_BUILD_TYPE=Debug', '-DCTL_ENABLE_DEBUGGER=ON'],
                repo.rootPath, channel);
            await runStreaming('cmake',
                ['--build', repo.buildDir, '--target', 'ctldap', '-j8'],
                repo.rootPath, channel);
            // codesign with ad-hoc identity on macOS so the binary can
            // attach to its own ptrace target.  No-op on Linux: the
            // command isn't on PATH so the spawn fails — silently swallow.
            if (process.platform === 'darwin') {
                try {
                    await runStreaming('codesign',
                        ['-s', '-', '--force',
                         path.join(repo.buildDir, 'ctldap', 'ctldap')],
                        repo.rootPath, channel);
                } catch { /* ignore */ }
            }
            return true;
        } catch (e: any) {
            channel.appendLine(`BUILD FAILED: ${e?.message ?? e}`);
            return false;
        }
    });

    if (!ok) {
        vscode.window.showErrorMessage(
            'CTL: ctldap build failed.  See the "CTL Debug" output channel for details.');
        return undefined;
    }
    const binary = path.join(repo.buildDir, 'ctldap', 'ctldap');
    if (!fs.existsSync(binary)) {
        vscode.window.showErrorMessage(
            `CTL: build reported success but ${binary} doesn't exist.`);
        return undefined;
    }
    vscode.window.showInformationMessage(`CTL: built ctldap at ${binary}`);
    return binary;
}

let buildChannel: vscode.OutputChannel | undefined;
function getBuildChannel(): vscode.OutputChannel {
    if (!buildChannel) {
        buildChannel = vscode.window.createOutputChannel('CTL Debug');
    }
    return buildChannel;
}

function runStreaming(cmd: string, args: string[], cwd: string,
                      channel: vscode.OutputChannel): Promise<void> {
    return new Promise((resolve, reject) => {
        channel.appendLine(`$ ${cmd} ${args.join(' ')}`);
        const child = cp.spawn(cmd, args, { cwd });
        child.stdout.on('data', d => channel.append(d.toString()));
        child.stderr.on('data', d => channel.append(d.toString()));
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) { resolve(); }
            else { reject(new Error(`${cmd} exited with code ${code}`)); }
        });
    });
}

// `CTL: Open config files` — quick-pick of all CTL configs in
// .vscode/launch.json; opens the program/programs without launching.
// Useful for "I want to look at this config's source before running"
// and for the multi-stage chain case where each stage lives in its
// own file.
async function openConfigFiles() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('CTL: open a folder/workspace first');
        return;
    }
    const launchPath = path.join(folders[0].uri.fsPath, '.vscode', 'launch.json');
    if (!fs.existsSync(launchPath)) {
        vscode.window.showInformationMessage(
            'CTL: no .vscode/launch.json.  Run "CTL: Initialize debug configuration" first.');
        return;
    }
    let parsed: any;
    try { parsed = JSON.parse(fs.readFileSync(launchPath, 'utf8')); }
    catch (e: any) {
        vscode.window.showErrorMessage(
            `CTL: launch.json has syntax errors (${e.message}).`);
        return;
    }
    const ctlConfigs = (Array.isArray(parsed.configurations) ? parsed.configurations : [])
        .filter((c: any) => c?.type === 'ctl');
    if (ctlConfigs.length === 0) {
        vscode.window.showInformationMessage(
            'CTL: no `type: "ctl"` entries in launch.json.');
        return;
    }

    // If there's only one, just open it — no need to ask.
    let chosen: any;
    if (ctlConfigs.length === 1) {
        chosen = ctlConfigs[0];
    } else {
        type Item = vscode.QuickPickItem & { config: any };
        const items: Item[] = ctlConfigs.map((c: any) => {
            const refs = [
                ...(typeof c.program === 'string' ? [c.program] : []),
                ...(Array.isArray(c.programs) ? c.programs : []),
            ];
            return {
                label:       c.name ?? '(unnamed)',
                description: refs.map((r: string) => path.basename(r)).join(', '),
                config:      c,
            };
        });
        const pick = await vscode.window.showQuickPick(items, {
            title:       'Open the .ctl files for which configuration?',
            placeHolder: 'Filter by config name',
        });
        if (!pick) return;
        chosen = pick.config;
    }

    const wsRoot = folders[0].uri.fsPath;
    const refs: string[] = [];
    if (typeof chosen.program === 'string') refs.push(chosen.program);
    if (Array.isArray(chosen.programs)) refs.push(...chosen.programs);
    const resolved = refs.map(p => p.replace(/\$\{workspaceFolder\}/g, wsRoot));
    await openProgramsInEditor(resolved);
}

async function locateCtldap() {
    const picked = await vscode.window.showOpenDialog({
        title:           'Locate the ctldap binary',
        openLabel:       'Use this ctldap',
        canSelectMany:    false,
        canSelectFolders: false,
        canSelectFiles:   true,
    });
    if (!picked || picked.length === 0) return;
    const p = picked[0].fsPath;
    await vscode.workspace.getConfiguration('ctl').update(
        'ctldapPath', p, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`CTL: ctl.ctldapPath = ${p}`);
}

// ---------------------------------------------------------------------------
// Status-bar pixel picker (the persistent control)
// ---------------------------------------------------------------------------

let statusBar: vscode.StatusBarItem | undefined;
let extContext: vscode.ExtensionContext | undefined;

function getCurrentPixel(): number[] {
    if (!extContext) return DEFAULT_PIXEL.slice();
    const saved = extContext.workspaceState.get<number[]>(STATE_KEY_PIXEL);
    if (Array.isArray(saved) && saved.every(x => typeof x === 'number')) {
        return saved;
    }
    return DEFAULT_PIXEL.slice();
}

async function setCurrentPixel(pixel: number[]) {
    if (!extContext) return;
    await extContext.workspaceState.update(STATE_KEY_PIXEL, pixel);
    refreshStatusBar();
}

function pixelFormat(p: number[]): string {
    return p.map(n => Number(n.toFixed(3)).toString()).join(', ');
}

function refreshStatusBar() {
    if (!statusBar) return;
    const p = getCurrentPixel();
    statusBar.text    = `$(symbol-color) CTL pixel: ${pixelFormat(p)}`;
    statusBar.tooltip = 'Click to change the pixel used by F5 (CTL Debug)';
    statusBar.command = 'ctl.pickPixel';
    statusBar.show();
}

async function pickPixel() {
    const current = getCurrentPixel();
    const items: vscode.QuickPickItem[] = [
        {
            label:       `$(check) Current: ${pixelFormat(current)}`,
            description: 'keep what F5 is using right now',
        } as any,
        ...PIXEL_PRESETS.map(p => ({
            label:       p.label,
            description: `[${p.pixel.join(', ')}]`,
            pixel:       p.pixel,
        } as any)),
        { label: '$(edit) Custom…', description: 'enter r,g,b manually' } as any,
    ];

    const choice: any = await vscode.window.showQuickPick(items, {
        title:       'Pick the test pixel for F5',
        placeHolder: 'Filter or pick from common test pixels',
    });
    if (!choice) return;
    if (choice.label.startsWith('$(check)')) return;          // current — no change

    let pixel: number[];
    if (choice.label.startsWith('$(edit)')) {
        const input = await vscode.window.showInputBox({
            prompt: 'Pixel as comma-separated floats (e.g. 0.18,0.18,0.18)',
            value:  pixelFormat(current),
            validateInput: s => {
                const parts = s.split(',').map(x => x.trim());
                if (parts.length < 3 || parts.length > 4)
                    return 'expected 3 or 4 comma-separated values';
                if (parts.some(p => isNaN(Number(p))))
                    return 'all values must be numbers';
                return null;
            },
        });
        if (!input) return;
        pixel = input.split(',').map(s => Number(s.trim()));
    } else {
        pixel = choice.pixel as number[];
    }
    await setCurrentPixel(pixel);
}

// ---------------------------------------------------------------------------
// DebugConfigurationProvider — the substitution layer.  Fills `pixel`
// from the live status-bar value when the launch.json doesn't hardcode
// it.  This is what makes F5 "just work" off the status bar.
// ---------------------------------------------------------------------------

class CtlDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        _token?: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.DebugConfiguration> {
        // F5-with-no-launch.json case: VS Code passes an empty config.
        // Bail and let the user run "CTL: Initialize debug configuration"
        // first.  (We could synthesize one on the fly but that hides the
        // settings.)
        if (!config.type && !config.request && !config.name) {
            vscode.window.showInformationMessage(
                'CTL: no launch configuration.  Run "CTL: Initialize debug configuration".');
            return undefined;
        }

        // Live pixel from the status bar — used when the launch.json
        // doesn't hardcode `pixel`.  Hardcoded pixel always wins.
        if (!Array.isArray(config.pixel) || config.pixel.length === 0) {
            config.pixel = getCurrentPixel();
            log(`pixel filled from status bar: [${config.pixel.join(',')}]`);
        }
        // Don't synthesize params — those are user-specific to the
        // transform and stay in launch.json.  Empty {} is fine.
        if (!config.params || typeof config.params !== 'object') {
            config.params = {};
        }

        // Open the .ctl file(s) this config references — single-file
        // (`program`) or chain (`programs`).  Fire-and-forget so we
        // don't block the launch on file I/O.  Skip if the user has
        // disabled the behavior via setting.
        const cfg = vscode.workspace.getConfiguration('ctl');
        const openOnLaunch = cfg.get<boolean>('openProgramOnLaunch', true);
        if (openOnLaunch) {
            const wsRoot = folder?.uri.fsPath
                        ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                        ?? '';
            const refs: string[] = [];
            if (typeof config.program === 'string') refs.push(config.program);
            if (Array.isArray(config.programs)) {
                for (const p of config.programs)
                    if (typeof p === 'string') refs.push(p);
            }
            const resolved = refs.map(p =>
                p.replace(/\$\{workspaceFolder\}/g, wsRoot));
            void openProgramsInEditor(resolved);
        }

        return config;
    }
}

// Open each .ctl path in the editor.  First file gets focus + ViewColumn
// One; subsequent files open beside (so you can see all stages of a
// chain at once without losing the first).  Already-open files are
// just brought forward, not re-loaded.
async function openProgramsInEditor(paths: string[]) {
    let column: vscode.ViewColumn = vscode.ViewColumn.One;
    let preserveFocus = false;
    for (const p of paths) {
        if (!p) continue;
        try {
            const doc = await vscode.workspace.openTextDocument(p);
            await vscode.window.showTextDocument(doc, {
                preview:       false,
                viewColumn:    column,
                preserveFocus,
            });
            // Stack subsequent files in the same column to avoid an
            // explosion of split panes for big chains; user can pull
            // them out manually if they want side-by-side.
            preserveFocus = true;
        } catch (e) {
            log(`openProgramsInEditor: failed to open ${p}: ${e}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Commands: Initialize debug configuration, Add launch configuration
// ---------------------------------------------------------------------------

async function pickCtlFile(): Promise<vscode.Uri | undefined> {
    const active = vscode.window.activeTextEditor?.document;
    if (active && active.languageId === 'ctl') return active.uri;

    const found = await vscode.workspace.findFiles('**/*.ctl', '**/build*/**', 50);
    if (found.length === 0) {
        vscode.window.showWarningMessage('CTL: no .ctl files found in this workspace');
        return undefined;
    }
    if (found.length === 1) return found[0];

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const item = await vscode.window.showQuickPick(
        found.map(u => ({ label: path.relative(root, u.fsPath), uri: u })),
        { title: 'Pick the CTL file to debug' });
    return item?.uri;
}

// Build a minimal config — pixel and params are NOT included; they
// come from the status-bar at F5 time.  Power users can still add
// hardcoded pixel/params here to lock a config to specific inputs.
function buildConfig(opts: {
    name: string;
    program: string;
    ctldap?: string;
    fn?: string;
    modulePathRoot: string;
}) {
    return {
        type:        'ctl',
        request:     'launch',
        name:        opts.name,
        program:     opts.program,
        function:    opts.fn ?? 'main',
        modulePaths: [opts.modulePathRoot],
        stopOnEntry: false,
        ...(opts.ctldap ? { ctldap: opts.ctldap } : {}),
    };
}

async function initializeDebugConfiguration() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('CTL: open a folder/workspace first');
        return;
    }
    const root = folders[0];
    const target = await pickCtlFile();
    if (!target) return;

    const ctldap = await resolveCtldapPath();
    const launchPath = path.join(root.uri.fsPath, '.vscode', 'launch.json');
    fs.mkdirSync(path.dirname(launchPath), { recursive: true });

    const relProgram = '${workspaceFolder}/' +
        path.relative(root.uri.fsPath, target.fsPath);
    const config = {
        version: '0.2.0',
        configurations: [
            buildConfig({
                name:           `Debug ${path.basename(target.fsPath)}`,
                program:        relProgram,
                ctldap,
                modulePathRoot: '${workspaceFolder}',
            }),
        ],
    };

    if (fs.existsSync(launchPath)) {
        const overwrite = await vscode.window.showWarningMessage(
            `${launchPath} already exists.  Overwrite?`,
            { modal: true }, 'Overwrite', 'Cancel');
        if (overwrite !== 'Overwrite') return;
    }
    fs.writeFileSync(launchPath, JSON.stringify(config, null, 4) + '\n');
    const doc = await vscode.workspace.openTextDocument(launchPath);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(
        `CTL: wrote ${launchPath}.  Set a breakpoint, click the pixel in the `
        + `status bar to pick a test pixel, and press F5.`);
}

async function addLaunchConfiguration() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('CTL: open a folder/workspace first');
        return;
    }
    const launchPath = path.join(folders[0].uri.fsPath, '.vscode', 'launch.json');
    if (!fs.existsSync(launchPath)) {
        const choice = await vscode.window.showWarningMessage(
            'CTL: no .vscode/launch.json found.  Initialize one first?',
            'Initialize', 'Cancel');
        if (choice === 'Initialize') await initializeDebugConfiguration();
        return;
    }

    let parsed: any;
    try { parsed = JSON.parse(fs.readFileSync(launchPath, 'utf8')); }
    catch (e: any) {
        vscode.window.showErrorMessage(
            `CTL: launch.json has syntax errors (${e.message}).  Fix manually first.`);
        const doc = await vscode.workspace.openTextDocument(launchPath);
        await vscode.window.showTextDocument(doc);
        return;
    }
    const configs: any[] = Array.isArray(parsed.configurations)
                              ? parsed.configurations : [];
    const template = [...configs].reverse().find(c => c?.type === 'ctl')
        ?? buildConfig({
            name:           '',
            program:        '${workspaceFolder}/YOUR.ctl',
            modulePathRoot: '${workspaceFolder}',
        });

    const name = await vscode.window.showInputBox({
        prompt:        'Configuration name',
        placeHolder:   'e.g. Debug myTransform — fast path',
        validateInput: s => s.trim().length === 0 ? 'name cannot be empty' : null,
    });
    if (!name) return;

    const { name: _droppedName, pixel: _droppedPixel,
            params: _droppedParams, ...templateFields } = template;
    parsed.configurations = [...configs, { ...templateFields, name }];

    fs.writeFileSync(launchPath, JSON.stringify(parsed, null, 4) + '\n');
    const doc = await vscode.workspace.openTextDocument(launchPath);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(
        `CTL: appended "${name}" to launch.json.  Pixel/params come from the `
        + `status bar; click the pixel in the bottom-left to change.`);
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
    log('activate() called');
    extContext = context;

    // Status bar pixel picker.
    statusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left, 100);
    context.subscriptions.push(statusBar);
    refreshStatusBar();

    // Adapter factory + DebugConfigurationProvider.
    context.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory(
            'ctl', new CtlDebugAdapterFactory()));
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider(
            'ctl', new CtlDebugConfigurationProvider()));

    context.subscriptions.push(
        vscode.commands.registerCommand('ctl.pickPixel',                   pickPixel));
    context.subscriptions.push(
        vscode.commands.registerCommand('ctl.initializeDebugConfiguration', initializeDebugConfiguration));
    context.subscriptions.push(
        vscode.commands.registerCommand('ctl.addLaunchConfiguration',       addLaunchConfiguration));
    context.subscriptions.push(
        vscode.commands.registerCommand('ctl.locateCtldap',                 locateCtldap));
    context.subscriptions.push(
        vscode.commands.registerCommand('ctl.openConfigFiles',              openConfigFiles));

    context.subscriptions.push(
        vscode.debug.onDidStartDebugSession(s =>
            log(`onDidStartDebugSession: name="${s.name}" id=${s.id}`)));
    context.subscriptions.push(
        vscode.debug.onDidTerminateDebugSession(s => {
            log(`onDidTerminateDebugSession: id=${s.id}`);
            if (s.type === 'ctl') { onCtlSessionTerminated(context); }
        }));

    // Inline values: render `name = <value>` next to identifiers in the
    // source while paused.  VS Code calls provideInlineValues when stopped;
    // the provider returns evaluatable expressions and VS Code resolves
    // them via the standard evaluate request (which our DAP server
    // already handles for both bare names and arithmetic).
    context.subscriptions.push(
        vscode.languages.registerInlineValuesProvider(
            { language: 'ctl' }, new CtlInlineValuesProvider()));

    // Color swatches: render a colored block next to RGB(A)-shaped
    // variables in the editor while paused.  Refreshes whenever the
    // active stack frame changes; clears on session terminate.
    swatches = new ColorSwatchManager();
    context.subscriptions.push({ dispose: () => swatches?.disposeAll() });
    context.subscriptions.push(
        vscode.debug.onDidChangeActiveStackItem(() => refreshSwatches()));
    context.subscriptions.push(
        vscode.debug.onDidTerminateDebugSession(s => {
            if (s.type === 'ctl') { swatches?.clearAll(); }
        }));

    log('activation complete');
}

export function deactivate() {
    log('deactivate() called');
}

// ---------------------------------------------------------------------------
// Post-termination hint
// ---------------------------------------------------------------------------
//
// When a CTL debug session ends, VS Code keeps any Watch entries the user
// pinned but renders them as "not available" — there's no live frame to
// evaluate against.  Users routinely read this as "watch is broken".
//
// The persistent fix is server-side: ctldap emits a [ctl-debug] line in
// the Debug Console on every termination explaining the freeze.  This
// extension-side toast complements that by surfacing the same message
// during the very FIRST termination (the user might not be looking at
// the Debug Console yet).  Gated on globalState so it only nags once.

const TERMINATION_HINT_SHOWN = 'ctl.terminationHintShown';

async function onCtlSessionTerminated(context: vscode.ExtensionContext) {
    if (context.globalState.get<boolean>(TERMINATION_HINT_SHOWN)) { return; }
    await context.globalState.update(TERMINATION_HINT_SHOWN, true);
    vscode.window.showInformationMessage(
        'CTL: debug session ended.  Watch values won\'t refresh until '
        + 'you press F5 to run again.  '
        + '(Cmd-Shift-F5 / Restart only matters mid-session — it lets '
        + 'you re-run without manually stopping first.)  '
        + 'See the Debug Console for the same hint on every future run.');
}

// ---------------------------------------------------------------------------
// Inline values provider — populates the editor with `name = <value>` hints
// next to identifiers while a debug session is paused.  The actual value
// resolution happens server-side via the standard `evaluate` request; we
// only contribute the *what to evaluate and where* metadata.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Color swatches — shows a colored block next to RGB(A)-shaped variables
// in the editor when paused.  CTL is a color-transform language; seeing
// the actual color of `aces`, `scaled`, `lifted`, etc. while stepping
// through is the killer feature distinguishing this from a generic debugger.
// ---------------------------------------------------------------------------

let swatches: ColorSwatchManager | undefined;

class ColorSwatchManager {
    // One DecorationType per unique CSS color, cached so we don't leak
    // GPU-side renderer resources.  Keys are the CSS strings produced by
    // colorToCss().  VS Code recommends reusing decoration types when the
    // visual style is identical.
    private types = new Map<string, vscode.TextEditorDecorationType>();
    // Tracks which keys had non-empty ranges last refresh so we can clear
    // them when a key drops out (e.g. variable went out of scope).
    private activeKeys = new Set<string>();

    update(editor: vscode.TextEditor,
           swatches: Array<{ css: string; range: vscode.Range }>): void {
        const byColor = new Map<string, vscode.Range[]>();
        for (const s of swatches) {
            let arr = byColor.get(s.css);
            if (!arr) { arr = []; byColor.set(s.css, arr); }
            arr.push(s.range);
        }
        // Clear keys we previously set but didn't touch this round.
        for (const key of this.activeKeys) {
            if (!byColor.has(key)) {
                const t = this.types.get(key);
                if (t) { editor.setDecorations(t, []); }
            }
        }
        this.activeKeys.clear();
        for (const [key, ranges] of byColor) {
            let t = this.types.get(key);
            if (!t) {
                t = vscode.window.createTextEditorDecorationType({
                    after: {
                        // Three filled squares with a leading space so the
                        // swatch sits cleanly after the inline-values text.
                        contentText: ' ▇▇▇',
                        color:       key,
                    },
                });
                this.types.set(key, t);
            }
            editor.setDecorations(t, ranges);
            this.activeKeys.add(key);
        }
    }

    clearAll(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            for (const t of this.types.values()) {
                editor.setDecorations(t, []);
            }
        }
        this.activeKeys.clear();
    }

    disposeAll(): void {
        for (const t of this.types.values()) { t.dispose(); }
        this.types.clear();
        this.activeKeys.clear();
    }
}

// Pull the active frame's variables from the debug session and apply
// color swatches at every line of every visible CTL editor that
// references one of those variables.
async function refreshSwatches(): Promise<void> {
    if (!swatches) { return; }
    const session = vscode.debug.activeDebugSession;
    const stackItem = vscode.debug.activeStackItem;
    if (!session || session.type !== 'ctl' || !stackItem) {
        swatches.clearAll();
        return;
    }
    if (!('frameId' in stackItem)) {
        // Not a frame (could be a thread-only stack item) — nothing to
        // resolve frame-local variables against.
        swatches.clearAll();
        return;
    }

    let scopes: any;
    try {
        scopes = await session.customRequest('scopes', { frameId: stackItem.frameId });
    } catch { swatches.clearAll(); return; }

    const colored = new Map<string, string>();    // varName → css color
    for (const scope of scopes?.scopes ?? []) {
        let vars: any;
        try {
            vars = await session.customRequest('variables', {
                variablesReference: scope.variablesReference,
            });
        } catch { continue; }
        for (const v of vars?.variables ?? []) {
            const c = parseColorValue(v.value);
            if (!c) { continue; }
            colored.set(v.name, colorToCss(c));
        }
    }

    if (colored.size === 0) { swatches.clearAll(); return; }

    for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.languageId !== 'ctl') { continue; }
        const items: Array<{ css: string; range: vscode.Range }> = [];
        const seen = new Set<string>();    // dedup per (line, var)
        for (let line = 0; line < editor.document.lineCount; line++) {
            const text = editor.document.lineAt(line).text;
            const idents = findInlineIdentifiers(text, line);
            for (const id of idents) {
                const css = colored.get(id.name);
                if (!css) { continue; }
                const key = `${line}:${id.name}`;
                if (seen.has(key)) { continue; }
                seen.add(key);
                const range = new vscode.Range(
                    new vscode.Position(id.line, id.endColumn),
                    new vscode.Position(id.line, id.endColumn));
                items.push({ css, range });
            }
        }
        swatches.update(editor, items);
    }
}

class CtlInlineValuesProvider implements vscode.InlineValuesProvider {
    provideInlineValues(
        document: vscode.TextDocument,
        viewport: vscode.Range,
        context: vscode.InlineValueContext,
        _token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.InlineValue[]> {
        const out: vscode.InlineValue[] = [];

        // Inspect lines from the top of the viewport through the line we're
        // paused on.  We use VariableLookup (not EvaluatableExpression) so
        // identifiers that aren't in the current Variables scope — namespace
        // names, function names, locals declared but not yet assigned —
        // silently disappear instead of rendering as `<unknown name>` errors.
        // The CTL inspector already hides locals whose declarationLine is
        // >= the current stop line, so a variable like `nudged` on the line
        // being paused at correctly drops out.
        const lastLine = Math.min(context.stoppedLocation.end.line, viewport.end.line);
        const firstLine = viewport.start.line;
        if (firstLine > lastLine) { return out; }

        const seenPerLine = new Set<string>();
        let currentLine = -1;
        for (let line = firstLine; line <= lastLine; line++) {
            if (line !== currentLine) { seenPerLine.clear(); currentLine = line; }

            const text = document.lineAt(line).text;
            const idents = findInlineIdentifiers(text, line);
            for (const id of idents) {
                // Dedup per-line so `boosted = boosted + 1` only emits one
                // hint, not two stacked at the same render slot.
                const key = `${line}:${id.name}`;
                if (seenPerLine.has(key)) { continue; }
                seenPerLine.add(key);

                const range = new vscode.Range(
                    new vscode.Position(id.line, id.startColumn),
                    new vscode.Position(id.line, id.endColumn));
                out.push(new vscode.InlineValueVariableLookup(range, id.name, false));
            }
        }
        return out;
    }
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

class CtlDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
    async createDebugAdapterDescriptor(
        session: vscode.DebugSession,
        _executable: vscode.DebugAdapterExecutable | undefined,
    ): Promise<vscode.DebugAdapterDescriptor | undefined> {
        log(`createDebugAdapterDescriptor: name="${session.name}" `
            + `pixel=${JSON.stringify(session.configuration.pixel)} `
            + `params=${JSON.stringify(session.configuration.params)}`);
        const perLaunch = (session.configuration.ctldap as string) || undefined;
        const ctldap = await resolveCtldapPath(perLaunch);
        if (!ctldap) {
            vscode.window.showErrorMessage(
                'CTL: ctldap binary not configured.  Run "CTL: Locate ctldap binary…" '
                + 'or set ctl.ctldapPath in settings.');
            return undefined;
        }
        const env: { [k: string]: string } = {};
        if (process.env.CTLDAP_TRACE) env.CTLDAP_TRACE = process.env.CTLDAP_TRACE;
        const opts = Object.keys(env).length > 0 ? { env } : undefined;
        return new vscode.DebugAdapterExecutable(ctldap, [], opts);
    }
}
