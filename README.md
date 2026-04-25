# CTL Debug

Single-pixel debugger for CTL (Color Transform Language) modules,
integrated into VS Code via the Debug Adapter Protocol.

## Features

- **Gutter breakpoints** — click in the gutter of any `.ctl` file to set a
  breakpoint.
- **Variable inspection** — paused at a breakpoint, the Variables panel
  shows every local + input/output arg in scope.
- **Hover-to-evaluate** — hover over a variable name in the source to see
  its current value.
- **Step into / over / out** — F11 / F10 / Shift+F11.
- **Call stack** — Call Stack panel shows nested function calls with
  their function names.
- **Watch expressions** — variable names work; CTL expression evaluation
  is not yet supported.
- **Syntax highlighting** for `.ctl` files (basic — keywords + types +
  numbers + strings).

## Requirements

- The `ctldap` binary built from this repository (CTL with
  `-DCTL_ENABLE_DEBUGGER=ON`).  Either install it on `PATH` or specify
  the absolute path in `launch.json`'s `ctldap` field.

## Quickstart

1. Open a `.ctl` file.
2. Run and Debug panel → "create a launch.json" → pick "CTL Single-Pixel Debugger".
3. Edit `function`, `pixel`, and `ctldap` in the generated launch.json.
4. Set breakpoints in the gutter.
5. F5 to debug.

See `SMOKE_TEST.md` for a step-by-step verification flow.

## launch.json reference

| field | type | default | description |
|---|---|---|---|
| `program` | string | `${file}` | Path to the `.ctl` to debug |
| `function` | string | `"main"` | CTL function to invoke (qualified, e.g., `myns::main`) |
| `pixel` | number[] | `[0.5, 0.5, 0.5]` | Pixel value (3 or 4 floats) bound to inputs `rIn`/`gIn`/`bIn`/`aIn` |
| `stopOnEntry` | boolean | `false` | Pause on the first instruction |
| `ctldap` | string | `"ctldap"` | Path to the ctldap binary |

## Known limitations (v1)

- Single-pixel only.  For image-level bugs, narrow to one pixel first.
- Only the topmost stack frame's variables are inspectable; deeper frames show empty.
- Watch expressions support bare variable names only.
- The Debug Console doesn't yet support arbitrary expression evaluation.

These will be addressed as needs surface in real use.
