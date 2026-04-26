// Unit test for ctlRepoDetect.  Run via `npm test`.
//
// Builds throwaway directory trees in os.tmpdir and asserts
// detectCtlRepo / isCtlSourceRoot return the right thing.

const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');
const { detectCtlRepo, isCtlSourceRoot } = require('../../out/ctlRepoDetect');

let pass = 0, fail = 0;
function t(name, fn) {
    try { fn(); console.log(`  PASS  ${name}`); pass++; }
    catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

function mkRepoTree(opts) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctlrepo-'));
    if (opts.topCMake !== false) {
        fs.writeFileSync(path.join(root, 'CMakeLists.txt'), '# top\n');
    }
    if (opts.ctldap !== false) {
        fs.mkdirSync(path.join(root, 'ctldap'));
        fs.writeFileSync(path.join(root, 'ctldap', 'CMakeLists.txt'), '# ctldap\n');
    }
    if (opts.ilmctl !== false) {
        fs.mkdirSync(path.join(root, 'lib', 'IlmCtl'), { recursive: true });
    }
    for (const dir of opts.buildDirs ?? []) {
        fs.mkdirSync(path.join(root, dir, 'ctldap'), { recursive: true });
        if (opts.builtIn === dir) {
            fs.writeFileSync(path.join(root, dir, 'ctldap', 'ctldap'), '#!/bin/sh\n');
            fs.chmodSync(path.join(root, dir, 'ctldap', 'ctldap'), 0o755);
        }
    }
    return root;
}

function rmTree(p) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
}

t('isCtlSourceRoot true on a complete tree', () => {
    const root = mkRepoTree({});
    try { assert.equal(isCtlSourceRoot(root), true); }
    finally { rmTree(root); }
});

t('isCtlSourceRoot false when top CMakeLists.txt missing', () => {
    const root = mkRepoTree({ topCMake: false });
    try { assert.equal(isCtlSourceRoot(root), false); }
    finally { rmTree(root); }
});

t('isCtlSourceRoot false when ctldap dir missing', () => {
    const root = mkRepoTree({ ctldap: false });
    try { assert.equal(isCtlSourceRoot(root), false); }
    finally { rmTree(root); }
});

t('isCtlSourceRoot false when lib/IlmCtl missing', () => {
    const root = mkRepoTree({ ilmctl: false });
    try { assert.equal(isCtlSourceRoot(root), false); }
    finally { rmTree(root); }
});

t('isCtlSourceRoot rejects an empty folder', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'));
    try { assert.equal(isCtlSourceRoot(empty), false); }
    finally { rmTree(empty); }
});

t('isCtlSourceRoot rejects an empty string', () => {
    assert.equal(isCtlSourceRoot(''), false);
});

t('detectCtlRepo returns null on non-CTL folders', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'noctl-'));
    try { assert.equal(detectCtlRepo(empty), null); }
    finally { rmTree(empty); }
});

t('detectCtlRepo finds builtCtldap when present in build-dbg-on', () => {
    const root = mkRepoTree({ buildDirs: ['build-dbg-on'], builtIn: 'build-dbg-on' });
    try {
        const r = detectCtlRepo(root);
        assert.ok(r);
        assert.equal(r.rootPath, root);
        assert.equal(r.buildDir, path.join(root, 'build-dbg-on'));
        assert.equal(r.builtCtldap, path.join(root, 'build-dbg-on', 'ctldap', 'ctldap'));
    } finally { rmTree(root); }
});

t('detectCtlRepo prefers build-dbg-on over build-dbg over build', () => {
    const root = mkRepoTree({
        buildDirs: ['build', 'build-dbg', 'build-dbg-on'],
        builtIn:   'build-dbg-on',
    });
    try {
        const r = detectCtlRepo(root);
        assert.equal(path.basename(r.buildDir), 'build-dbg-on');
        assert.equal(path.basename(path.dirname(r.builtCtldap)), 'ctldap');
    } finally { rmTree(root); }
});

t('detectCtlRepo: existing build dir without binary still wins over default', () => {
    // build-dbg-on dir exists but no binary built yet.  We expect that
    // dir to be the suggested buildDir (so we don't fragment by creating
    // another) and builtCtldap to be null.
    const root = mkRepoTree({ buildDirs: ['build-dbg-on'] });
    try {
        const r = detectCtlRepo(root);
        assert.equal(path.basename(r.buildDir), 'build-dbg-on');
        assert.equal(r.builtCtldap, null);
    } finally { rmTree(root); }
});

t('detectCtlRepo: defaults to build-dbg-on when no build dirs exist', () => {
    const root = mkRepoTree({});
    try {
        const r = detectCtlRepo(root);
        assert.equal(path.basename(r.buildDir), 'build-dbg-on');
        assert.equal(r.builtCtldap, null);
    } finally { rmTree(root); }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
