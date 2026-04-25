// Helper used by the InlineValuesProvider.  Walks a single line of CTL
// source and returns identifier ranges that are worth resolving via the
// debugger's `evaluate` request.
//
// We're deliberately conservative: emit a candidate for any bare identifier
// that LOOKS like a user variable, then let the debug adapter's evaluate
// handler reject the unknown ones.  False positives cost one evaluate
// round-trip; false negatives cost a missing inline value (worse UX).
//
// Filters out:
//   - CTL reserved keywords / control-flow / type names — they're never
//     evaluatable.
//   - All-uppercase identifiers — by convention these are constants
//     (FLT_EPSILON, M_PI, etc.) and the variables panel surfaces them under
//     "Module" already; inlining them adds clutter.
//   - Identifiers immediately followed by `(` — that's a function call,
//     not a variable read.
//   - Identifiers preceded by `.` — struct field access; the parent name
//     covers it.
//   - Identifiers inside string and line/block comments.

export interface InlineIdentifier {
    name:        string;
    line:        number;       // 0-based to match VS Code's Range
    startColumn: number;       // 0-based, inclusive
    endColumn:   number;       // 0-based, exclusive
}

const CTL_RESERVED = new Set<string>([
    // control flow
    'if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue',
    // declarations
    'const', 'static', 'extern', 'namespace', 'import', 'struct', 'typedef',
    // i/o qualifiers
    'input', 'output', 'varying', 'uniform', 'in', 'out', 'inout',
    // primitive types
    'void', 'bool', 'int', 'unsigned', 'short', 'long', 'float', 'half',
    'double', 'string',
    // literals
    'true', 'false', 'null',
    // CTL keywords
    'print',
]);

export function findInlineIdentifiers(
    lineText: string,
    lineNumber: number,
): InlineIdentifier[] {
    const out: InlineIdentifier[] = [];

    // Strip line comment first ('// ...').  Inside a literal string we
    // should NOT strip; but our scanner skips strings explicitly so the
    // simple find-first-`//` heuristic is fine if we only consult it for
    // identifier extraction (we still walk the whole line below to track
    // string state correctly).
    let inString = false;
    let inBlockComment = false;
    let i = 0;
    while (i < lineText.length) {
        const ch = lineText[i];

        if (inBlockComment) {
            if (ch === '*' && lineText[i + 1] === '/') { inBlockComment = false; i += 2; continue; }
            i++; continue;
        }
        if (inString) {
            if (ch === '\\' && i + 1 < lineText.length) { i += 2; continue; }
            if (ch === '"') { inString = false; }
            i++; continue;
        }
        if (ch === '"') { inString = true; i++; continue; }
        if (ch === '/' && lineText[i + 1] === '/') { break; }   // line comment
        if (ch === '/' && lineText[i + 1] === '*') { inBlockComment = true; i += 2; continue; }

        // Identifier start: [_A-Za-z]
        if (ch === '_' || (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) {
            const start = i;
            while (i < lineText.length) {
                const c = lineText[i];
                if (c === '_' ||
                    (c >= '0' && c <= '9') ||
                    (c >= 'A' && c <= 'Z') ||
                    (c >= 'a' && c <= 'z')) {
                    i++;
                } else {
                    break;
                }
            }
            const name = lineText.slice(start, i);

            // Reject keywords / types.
            if (CTL_RESERVED.has(name)) { continue; }

            // Reject ALL_CAPS constants (they sit in the Module scope).
            if (/^[A-Z_][A-Z0-9_]*$/.test(name)) { continue; }

            // Reject function calls: identifier followed by `(`.
            // (Skip whitespace between the name and the paren.)
            let j = i;
            while (j < lineText.length && (lineText[j] === ' ' || lineText[j] === '\t')) { j++; }
            if (lineText[j] === '(') { continue; }

            // Reject struct field accesses: previous non-space char was `.`.
            let p = start - 1;
            while (p >= 0 && (lineText[p] === ' ' || lineText[p] === '\t')) { p--; }
            if (p >= 0 && lineText[p] === '.') { continue; }

            out.push({
                name,
                line:        lineNumber,
                startColumn: start,
                endColumn:   i,
            });
            continue;
        }
        i++;
    }
    return out;
}
