#!/bin/bash
#
# One-command VS Code demo for the ctl-debug extension.
#
# What this does:
#   1. Builds ctldap if it's missing.
#   2. Generates a temp workspace at /tmp/ctl-debug-vscode-demo/ with a
#      single-file demo (demo.ctl + helper.ctl), a 2-stage chain
#      (stage1.ctl + stage2.ctl), and a launch.json with absolute paths
#      already filled in.
#   3. Launches VS Code in "Extension Development Host" mode pointing at
#      this directory, so the extension activates from source — no install,
#      no version skew, no `code --install-extension` step.
#   4. Opens demo.ctl in the editor.  Both launch configs have
#      stopOnEntry=false; F5 only pauses where you've set a breakpoint.
#
# After it launches, you should:
#   - Click the status-bar pixel indicator (bottom-left) to pick a test
#     pixel — that's what F5 will use.
#   - Click in the gutter to set a breakpoint.
#   - Press F5 to start debugging.
#   - Verify Variables panel + Call Stack panel + hover-to-evaluate work.
#

set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
WORKTREE="$(cd "$HERE/.." && pwd)"
BUILD="$WORKTREE/build-dbg-on"
CTLDAP="$BUILD/ctldap/ctldap"
WS="/tmp/ctl-debug-vscode-demo"

echo "== ctl-debug VS Code demo launcher =="
echo "  worktree: $WORKTREE"
echo "  ctldap:   $CTLDAP"
echo "  workspace: $WS"
echo

# 1. Build ctldap if needed.
if [ ! -x "$CTLDAP" ]; then
    echo "ctldap not found; building..."
    cmake -B "$BUILD" -S "$WORKTREE" \
        -DCMAKE_BUILD_TYPE=Debug -DCTL_ENABLE_DEBUGGER=ON 2>&1 | tail -3
    cmake --build "$BUILD" --target ctldap -j8 2>&1 | tail -3
    [ -x "$CTLDAP" ] || { echo "build failed"; exit 1; }
    echo
fi

# 2. Compile the TS extension if needed.
if [ ! -f "$HERE/out/extension.js" ]; then
    echo "extension TS not compiled; running npm install + compile..."
    (cd "$HERE" && npm install 2>&1 | tail -3 && npm run compile 2>&1 | tail -3)
    echo
fi

# 3. Generate the test workspace.
mkdir -p "$WS/.vscode"

# Workspace settings — force VS Code to allow gutter breakpoints in any
# language (default behavior in Extension Development Host doesn't always
# pick up our `languages` registration on first launch).
cat > "$WS/.vscode/settings.json" <<'EOF'
{
    "debug.allowBreakpointsEverywhere": true,
    "files.associations": { "*.ctl": "ctl" }
}
EOF

cat > "$WS/helper.ctl" <<'EOF'
// helper.ctl — shared utilities for the debugger demo.
//
// Functions and structs declared here are bare-name top-level (no
// namespace wrapper) so demo.ctl and the chain stages can call them
// directly after `import "helper";`.
//
// 🔍 In the debugger, F11 (Step Into) on a call to any helper from
//    demo.ctl jumps you straight here.  Shift+F11 (Step Out) returns.

//----------------------------------------------------------------------
// Tone-mapping parameters — packaged as a struct so the Variables
// panel renders them as an EXPANDABLE TREE.  Click the chevron next
// to `TONE` (or any other Tonemap-typed local) to drill into the
// individual fields.
//----------------------------------------------------------------------
struct Tonemap
{
    float highlight;     // input level above which soft-clip kicks in
    float shadow;        // additive lift applied to all channels
    float gamma;         // exponent for output encoding
};

const Tonemap TONE = { 1.0, 0.05, 2.2 };

//----------------------------------------------------------------------
// Soft-clip a single channel.  Below `threshold` it's an identity;
// above it the curve compresses asymptotically toward (threshold + 1).
//
// 🔍 The `if` branch is the natural place to set a CONDITIONAL BP:
//    right-click the gutter → Edit Breakpoint → `x > 1.5` to stop
//    only on highly-clipped values.
//----------------------------------------------------------------------
float
soft_clip(float x, float threshold)
{
    if (x < threshold)
    {
        return x;
    }
    float over = x - threshold;
    return threshold + over / (1.0 + over);
}

//----------------------------------------------------------------------
// sRGB-style per-channel gamma encode (with a guard for negatives).
//----------------------------------------------------------------------
float
gamma_encode(float x, float g)
{
    if (x < 0.0)
    {
        return 0.0;
    }
    return pow(x, 1.0 / g);
}

//----------------------------------------------------------------------
// Per-channel clamp on an RGB triple, written as an explicit loop so
// you can watch `out[]` populate one channel at a time.
//
// 🔍 Set a BP on `out[i] = ...` and F10 to step the loop.  The
//    Variables panel shows `out` evolving from [0,0,0] → [r,g,b].
//----------------------------------------------------------------------
float[3]
clamp01_f3(float in[3])
{
    float out[3];
    for (int i = 0; i < 3; i = i + 1)
    {
        if (in[i] < 0.0)
        {
            out[i] = 0.0;
        }
        else if (in[i] > 1.0)
        {
            out[i] = 1.0;
        }
        else
        {
            out[i] = in[i];
        }
    }
    return out;
}

//----------------------------------------------------------------------
// Add a scalar bias to every channel.
//----------------------------------------------------------------------
float[3]
add_f_f3(float k, float in[3])
{
    float out[3];
    for (int i = 0; i < 3; i = i + 1)
    {
        out[i] = k + in[i];
    }
    return out;
}

//----------------------------------------------------------------------
// 3x3 matrix-vector multiply, written as a nested loop.  Shows off
// nested-loop stepping AND struct field access in the inspector.
//----------------------------------------------------------------------
struct Matrix3
{
    float m[3][3];
};

float[3]
mat_mul_f33_f3(Matrix3 mat, float v[3])
{
    float out[3];
    for (int row = 0; row < 3; row = row + 1)
    {
        // 🔍 Set a BP here and F10 the inner loop — watch the
        //    accumulator `out[row]` build per matrix column.
        out[row] = 0.0;
        for (int col = 0; col < 3; col = col + 1)
        {
            out[row] = out[row] + mat.m[row][col] * v[col];
        }
    }
    return out;
}
EOF

cat > "$WS/demo.ctl" <<'EOF'
// demo.ctl — single-file ACES-style color transform.
//
// Walks an RGB pixel through exposure → soft-clip → shadow lift →
// per-channel matrix → gamma encode → clamp.  Every stage is a
// natural place to pause and inspect.
//
//======================================================================
// 🔍 DEBUGGER TUTORIAL — try these features in order
//======================================================================
//
//  1. STATUS-BAR PIXEL PICKER (bottom-left of the window)
//     Shows "CTL pixel: 0.18, 0.18, 0.18".  CLICK IT → pick a preset
//     (mid-grey, saturated R/G/B, HDR over-range, custom).  F5 always
//     uses whatever's there.
//
//  2. UNIFORM PARAMETER
//     `exposure` is a uniform input (in stops).  The launch.json sets
//     it to 1.0 (= 2× linear gain).  Edit launch.json to try -1, 0,
//     +2; or LOCK a config to a specific exposure.
//
//  3. GUTTER BREAKPOINT
//     Click the gutter next to line 60 (`float scaled[3]`) to set a BP,
//     then F5.  Execution pauses there.
//
//  4. INLINE VALUES
//     While paused, you'll see `aces=[0.18,0.18,0.18]`, `gain=2`, etc.
//     rendered next to the variable names in the source — no need to
//     scan the Variables panel for simple lookups.
//
//  5. COLOR SWATCHES
//     A small colored block appears next to RGB-shaped variables
//     (`aces`, `scaled`, `lifted`, …).  The actual color of the pixel
//     at each pipeline stage — debug your transform visually.
//
//  6. STRUCT EXPANSION
//     `TONE` (in helper.ctl) is a Tonemap struct.  In the Variables
//     panel under "Module", click the chevron next to TONE to expand
//     it into highlight / shadow / gamma fields.
//
//  7. STEP INTO HELPER
//     F11 on a call like `helper::soft_clip(scaled[i], TONE.highlight)`
//     descends into helper.ctl.  Step the body, then Shift+F11 to
//     return.  While inside soft_clip, click the "main" frame in the
//     Call Stack — Variables panel switches to MAIN's locals.
//
//  8. WATCH PANEL
//     Click `+` next to WATCH and add expressions:
//       aces[0] * gain
//       scaled[0] - aces[0]
//       (aces[0] + aces[1] + aces[2]) / 3
//     All re-evaluate on every pause.  Bare names, arithmetic,
//     comparisons, indexing, &&, || all supported.
//
//  9. CONDITIONAL BREAKPOINT
//     Right-click an existing BP → Edit Breakpoint → enter
//     `aces[0] > 0.5 && aces[2] < 0.3`.  Pauses only when the
//     condition is true.
//
// 10. LOGPOINT
//     Right-click the gutter → Add Logpoint → enter
//     `pixel = ${aces[0]}, ${aces[1]}, ${aces[2]}`
//     The Debug Console will print the values without pausing.
//
// 11. RESTART (Cmd-Shift-F5)
//     Re-runs the same launch with the current status-bar pixel.
//     Quicker than Stop → F5 when iterating colors.
//
// 12. FINAL OUTPUT
//     The Debug Console shows `→ output: rOut=…, gOut=…, bOut=…` at
//     termination, and `[ctl-debug] session ended — F5 to relaunch …`.
//
// For multi-stage debugging, switch to the "Debug 3-stage chain"
// configuration in the dropdown at the top of Run-and-Debug.
//======================================================================

import "helper";

const float SHADOW_LIFT = 0.05;

void
main(input  varying float rIn,
     input  varying float gIn,
     input  varying float bIn,
     output varying float rOut,
     output varying float gOut,
     output varying float bOut,
     input  uniform float exposure = 0.0)
{
    // Pack the per-channel inputs into a working float[3].
    float aces[3] = {rIn, gIn, bIn};

    // Apply exposure as a 2^stops gain.  `gain` is a scalar local;
    // hover over it to see the value.
    float gain = pow(2.0, exposure);

    // Per-channel gain via an explicit loop.  Watch `scaled[]` populate
    // one channel at a time.
    float scaled[3];
    for (int i = 0; i < 3; i = i + 1)
    {
        scaled[i] = aces[i] * gain;
    }

    // Soft-clip highlights — F11 here drops into helper::soft_clip
    // (TONE.highlight is the threshold from helper.ctl's Tonemap struct).
    float clipped[3];
    for (int i = 0; i < 3; i = i + 1)
    {
        clipped[i] = soft_clip(scaled[i], TONE.highlight);
    }

    // Shadow lift — additive bias on every channel.
    float lifted[3] = add_f_f3(SHADOW_LIFT, clipped);

    // Per-channel gamma encode using the helper's TONE.gamma constant.
    float gammaed[3];
    for (int i = 0; i < 3; i = i + 1)
    {
        gammaed[i] = gamma_encode(lifted[i], TONE.gamma);
    }

    // Final clamp into [0, 1].
    float clamped[3] = clamp01_f3(gammaed);

    // Decompose back to per-channel outputs.
    rOut = clamped[0];
    gOut = clamped[1];
    bOut = clamped[2];
}
EOF

cat > "$WS/stage1.ctl" <<'EOF'
// stage1.ctl — Input Device Transform (IDT).
//
// First of three stages.  Linearises + clamps + applies user exposure.
// Hands `rOut`/`gOut`/`bOut` to stage 2.
//
// 🔍 Chain debugging: when this stage finishes, the Debug Console
//    shows "→ stage 1 of 3: rOut=…, gOut=…, bOut=…", then execution
//    continues into stage 2.  Set BPs in EACH stage to walk through
//    the whole pipeline; the Call Stack reflects the active stage.

import "helper";

namespace stage1
{

const float MAX_INPUT = 4.0;     // hard ceiling: 4× linear over

void
main(input  varying float rIn,
     input  varying float gIn,
     input  varying float bIn,
     output varying float rOut,
     output varying float gOut,
     output varying float bOut,
     input  uniform float exposure = 0.0)
{
    float pixel[3] = {rIn, gIn, bIn};

    // 2^exposure gain via loop.
    float gain = pow(2.0, exposure);
    for (int i = 0; i < 3; i = i + 1)
    {
        pixel[i] = pixel[i] * gain;
    }

    // 🔍 Hard-clip values above MAX_INPUT.  Run with an HDR pixel
    //    (e.g. 4,4,4) to step the if-branch; with mid-grey it never
    //    fires.
    for (int i = 0; i < 3; i = i + 1)
    {
        if (pixel[i] > MAX_INPUT)
        {
            pixel[i] = MAX_INPUT;
        }
    }

    rOut = pixel[0];
    gOut = pixel[1];
    bOut = pixel[2];
}

}
EOF

cat > "$WS/stage2.ctl" <<'EOF'
// stage2.ctl — Reference Rendering Transform (RRT)-like tone curve.
//
// Receives stage1's outputs (mapped to rIn/gIn/bIn by the chain
// debugger), soft-clips highlights, lifts shadows, hands to stage 3.
//
// 🔍 With the per-stage chain output, you'll see the value entering
//    this stage in the Debug Console line for stage 1.  Compare it
//    to the value entering stage 3 to see what the tone curve did.

import "helper";

namespace stage2
{

void
main(input  varying float rIn,
     input  varying float gIn,
     input  varying float bIn,
     output varying float rOut,
     output varying float gOut,
     output varying float bOut)
{
    float pixel[3] = {rIn, gIn, bIn};
    float toned[3];

    // Per-channel soft-clip + shadow lift.  F11 on `soft_clip(...)`
    // drops into helper.ctl; the Call Stack shows main → soft_clip.
    for (int i = 0; i < 3; i = i + 1)
    {
        float clipped = soft_clip(pixel[i], TONE.highlight);
        toned[i] = clipped + TONE.shadow;
    }

    rOut = toned[0];
    gOut = toned[1];
    bOut = toned[2];
}

}
EOF

cat > "$WS/stage3.ctl" <<'EOF'
// stage3.ctl — Output Device Transform (ODT).
//
// Last stage of the pipeline.  Applies a 3x3 color matrix (here the
// identity, so the demo output is recognisably whatever stage 2 fed
// in) and per-channel gamma encoding.
//
// 🔍 Two things to try here:
//   - Set a BP inside the matrix-multiply nested loop in helper.ctl's
//     mat_mul_f33_f3 (F11 from line 53 below).  Watch `out[row]`
//     accumulate one column at a time.
//   - In the Variables panel, expand SRGB_FROM_LINEAR to see the
//     struct's `m` field as an expandable 3x3 array.

import "helper";

namespace stage3
{

const Matrix3 SRGB_FROM_LINEAR = {
    { { 1.0, 0.0, 0.0 },
      { 0.0, 1.0, 0.0 },
      { 0.0, 0.0, 1.0 } }
};

void
main(input  varying float rIn,
     input  varying float gIn,
     input  varying float bIn,
     output varying float rOut,
     output varying float gOut,
     output varying float bOut)
{
    float pixel[3] = {rIn, gIn, bIn};

    // Matrix transform — F11 here drops into helper::mat_mul_f33_f3.
    float xyz[3] = mat_mul_f33_f3(SRGB_FROM_LINEAR, pixel);

    // Per-channel gamma encode.
    float encoded[3];
    for (int i = 0; i < 3; i = i + 1)
    {
        encoded[i] = gamma_encode(xyz[i], TONE.gamma);
    }

    // Final clamp.
    float final[3] = clamp01_f3(encoded);

    rOut = final[0];
    gOut = final[1];
    bOut = final[2];
}

}
EOF

cat > "$WS/.vscode/launch.json" <<EOF
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "ctl",
            "request": "launch",
            "name": "Debug demo.ctl (single file)",
            "program": "\${workspaceFolder}/demo.ctl",
            "function": "main",
            "params": { "exposure": 1.0 },
            "modulePaths": ["\${workspaceFolder}"],
            "stopOnEntry": false,
            "ctldap": "$CTLDAP"
        },
        {
            "type": "ctl",
            "request": "launch",
            "name": "Debug 3-stage chain (IDT → tone → ODT)",
            "programs": [
                "\${workspaceFolder}/stage1.ctl",
                "\${workspaceFolder}/stage2.ctl",
                "\${workspaceFolder}/stage3.ctl"
            ],
            "functions": ["stage1::main", "stage2::main", "stage3::main"],
            "params": { "exposure": 1.0 },
            "modulePaths": ["\${workspaceFolder}"],
            "stopOnEntry": false,
            "pixelEvolution": true,
            "ctldap": "$CTLDAP"
        }
    ]
}
EOF

echo "Workspace ready.  Launching VS Code (Extension Development Host)..."
echo
echo "When VS Code opens — open demo.ctl and read the tutorial header"
echo "(numbered list at the top of the file).  Quick tour:"
echo
echo "  1. Bottom-left status bar shows 'CTL pixel: 0.18, 0.18, 0.18'."
echo "     CLICK IT to pick a different test pixel (mid-grey, white,"
echo "     saturated R/G/B, HDR over-range, custom)."
echo "  2. Click in the gutter on any code line to set a breakpoint,"
echo "     then F5.  Watch INLINE VALUES, COLOR SWATCHES, and the"
echo "     Variables panel populate.  Hover any variable for its value."
echo "  3. F11 (Step In) on a helper call — descends into helper.ctl."
echo "     Click the 'main' frame in Call Stack to inspect main's locals"
echo "     while still inside the helper (deeper-frame inspection)."
echo "  4. Right-click a breakpoint → Edit Breakpoint to add a CONDITION,"
echo "     or Add Logpoint for a non-pausing print."
echo "  5. Cmd-Shift-F5 RESTARTS the current launch (picks up any new"
echo "     status-bar pixel without a full Stop → F5 cycle)."
echo
echo "TWO CONFIGURATIONS in the Run-and-Debug dropdown (top-left):"
echo "  - 'Debug demo.ctl (single file)' — the annotated tutorial."
echo "  - 'Debug 3-stage chain (IDT → tone → ODT)' — pipeline debug;"
echo "    each stage's outputs land in the Debug Console as 'stage N of 3'"
echo "    when the stage finishes; the pixel-evolution line shows every"
echo "    color-shaped local at every pause."
echo
echo "To LOCK a configuration to a specific pixel (overrides the status"
echo "bar), add a 'pixel' field to that entry in .vscode/launch.json."
echo
echo "Stuck?  View > Output > 'Log (Extension Host)' shows ctldap stderr."
echo "DAP-side trace will be written to /tmp/ctldap-trace.log (truncated each launch)."
echo

# Trace logging for the debugger.  Truncated each launch.  Comment out
# the export below once the debugger feels solid.
: > /tmp/ctldap-trace.log
export CTLDAP_TRACE=/tmp/ctldap-trace.log

exec code --extensionDevelopmentPath="$HERE" --disable-extensions "$WS" "$WS/demo.ctl"
