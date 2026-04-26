// Unit test for findInlineIdentifiers.  Run via `npm test`.
//
// Pure-Node, no jest/mocha — keeps the vscode-ctl dev dependencies
// lean.  Asserts using node's built-in assert.
//
// We require the COMPILED helper from out/ so this test fails fast if
// the TypeScript build is broken or out of date.

const assert = require('node:assert/strict');
const { findInlineIdentifiers } = require('../../out/inlineIdentifiers');

let pass = 0, fail = 0;
function t(name, fn) {
    try { fn(); console.log(`  PASS  ${name}`); pass++; }
    catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

const names = ids => ids.map(i => i.name);

t('plain assignment surfaces both identifiers', () => {
    const out = findInlineIdentifiers('    boosted = rIn * 2.5;', 0);
    assert.deepEqual(names(out), ['boosted', 'rIn']);
});

t('range columns are accurate', () => {
    const out = findInlineIdentifiers('    boosted = rIn * 2.5;', 7);
    assert.equal(out[0].name, 'boosted');
    assert.equal(out[0].line, 7);
    assert.equal(out[0].startColumn, 4);
    assert.equal(out[0].endColumn, 11);
    assert.equal(out[1].startColumn, 14);
    assert.equal(out[1].endColumn, 17);
});

t('skips reserved keywords', () => {
    const out = findInlineIdentifiers('    if (rIn > 0.5) { return; }', 0);
    assert.deepEqual(names(out), ['rIn']);
});

t('skips type names', () => {
    const out = findInlineIdentifiers('    float boosted = 0.0;', 0);
    assert.deepEqual(names(out), ['boosted']);
});

t('skips ALL_CAPS constants', () => {
    const out = findInlineIdentifiers('    float gain = M_PI * GAMMA;', 0);
    assert.deepEqual(names(out), ['gain']);
});

t('skips function calls', () => {
    const out = findInlineIdentifiers('    float clamped = clamp01(boosted);', 0);
    // `clamp01` is followed by `(` → skipped; `clamped` and `boosted` remain.
    assert.deepEqual(names(out), ['clamped', 'boosted']);
});

t('handles whitespace between name and paren on call detection', () => {
    const out = findInlineIdentifiers('    float c = clamp01 (boosted);', 0);
    assert.deepEqual(names(out), ['c', 'boosted']);
});

t('skips struct field accesses', () => {
    const out = findInlineIdentifiers('    color.r = boosted;', 0);
    assert.deepEqual(names(out), ['color', 'boosted']);
});

t('skips identifiers inside string literals', () => {
    const out = findInlineIdentifiers('    print_string("rIn is unsafe");', 0);
    // print_string is a call (followed by paren) → skipped.
    // The string contents must NOT yield rIn / unsafe identifiers.
    assert.deepEqual(names(out), []);
});

t('skips identifiers in line comments', () => {
    const out = findInlineIdentifiers('    boosted = rIn; // overrides foo', 0);
    assert.deepEqual(names(out), ['boosted', 'rIn']);
});

t('handles block comment opening mid-line', () => {
    const out = findInlineIdentifiers('    boosted = rIn; /* foo bar', 0);
    assert.deepEqual(names(out), ['boosted', 'rIn']);
});

t('handles array indexing — both array and index identifiers visible', () => {
    const out = findInlineIdentifiers('    aces[idx] = scaled[0];', 0);
    assert.deepEqual(names(out), ['aces', 'idx', 'scaled']);
});

t('handles function-signature line: only param/output names not types', () => {
    const out = findInlineIdentifiers(
        '     input  varying float rIn,', 0);
    assert.deepEqual(names(out), ['rIn']);
});

t('empty / whitespace-only line returns nothing', () => {
    assert.deepEqual(names(findInlineIdentifiers('', 0)), []);
    assert.deepEqual(names(findInlineIdentifiers('         ', 0)), []);
    assert.deepEqual(names(findInlineIdentifiers('// pure comment', 0)), []);
});

t('does not crash on stray quote at end of line', () => {
    // String never closes — we should still process up to the quote and
    // emit anything before it, then bail.  Test = no crash + sensible
    // behavior.
    const out = findInlineIdentifiers('boosted + "', 0);
    assert.deepEqual(names(out), ['boosted']);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
