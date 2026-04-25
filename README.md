# CTL Debug

Single-pixel debugger for CTL (Color Transform Language) modules,
integrated into VS Code via the Debug Adapter Protocol.

## Features

- **Gutter breakpoints** — click in the gutter of any `.ctl` file to set a
  breakpoint.
- **Conditional breakpoints + logpoints** — right-click a breakpoint to
  attach a condition (`boosted > 0.5 && rIn < 1`) or convert it into a
  non-pausing logpoint (`pixel = ${aces[0]}, ${aces[1]}, ${aces[2]}`).
- **Variable inspection** — paused at a breakpoint, the Variables panel
  shows every local + input/output arg in scope.  Struct values expand
  into named fields (recursive for nested structs).  Deeper Call Stack
  frames inspect cleanly — switch frame, see that frame's locals.
- **Color swatches** — RGB(A)-shaped variables get a color block
  decoration next to the inline-values text while paused.
- **Inline values** — variable values render alongside identifiers in the
  source while paused, on lines that have already executed.
- **Hover-to-evaluate** — hover over a variable name in the source to see
  its current value.
- **Step into / over / out** — F11 / F10 / Shift+F11.
- **Restart** — Cmd-Shift-F5 reuses the current launch config (pulls in
  any freshly-picked status-bar pixel automatically).
- **Call stack** — Call Stack panel shows nested function calls with
  their function names.
- **Watch expressions** — full small-grammar evaluator: bare names,
  arithmetic (`+ - * /`), comparisons (`== != < <= > >=`), logical
  combinators (`&&`, `||`), array indexing (`name[i]`), and
  parenthesised sub-expressions.
- **Per-stage chain output** — when debugging a multi-stage chain, each
  stage's outputs surface live in the Debug Console as it finishes.
- **Pixel evolution line** (opt-in: launch arg `"pixelEvolution": true`)
  — at every pause, the Debug Console shows a one-line summary of every
  color-shaped local in the current frame.
- **Flexible pixel input names** — the launch pixel binds to common
  naming conventions: `rIn/gIn/bIn`, `r/g/b`, `red/green/blue`,
  `R/G/B`, plus aggregate forms `rgb[3]`, `rgba[4]`, `pixel[3]`,
  `color[3]`.  Case-insensitive on the leaf name.
- **Syntax highlighting** for `.ctl` files (basic — keywords + types +
  numbers + strings).

## Requirements

- The `ctldap` binary built from this repository (CTL with
  `-DCTL_ENABLE_DEBUGGER=ON`).  The extension auto-detects it on PATH
  and in common build directories on first use.  When the workspace
  is itself a CTL source checkout, the extension can build ctldap
  for you with one click; otherwise it falls back to a one-time file
  picker.  No manual configuration is required for the common case.

## Quickstart

> **Just kicking the tires?**  From the repo root run `make demo`.
> It builds ctldap, generates a temp workspace with two ready-to-debug
> CTL fixtures (single-file + 2-stage chain), and launches VS Code in
> Extension Development Host mode.  No install, no .vsix, no manual
> launch.json.  Skip ahead to step 3 below for the in-VS-Code flow.

The fast path for your own project:

1. Open your project folder in VS Code.
2. Cmd-Shift-P → **CTL: Initialize debug configuration**.  This:
   - Picks the active `.ctl` file (or asks you to choose one).
   - Auto-detects ctldap in `build*/ctldap/ctldap` and on `$PATH`.  If
     nothing is found, opens a file picker; the chosen path is saved to
     `ctl.ctldapPath` so you only do this once.
   - Writes a minimal `.vscode/launch.json` (one entry — see below) and
     opens it for review.
3. Look at the bottom-left status bar for the pixel indicator —
   a small color-swatch icon followed by **CTL pixel: 0.18, 0.18, 0.18**.
   Click it any time to pick a different test pixel (mid-grey, 100%
   white, saturated RGB, HDR over-range, custom RGB, …).  Whatever's
   in the status bar is what F5 will use.
4. Set breakpoints in the gutter.
5. F5 to debug.

To iterate: change the status-bar pixel and press F5 again.  No need
to edit launch.json or pick a different configuration.

The minimal launch.json `Initialize…` generates — note: no `pixel`
field; it's filled from the status bar at F5 time:

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type":        "ctl",
            "request":     "launch",
            "name":        "Debug myTransform.ctl",
            "program":     "${workspaceFolder}/myTransform.ctl",
            "function":    "main",
            "modulePaths": ["${workspaceFolder}"],
            "stopOnEntry": false
        }
    ]
}
```

If you need different uniform `params` per configuration (e.g.
`gain=1.5` vs `gain=0.5`), add a `params` field to each entry:

```json
"params": { "gain": 1.5 }
```

If you want to LOCK a particular configuration to a specific pixel
(useful for "this is my regression test pixel; F5 always uses this
one regardless of the status-bar"), add a hardcoded `pixel`:

```json
"pixel": [0.18, 0.18, 0.18]
```

Hardcoded `pixel` always wins over the status bar.

The dropdown at the top of the Run-and-Debug panel switches between
configurations.  Add more entries via **CTL: Add launch configuration…**
or by hand-editing launch.json.

To re-pick or move ctldap later: **CTL: Locate ctldap binary…** writes
the new path to user settings.

See `SMOKE_TEST.md` for a step-by-step verification flow.

## launch.json reference

`program` (single file) or `programs` (chain) is the only required field.
Everything else has a default.

| field | type | default | required | description |
|---|---|---|---|---|
| `program` | string | `${file}` | one of program/programs | Path to the `.ctl` to debug (single-file form) |
| `programs` | string[] | — | one of program/programs | Paths to `.ctl` files to chain (alternative to single `program`) |
| `function` | string | `"main"` | no | CTL function to invoke (qualified, e.g., `myns::main`) |
| `functions` | string[] | per-stage `"main"` | no | Functions to invoke per chain stage. Missing entries (or omitted entirely) default to `main`. |
| `modulePaths` | string[] | `[]` | no | Additional directories prepended to the `import` search path (combined with `$CTL_MODULE_PATH` and per-file parent directories) |
| `pixel` | number[] | (status-bar pixel; mid-grey `[0.18, 0.18, 0.18]` until the user picks otherwise) | no | Pixel value (3 or 4 floats) bound to per-channel scalars (`rIn`/`gIn`/`bIn`/`aIn`, `r/g/b/a`, `R/G/B/A`, `red/green/blue/alpha`) or to an aggregate (`rgbIn[3]`, `rgbaIn[4]`, `rgb`, `rgba`, `pixel`, `color`).  Case-insensitive.  When omitted, F5 uses the live status-bar pixel; specify here only to LOCK a configuration to a fixed value. |
| `params` | object | `{}` | no | Uniform-input bindings by name, e.g. `{"gain": 1.5}`.  Each key matches a CTL `input uniform <type> <name>` arg. |
| `stopOnEntry` | boolean | `false` | no | Pause on the first instruction |
| `pixelEvolution` | boolean | `false` | no | When `true`, ctldap emits a `→ paused name=[…]` Debug Console line at every pause summarising every color-shaped (`float[3]` / `float[4]`) local in scope.  Useful for watching a pipeline transform pixel state without scrolling Variables. |
| `ctldap` | string | (user setting) | no | Path to the ctldap binary.  Overrides the `ctl.ctldapPath` user setting for this configuration. |

## Settings

- **`ctl.ctldapPath`** — absolute path to ctldap.  Auto-populated on
  first use; you can override it manually under VS Code Settings →
  Extensions → CTL Debug, or via the **CTL: Locate ctldap binary…**
  command.
- **`ctl.openProgramOnLaunch`** (default `true`) — when F5 starts a
  CTL session, also open the `.ctl` file(s) referenced by the launch
  configuration in the editor.  Useful for chain configs where you'd
  otherwise have to hunt down each stage.  To preview a config's
  files without launching, run **CTL: Open files for a launch
  configuration…** from the palette.

## Multi-stage chains

Use `programs` + `functions` + `modulePaths` to debug a pipeline where one
transform feeds the next.  The output pixel of each stage becomes the input
pixel of the following stage; breakpoints fire in every file along the chain.

Example — ACES IDT → RRT → ODT:

```json
{
    "type": "ctl",
    "request": "launch",
    "name": "Debug ACES chain (IDT → RRT → ODT)",
    "programs": [
        "${workspaceFolder}/IDT.ctl",
        "${workspaceFolder}/RRT.ctl",
        "${workspaceFolder}/ODT.ctl"
    ],
    "pixel": [0.18, 0.18, 0.18],
    "modulePaths": ["${workspaceFolder}/aces-dev/transforms/ctl/lib"]
}
```

`functions` is omitted because all three entrypoints are named `main`.
If any stage uses a different entrypoint, supply a parallel array; entries
that are still `main` can be passed as the literal string `"main"` or
left empty:

```json
"programs":  ["IDT.ctl",   "RRT.ctl", "ODT.ctl"],
"functions": ["IDT::run",  "main",    "main"]
```

`modulePaths` entries are prepended to the module search path, before
`$CTL_MODULE_PATH` and the per-file parent directories that are always
appended automatically.

## Known limitations (v1)

- Single-pixel only.  For image-level bugs, narrow to one pixel first.

These will be addressed as needs surface in real use.
