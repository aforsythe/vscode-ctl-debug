# Manual smoke test for ctl-debug VS Code extension

Prerequisites:
- ctldap built and on PATH (or specify full path in launch config)
- VS Code installed
- The .vsix installed: `code --install-extension ctl-debug-0.1.0.vsix`

## Steps

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

2. Open the Run and Debug panel (Cmd+Shift+D / Ctrl+Shift+D).

3. Click "create a launch.json file" and pick "CTL Single-Pixel Debugger".

4. Edit the generated launch.json.  `function` is needed here because
   the smoke fixture's entrypoint is qualified as `smoke::main` (in a
   namespace) — for an unqualified top-level `main`, omit `function`
   entirely and the default is used:

       {
           "type": "ctl",
           "request": "launch",
           "name": "Debug smoke::main",
           "program": "${file}",
           "function": "smoke::main",
           "pixel": [1.5, 0, 0],
           "ctldap": "/path/to/build-dbg-on/ctldap/ctldap"
       }

5. Click in the gutter next to line 4 (`r = a + 1.0;`) to set a breakpoint.

6. Press F5 to start debugging.  The breakpoint icon should turn solid red.

7. Execution stops at line 4.  Expected:
   - Variables panel shows `rIn=1.5`, `a=3` (and possibly more).
   - Call Stack panel shows `smoke::main`.
   - Hover over `a` in the source → tooltip shows `a = 3`.

8. Press F10 (Step Over) → execution moves past the assignment.
9. Press F5 (Continue) → function returns; debug session ends.

If anything misbehaves, capture the output from "Debug Console" and the
DAP traffic via VS Code's "Debug: Show Trace" (Cmd+Shift+P).

## Optional: chain test

This section verifies that breakpoints fire in both stages of a two-file
chain using the fixture transforms from `ctldap/tests/`.

1. Locate the fixture files (created during the ctldap test suite build):

       FIXTURES=$CTL_SOURCE_ROOT/ctldap/tests
       # expected files:
       #   $FIXTURES/run_chain_stage1.ctl
       #   $FIXTURES/run_chain_stage2.ctl

2. Open VS Code at the fixtures directory:

       code $FIXTURES

3. Create `.vscode/launch.json` in that folder:

       {
           "version": "0.2.0",
           "configurations": [
               {
                   "type": "ctl",
                   "request": "launch",
                   "name": "chain smoke",
                   "programs": [
                       "${workspaceFolder}/run_chain_stage1.ctl",
                       "${workspaceFolder}/run_chain_stage2.ctl"
                   ],
                   "functions": ["stage1::main", "stage2::main"],
                   "pixel": [0.5, 0.5, 0.5],
                   "ctldap": "/path/to/build-dbg-on/ctldap/ctldap",
                   "stopOnEntry": false
               }
           ]
       }

   Adjust `ctldap` to the absolute path of your debug build.

4. Open `run_chain_stage1.ctl` and set a breakpoint on its first
   assignment line.

5. Open `run_chain_stage2.ctl` and set a breakpoint on its first
   assignment line.

6. Press F5 to start the chain debug session.

7. Expected — stage 1 fires first:
   - Execution halts at the breakpoint in `run_chain_stage1.ctl`.
   - Call Stack shows `stage1::main`.
   - Variables panel shows the input pixel values.
   - Press F5 (Continue).

8. Expected — stage 2 fires next:
   - Execution halts at the breakpoint in `run_chain_stage2.ctl`.
   - Call Stack shows `stage2::main`.
   - Variables panel shows the output of stage 1 as the new inputs.
   - Press F5 (Continue) → session ends.

If breakpoints do not fire in both files, check that the `programs` and
`functions` arrays are parallel and that both files are saved before
launching.

## Known v1 limitations

- One thread, one frame for variable inspection (deeper frames empty).
- Watch expressions only support bare variable names.
