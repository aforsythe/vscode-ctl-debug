// Pure helpers for color-swatch detection.  Kept free of vscode imports
// so they can be exercised by Node.js unit tests.
//
// CTL value formatter (ctldb::formatValue) renders arrays as "[a, b, c]"
// — same shape regardless of whether the array represents a color or
// just three unrelated numbers.  We can't tell the difference for sure,
// but we apply a couple of cheap heuristics that match the way real
// CTL code uses RGB(A) triples and quads:
//
//   - Length is exactly 3 or 4.
//   - Every element parses as a finite number.
//   - At least one element is non-zero (suppresses freshly-zeroed
//     buffers like `float clamped[3]` before assignment).
//   - All elements fit a generous [-2, 16] sanity window — a per-channel
//     range that covers SDR + HDR linear-light + a few stops of headroom
//     while excluding obviously-not-colors like LUT indices or large
//     integer buckets.

export interface ColorTuple {
    r: number;
    g: number;
    b: number;
    a: number | undefined;
}

const MIN_PLAUSIBLE = -2;
const MAX_PLAUSIBLE = 16;

export function parseColorValue(s: string): ColorTuple | null {
    if (!s) { return null; }
    // Accept "[a, b, c]", "{a, b, c}", or bare "a, b, c".
    let body = s.trim();
    if ((body.startsWith('[') && body.endsWith(']')) ||
        (body.startsWith('{') && body.endsWith('}'))) {
        body = body.slice(1, -1);
    }
    const parts = body.split(',').map(p => p.trim());
    if (parts.length !== 3 && parts.length !== 4) { return null; }

    const nums: number[] = [];
    for (const p of parts) {
        if (p === '') { return null; }
        const n = Number(p);
        if (!Number.isFinite(n)) { return null; }
        if (n < MIN_PLAUSIBLE || n > MAX_PLAUSIBLE) { return null; }
        nums.push(n);
    }

    // Suppress all-zero values — `float clamped[3];` reads as `[0,0,0]`
    // before assignment and would render as a black swatch on every line.
    if (nums.every(n => n === 0)) { return null; }

    return {
        r: nums[0],
        g: nums[1],
        b: nums[2],
        a: nums.length === 4 ? nums[3] : undefined,
    };
}

// Convert a (possibly HDR / out-of-gamut) linear RGB(A) tuple to a CSS
// color string suitable for a swatch decoration.  We clip per-channel
// to [0, 1] for display only — the underlying value is still whatever
// the user's CTL produced, and the inline-values text shows the raw
// numbers right next to the swatch.  Alpha defaults to 1.0.
export function colorToCss(c: ColorTuple): string {
    const clip = (n: number) => Math.max(0, Math.min(1, n));
    const r = Math.round(clip(c.r) * 255);
    const g = Math.round(clip(c.g) * 255);
    const b = Math.round(clip(c.b) * 255);
    if (c.a === undefined) {
        return `rgb(${r}, ${g}, ${b})`;
    }
    const a = clip(c.a);
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}
