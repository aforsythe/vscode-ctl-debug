# Development

This is a deeper reference than `CONTRIBUTING.md` — covers the
architecture of the extension and how each piece talks to `ctldap`.

## Architecture

```
┌────────────────────────┐  DAP (JSON-RPC over stdio)  ┌─────────┐
│  VS Code Debug runtime │ ──────────────────────────▶ │ ctldap  │
└──────────┬─────────────┘                             └────┬────┘
           │                                                │
           │ extension API                                   │ ctldb-shared
           ▼                                                 ▼
┌────────────────────────┐                    ┌──────────────────────────┐
│   This extension       │                    │  CTL SIMD interpreter    │
│   (TypeScript)         │                    │  + IlmCtlDebug helpers   │
└────────────────────────┘                    └──────────────────────────┘
```

We are the small TS layer between VS Code and the DAP server.  The
debugger logic itself lives in `ctldap` and the CTL libraries.

### What this extension does

- **`CtlDebugAdapterFactory`** spawns the `ctldap` binary and wires
  its stdin/stdout to VS Code's debug runtime.
- **`CtlDebugConfigurationProvider`** auto-fills missing fields in
  `launch.json` entries — most importantly `pixel`, which gets
  pulled from the live status-bar value when not hardcoded.
- **Status-bar pixel picker** (`pickPixel`, `refreshStatusBar`,
  `getCurrentPixel`/`setCurrentPixel`) — workspace-state-backed
  control for the current test pixel.
- **`CtlInlineValuesProvider`** — emits `InlineValueVariableLookup`
  hints for identifiers in visible source while paused; VS Code
  resolves them via the standard `scopes`/`variables` flow.
- **`ColorSwatchManager`** — applies `TextEditorDecorationType`
  swatches next to RGB(A)-shaped variables; cached per CSS color.
- **Auto-build** (`offerBuildCtldap`, `detectCtlRepo`) — when
  `ctldap` isn't found and the workspace looks like a CTL source
  checkout, offer to build it.
- **Palette commands** — `ctl.pickPixel`,
  `ctl.initializeDebugConfiguration`, `ctl.locateCtldap`,
  `ctl.addLaunchConfiguration`, `ctl.openConfigFiles`.

### Pure-helper modules (testable in Node)

- `src/inlineIdentifiers.ts` — finds identifier ranges in a CTL
  source line, filtering keywords, types, function calls, struct
  field accesses, and ALL_CAPS constants.
- `src/colorSwatches.ts` — parses value strings like `"[0.18, 0.18,
  0.18]"` into a tuple, then formats as a CSS color (with clipping
  for HDR values).
- `src/ctlRepoDetect.ts` — heuristically detects whether a folder is
  a CTL source checkout and returns the suggested build directory.

These are deliberately framework-free so the unit tests in `test/`
can `require()` the compiled JS directly without an Electron runtime.

## Build

```sh
npm install
npm run compile      # tsc -p ./
npm run watch        # tsc --watch
```

The TypeScript output goes to `out/`.  `package.json`'s `main` field
points at `out/extension.js`.

## Packaging

```sh
npm install
npx --yes @vscode/vsce package --no-yarn
# produces ctl-debug-0.X.Y.vsix
```

## Testing

```sh
npm test
```

What runs:
- `npm run compile` first (so the `out/` JS is current).
- Three Node test files that exercise the pure helpers via
  `node:assert`.  No Electron, no `@vscode/test-electron` — keeps CI
  fast and lets you run tests over SSH.

What's NOT covered by `npm test`:
- The DAP wire protocol (covered by `ctldap/tests/run_demo_scenarios.py`
  in the CTL repo).
- The actual rendering of inline values, swatches, and the Variables
  panel (manual verification via the [MANUAL_TESTING.md](MANUAL_TESTING.md) flow).

For a quick smoke without `make demo`, F5 from this folder in VS
Code (the `.vscode/launch.json` config opens a pristine Extension
Development Host).

## Releasing

See the `## Releasing` section in `CONTRIBUTING.md`.

## Where things live

- `src/extension.ts` — the entry point + glue.  Bigger than the
  helpers because it owns all the VS Code API integration.
- `src/inlineIdentifiers.ts` — pure helper.
- `src/colorSwatches.ts` — pure helper.
- `src/ctlRepoDetect.ts` — pure helper.
- `test/` — Node-based unit tests for the pure helpers.
- `syntaxes/` — TextMate grammar for `.ctl` files.
- `scripts/launch-demo.sh` — developer convenience: spawn an
  Extension Development Host against a temp workspace with sample
  fixtures pre-wired.  Requires either `CTLDAP=/path/to/ctldap` env
  var or the `--ctldap PATH` flag.
- `CHANGELOG.md` — Keep-a-Changelog format.
- `docs/MANUAL_TESTING.md` — manual end-to-end verification flow.
