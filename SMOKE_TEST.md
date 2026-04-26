# Manual smoke test for ctl-debug VS Code extension

There are two ways to verify the extension works end-to-end:

- **Quickest** — `make demo` from the [CTL repo](https://github.com/ampas/CTL)
  root (with the `feature/ctl-debugger` branch checked out — soon
  `master`).  Builds ctldap, generates a workspace with pre-wired
  launch.json, and launches VS Code in Extension Development Host
  mode pointing at this extension's source tree.  Jump to **Verify**
  below.
- **Standalone (this repo)** — run `./launch-demo.sh` from the
  extension repo root with a built ctldap available
  (`--ctldap PATH`, `CTLDAP=...` env, or on `$PATH`).  Same
  end-to-end behavior as `make demo` from CTL.
- **Manual install** — package the .vsix and install it into your
  primary VS Code instance, then drive it against your own files.
  Use this if you want to confirm the published-extension flow.

All three paths share the same in-VS-Code verification steps once
the session is running.

## Path A — `make demo` from the CTL repo (recommended)

From the CTL repo root:

```bash
make demo
```

This builds `build-dbg-on/ctldap/ctldap` if needed, writes a temp
workspace to `/tmp/ctl-debug-vscode-demo/`, and launches VS Code with
the extension loaded from source.  Two configs land in the Run-and-Debug
dropdown: **Debug demo.ctl** (single file with `import "helper"`) and
**Debug 3-stage chain** (three `.ctl` files chained).

Skip to **Verify** below.

## Path B — Manual install against your own .ctl

Prerequisites:
- ctldap built and on PATH (or its absolute path handy)
- VS Code installed
- The .vsix installed: `code --install-extension ctl-debug-0.1.0.vsix`

1. Create or open a .ctl file:

       cat > /tmp/smoke.ctl <<EOF
       namespace smoke {
       void main(output float r, input float rIn) {
           float a = rIn * 2.0;
           r = a + 1.0;
       }
       }
       EOF
       code /tmp/smoke.ctl

2. Cmd-Shift-P → **CTL: Initialize debug configuration**.  The
   extension picks the active `.ctl` file, auto-detects ctldap on
   PATH or in `build*/ctldap/ctldap` (file picker if neither finds
   it; the chosen path is saved to the `ctl.ctldapPath` setting),
   writes a minimal `.vscode/launch.json`, and opens it for review.

3. The `function` field defaults to `main`; for this fixture the
   entrypoint is `smoke::main`, so edit the `function` line to match:

       "function": "smoke::main",

   (For an unqualified top-level `main`, the default works as-is and
   you can omit `function` entirely.)

4. Note: there is **no `pixel` field** in the generated launch.json.
   The pixel comes from the live status-bar picker (see Verify, step 1).
   If you want this configuration to always use a specific value
   regardless of the picker, add a `pixel` field by hand:

       "pixel": [1.5, 0, 0]

## Verify

These steps apply to both paths.

1. Find the **CTL pixel** indicator in the bottom-left status bar —
   a small color-swatch icon followed by `CTL pixel: 0.18, 0.18, 0.18`.
   Click it and pick a non-default preset (e.g. **HDR over-range**).
   The status-bar text updates immediately; that's what F5 will send.

2. Click in the gutter on a line inside the function body to set a
   breakpoint.  The breakpoint icon should turn solid red once the
   debug session attaches; an unverified hollow icon is fine before
   F5.

3. Press F5.  Expected:
   - Execution stops at the breakpoint.
   - **Variables** panel shows the input args (e.g. `rIn` matching
     your status-bar pixel) plus any locals that have been assigned
     up to this line.
   - **Call Stack** panel shows the function name (e.g. `smoke::main`).
   - Hover over a variable in the source → tooltip shows its value.

4. F10 (Step Over) → execution moves to the next line.
   F11 (Step Into) on a function call → descends into the callee.
   Shift-F11 (Step Out) → returns from the callee.
   F5 (Continue) → runs to the next breakpoint or to termination.

5. Iterate the pixel: stop the session, click the status-bar
   indicator, pick a different value, F5 again.  No edits to
   launch.json required.

If anything misbehaves, capture the **Debug Console** output and the
DAP traffic via VS Code's "Debug: Show Trace" (Cmd-Shift-P).  The
ctldap server's stderr is also surfaced under View → Output → "Log
(Extension Host)".

## Optional: chain test

If you used `make demo`, this is already covered by the **Debug 2-stage
chain** entry in the dropdown — switch to it and repeat the Verify
steps above; breakpoints fire in both `stage1.ctl` and `stage2.ctl`.

To build a chain test against your own files, replace `program` /
`function` with `programs` / `functions` arrays in your launch.json:

```json
{
    "type": "ctl",
    "request": "launch",
    "name": "chain smoke",
    "programs": [
        "${workspaceFolder}/stage1.ctl",
        "${workspaceFolder}/stage2.ctl"
    ],
    "functions": ["stage1::main", "stage2::main"],
    "modulePaths": ["${workspaceFolder}"]
}
```

Stage `N+1`'s inputs are bound from stage `N`'s outputs by exact name
match (`rOut`→`rIn`, etc.).  Set a breakpoint in each stage; both
should fire in order.  If they don't, double-check that both files are
saved and that the `programs` and `functions` arrays are parallel.

## Known v1 limitations

- Single-pixel only (N=1) — no batch/image debugging.
