# Changelog

## Unreleased

- **Syntax highlighting reworked from the ground up** to match the
  CTL Manual §5.2 + §5.7 and the actual stdlib registration in
  `lib/IlmCtlSimd/CtlSimdStdLib*.cpp`.  New scopes:
  - Function definitions and call sites highlighted as
    `entity.name.function`.
  - Namespace prefixes (`helper::`, `stage1::`) as
    `entity.name.namespace`.
  - Operators, punctuation, namespace separator `::`, and member
    accessor `.` get their own scopes (were unstyled).
  - Stdlib functions (`pow`, `mult_f_f3`, `lookup1D`, `assert`,
    `print_*`, color-space conversions, classification helpers,
    matrix ops, …) tagged `support.function.builtin`.
  - Stdlib constants (`M_PI`, `FLT_MAX`, `HALF_NAN`, …) tagged
    `constant.language.stdlib`.
  - Half literals (`1.2h`, `3e-02H`), hex (`0xFF`), and octal
    (`0755`) integer literals recognised per §5.2.3.
  - `ctlversion N;` directive and `import "..."` directive each
    get their own scope.
  - Reserved-but-unused keywords (`break`, `continue`) flagged as
    `keyword.other.reserved` so authors notice they tried to use one.

## 0.1.0 (2026-04-25)

Initial release.

- DAP-driven single-pixel CTL debugger backed by the `ctldap` server.
- Gutter breakpoints, step over/in/out, variable inspection,
  call-stack panel, hover-to-evaluate.
- **Inline values when paused** — variable values render alongside
  identifiers in the source while a debug session is paused.  Lines
  the program has already executed get values; lines below the stop
  point stay quiet (no stale zeros).
- **Watch panel — full small-grammar evaluator**: bare names,
  arithmetic (`+ - * /`), comparisons (`== != < <= > >=`), logical
  combinators (`&&`, `||`), array indexing (`name[i]`), parenthesised
  sub-expressions.  Same evaluator powers conditional breakpoints.
- **Restart support** — Cmd-Shift-F5 (or the restart toolbar button)
  re-launches the current session in place.  VS Code re-sends the
  current launch config, so a freshly-picked status-bar pixel takes
  effect on restart without manual stop + F5.
- **Per-stage chain output** — multi-stage chains emit one Debug
  Console line per stage as it finishes (`→ stage 0: rOut=15`),
  letting you see the inter-stage hand-off live without stepping.
- **Auto-build ctldap** — when ctldap isn't found and the workspace
  looks like a CTL source checkout, the extension offers to build it
  with one click instead of dropping into a file picker.
- **Diagnostic Watch / hover messages** — instead of the generic VS Code
  "not available", the panel now distinguishes:
  - `<not paused — set a breakpoint and run>`
  - `<session ended — Cmd-Shift-F5 to restart>`
  - `<not in scope here — declared elsewhere or after this line>`
  - `<unknown: …>` (the name truly doesn't exist)
- **Termination hint** — every CTL session emits a `[ctl-debug]`
  Debug Console line on termination explaining that Watch values
  freeze until the next launch (`F5` to relaunch, `Cmd-Shift-F5` to
  restart).  Reinforced by a one-time toast on first use so new
  contributors learn where to look.
- **Color swatches in the editor** — RGB(A)-shaped variables (`float[3]`,
  `float[4]`) get a colored block decoration next to the inline-value
  text while paused.  The killer feature for color-grading work: see
  the actual color of `aces`, `scaled`, `lifted`, etc. evolve as you
  step through the pipeline.  HDR / out-of-gamut values are clipped
  per-channel for display only.
- **Deeper-frame variable inspection** — Variables panel now resolves
  the locals of any frame in the Call Stack, not just the top one.
  Previously a v1 limitation; now removed.
- **Logpoints** — right-click a gutter dot → Add Logpoint → e.g.
  `pixel = ${aces[0]}, ${aces[1]}, ${aces[2]}` to log without pausing.
  Honors the standard DAP `logMessage` field with `${expr}`
  interpolation backed by the same evaluator as the Watch panel.
- **Struct field expansion** — when a CTL local is a struct (e.g.
  `Chromaticities`, custom types), the Variables panel renders it
  as an expandable tree of named fields (recursive for nested structs).
- **Pixel evolution line** (opt-in via launch config
  `"pixelEvolution": true`) — at every pause, ctldap emits a
  `→ paused aces=[…] scaled=[…]` summary of all color-shaped locals
  in the current frame.  Lets you watch the pipeline transform the
  pixel without scrolling Variables.
- **Pixel input flexibility** — pixel binds to the launch arg under
  many naming conventions, not just `rIn`/`gIn`/`bIn`/`aIn`:
  `r/g/b/a`, `R/G/B/A`, `red/green/blue/alpha`, full lower/upper
  variants, `_in` suffixes, plus aggregate forms `rgb[3]`, `rgba[4]`,
  `pixel[3]`, `color[3]`.  4-channel aggregates auto-fill alpha to
  1.0 when the user only specifies 3 channels.
- Multi-file chain debugging: launch with `programs` + `functions`
  arrays to run several `.ctl` files in sequence; each stage's
  outputs feed the next stage's inputs.
- Status-bar pixel picker (bottom-left): click to change the F5 test
  pixel between presets (mid-grey, 100% white, saturated R/G/B, HDR
  over-range, custom).  Live value is used unless the launch
  configuration hardcodes `pixel`.
- Palette commands:
  - **CTL: Initialize debug configuration** — auto-detects ctldap
    and writes a minimal `.vscode/launch.json`.
  - **CTL: Add launch configuration…** — appends another entry.
  - **CTL: Locate ctldap binary…** — re-points to a different ctldap.
  - **CTL: Pick test pixel for F5…** — same picker as the status bar.
  - **CTL: Open files for a launch configuration…** — opens the
    `.ctl` files referenced by a chosen launch entry without running.
- Settings:
  - `ctl.ctldapPath` — auto-populated path to the ctldap binary.
  - `ctl.openProgramOnLaunch` (default `true`) — open referenced
    `.ctl` files in the editor when F5 starts a session.
- Basic CTL syntax highlighting (keywords, types, numbers, strings).
