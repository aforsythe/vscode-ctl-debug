// Detect whether a folder is a CTL source checkout — used by the
// auto-build path so we only OFFER a build for workspaces where the
// build is actually possible.  Pure filesystem inspection; no I/O
// against the user.

import * as fs from 'fs';
import * as path from 'path';

export interface CtlRepoLayout {
    rootPath:    string;
    buildDir:    string;        // suggested build dir (existing or default)
    builtCtldap: string | null; // ctldap binary if already built
}

const BUILD_DIR_PREFERENCES = [
    'build-dbg-on',
    'build-dbg',
    'build',
];

// True if the folder contains the marker files of a CTL source tree:
// top-level CMakeLists.txt, plus a `ctldap/` and `lib/IlmCtl/` subdir.
// Avoids false positives on, say, the user's app workspace that happens
// to contain a `ctldap` config file.
export function isCtlSourceRoot(folder: string): boolean {
    if (!folder) { return false; }
    return fs.existsSync(path.join(folder, 'CMakeLists.txt'))
        && fs.existsSync(path.join(folder, 'ctldap', 'CMakeLists.txt'))
        && fs.existsSync(path.join(folder, 'lib', 'IlmCtl'));
}

// Return the layout for a CTL repo rooted at `folder`, or null if it
// isn't a CTL repo.  Picks the first existing build dir from the
// preference list; defaults to `build-dbg-on` if none exist yet.
export function detectCtlRepo(folder: string): CtlRepoLayout | null {
    if (!isCtlSourceRoot(folder)) { return null; }

    let buildDir = '';
    let builtCtldap: string | null = null;
    for (const candidate of BUILD_DIR_PREFERENCES) {
        const dir = path.join(folder, candidate);
        const bin = path.join(dir, 'ctldap', 'ctldap');
        if (fs.existsSync(bin)) {
            buildDir = dir;
            builtCtldap = bin;
            break;
        }
        if (!buildDir && fs.existsSync(dir)) {
            buildDir = dir;
        }
    }
    if (!buildDir) {
        buildDir = path.join(folder, BUILD_DIR_PREFERENCES[0]);
    }
    return { rootPath: folder, buildDir, builtCtldap };
}
