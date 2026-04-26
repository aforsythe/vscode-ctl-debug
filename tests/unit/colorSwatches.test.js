// Unit tests for colorSwatches helpers.  Run via `npm test`.

const assert = require('node:assert/strict');
const { parseColorValue, colorToCss } = require('../../out/colorSwatches');

let pass = 0, fail = 0;
function t(name, fn) {
    try { fn(); console.log(`  PASS  ${name}`); pass++; }
    catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

// parseColorValue --------------------------------------------------------

t('parses a typical SDR triple', () => {
    const c = parseColorValue('[0.18, 0.18, 0.18]');
    assert.deepEqual(c, { r: 0.18, g: 0.18, b: 0.18, a: undefined });
});

t('parses a 4-tuple as RGBA', () => {
    const c = parseColorValue('[0.5, 0.25, 0.1, 1.0]');
    assert.deepEqual(c, { r: 0.5, g: 0.25, b: 0.1, a: 1.0 });
});

t('parses curly-brace literal form', () => {
    const c = parseColorValue('{1, 0, 0}');
    assert.deepEqual(c, { r: 1, g: 0, b: 0, a: undefined });
});

t('parses bare comma list', () => {
    const c = parseColorValue('1, 0.5, 0');
    assert.deepEqual(c, { r: 1, g: 0.5, b: 0, a: undefined });
});

t('rejects 2-element arrays (probably UV / not RGB)', () => {
    assert.equal(parseColorValue('[0.5, 0.5]'), null);
});

t('rejects 5+ element arrays', () => {
    assert.equal(parseColorValue('[1, 0, 0, 1, 0]'), null);
});

t('rejects non-numeric content', () => {
    assert.equal(parseColorValue('[a, b, c]'), null);
    assert.equal(parseColorValue('[1, foo, 0]'), null);
});

t('rejects empty entries', () => {
    assert.equal(parseColorValue('[1, , 0]'), null);
});

t('rejects all-zero buffers (likely uninitialised)', () => {
    assert.equal(parseColorValue('[0, 0, 0]'), null);
    assert.equal(parseColorValue('[0, 0, 0, 0]'), null);
});

t('keeps non-zero alpha-only quads', () => {
    // Probably unusual but technically valid: black with alpha.
    const c = parseColorValue('[0, 0, 0, 0.5]');
    assert.deepEqual(c, { r: 0, g: 0, b: 0, a: 0.5 });
});

t('rejects values outside the plausible window', () => {
    // 100 is way outside the per-channel sanity range.
    assert.equal(parseColorValue('[100, 200, 300]'), null);
    // -50 likewise.
    assert.equal(parseColorValue('[-50, 0, 0]'), null);
});

t('accepts HDR values within the headroom window', () => {
    const c = parseColorValue('[1.5, 0.5, 0.2]');
    assert.ok(c);
    assert.equal(c.r, 1.5);
});

t('rejects empty input', () => {
    assert.equal(parseColorValue(''), null);
    assert.equal(parseColorValue('   '), null);
});

t('rejects strings missing brackets and commas', () => {
    assert.equal(parseColorValue('not a color'), null);
});

// colorToCss -------------------------------------------------------------

t('formats a normalized triple as rgb()', () => {
    const css = colorToCss({ r: 0.5, g: 0.25, b: 0.1, a: undefined });
    assert.equal(css, 'rgb(128, 64, 26)');
});

t('formats RGBA with alpha to 3 decimals', () => {
    const css = colorToCss({ r: 1, g: 0, b: 0, a: 0.75 });
    assert.equal(css, 'rgba(255, 0, 0, 0.750)');
});

t('clips negative channels to 0', () => {
    const css = colorToCss({ r: -0.1, g: -1, b: 0.5, a: undefined });
    assert.equal(css, 'rgb(0, 0, 128)');
});

t('clips HDR over-1 channels to 255', () => {
    const css = colorToCss({ r: 4, g: 1.5, b: 1, a: undefined });
    assert.equal(css, 'rgb(255, 255, 255)');
});

t('clips alpha to [0, 1]', () => {
    const css = colorToCss({ r: 0, g: 0, b: 0, a: 1.5 });
    assert.equal(css, 'rgba(0, 0, 0, 1.000)');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
