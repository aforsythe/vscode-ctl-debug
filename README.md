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
3. The generated launch.json has sensible defaults — `function` defaults to `main`, so if your entrypoint is `main` the only field you typically need to set is the path to the `ctldap` binary (under `ctldap`).
4. Set breakpoints in the gutter.
5. F5 to debug.

The minimal launch.json (single file, entrypoint named `main`):

```json
{
    "type": "ctl",
    "request": "launch",
    "name": "Debug CTL",
    "program": "${file}",
    "ctldap": "/path/to/ctldap"
}
```

Override the entrypoint via `function` only when your CTL function is named something other than `main`:

```json
{ ..., "function": "myns::myEntry" }
```

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
| `pixel` | number[] | `[0.5, 0.5, 0.5]` | no | Pixel value (3 or 4 floats) bound to inputs `rIn`/`gIn`/`bIn`/`aIn` |
| `stopOnEntry` | boolean | `false` | no | Pause on the first instruction |
| `ctldap` | string | `"ctldap"` | no (but typically set) | Path to the ctldap binary |

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
- Only the topmost stack frame's variables are inspectable; deeper frames show empty.
- Watch expressions support bare variable names only.
- The Debug Console doesn't yet support arbitrary expression evaluation.

These will be addressed as needs surface in real use.
