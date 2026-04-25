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

4. Edit the generated launch.json so it matches your function:

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

## Known v1 limitations

- One thread, one frame for variable inspection (deeper frames empty).
- Watch expressions only support bare variable names.
