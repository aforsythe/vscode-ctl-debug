#!/bin/bash
#
# capture-screenshots.sh — guided walkthrough that captures every
# screenshot the README references.  You're still pointing at things
# and clicking the gutter; this script just sequences the scenes,
# tells you what to put in each frame, and drives `screencapture` to
# save the output to media/ with the right filename.
#
# Requires:
#   - macOS (uses /usr/sbin/screencapture)
#   - VS Code on PATH as `code`
#   - a built ctldap (env CTLDAP=/path/to/ctldap, or on PATH)
#
# Run:
#   ./scripts/capture-screenshots.sh
#
# Each step prints what to set up, then waits for ENTER.  When you hit
# ENTER, the script invokes `screencapture -i -W` — your cursor turns
# into a camera; CLICK the VS Code window to capture it.  The PNG
# saves directly into media/ at the right filename.

set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
EXT_ROOT="$(cd "$HERE/.." && pwd)"
MEDIA="$EXT_ROOT/media"
DEMO_WS="/tmp/ctl-debug-vscode-demo"

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------

require() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "missing command: $1 ($2)" >&2
        exit 1
    fi
}
require code "install VS Code and add it to PATH (Cmd-Shift-P → Shell Command: Install code)"
require screencapture "macOS only — this script doesn't run elsewhere"

# Resolve ctldap, in this priority order:
#   1. CTLDAP env var
#   2. ctldap on $PATH
#   3. ctl.ctldapPath setting in VS Code user settings (where the
#      extension auto-saves it on first use — the most likely
#      already-set source for anyone running this script)
#   4. $CTL_SRC/build*/ctldap/ctldap (matches launch-demo.sh)
#   5. Common CTL clone locations relative to $HOME/Source
#
# Reports every miss + a concrete copy-pasteable command on failure.

resolve_ctldap() {
    local cand
    if [ -n "${CTLDAP:-}" ] && [ -x "$CTLDAP" ]; then
        echo "$CTLDAP"; return
    fi
    cand="$(command -v ctldap 2>/dev/null || true)"
    if [ -n "$cand" ] && [ -x "$cand" ]; then
        echo "$cand"; return
    fi
    # VS Code user settings (macOS).  Use python3 so we don't pull in
    # jq as a dep; missing/malformed file → empty result.
    local settings="$HOME/Library/Application Support/Code/User/settings.json"
    if [ -f "$settings" ]; then
        cand="$(python3 - "$settings" <<'PY'
import json, sys
try:
    with open(sys.argv[1]) as f:
        # VS Code allows comments + trailing commas in settings.json,
        # which strict json.load chokes on.  Strip line/block comments
        # the cheap way before parsing.
        import re
        raw = f.read()
        raw = re.sub(r'//[^\n]*', '', raw)
        raw = re.sub(r'/\*.*?\*/', '', raw, flags=re.S)
        cfg = json.loads(raw)
    print(cfg.get("ctl.ctldapPath", "") or "")
except Exception:
    print("")
PY
        )"
        if [ -n "$cand" ] && [ -x "$cand" ]; then
            echo "$cand"; return
        fi
    fi
    if [ -n "${CTL_SRC:-}" ]; then
        for sub in build-dbg-on/ctldap/ctldap build-dbg/ctldap/ctldap build/ctldap/ctldap; do
            if [ -x "$CTL_SRC/$sub" ]; then echo "$CTL_SRC/$sub"; return; fi
        done
    fi
    # Common dev-machine clone locations.  Globs expand in arg position.
    for root in \
        "$HOME/Source/CTL" \
        "$HOME/Source/CTL/.worktrees"/* \
        "$HOME/CTL" \
        "$HOME/src/CTL"; do
        for sub in build-dbg-on/ctldap/ctldap build-dbg/ctldap/ctldap build/ctldap/ctldap; do
            if [ -x "$root/$sub" ]; then echo "$root/$sub"; return; fi
        done
    done
    echo ""
}

CTLDAP="$(resolve_ctldap)"
if [ -z "$CTLDAP" ]; then
    cat >&2 <<EOF
ctldap binary not found.  Tried, in order:
  - CTLDAP env var:                    ${CTLDAP:-(unset)}
  - ctldap on \$PATH:                   $(command -v ctldap 2>/dev/null || echo "(not found)")
  - ctl.ctldapPath in VS Code settings: (unset or invalid)
  - \$CTL_SRC/build*/ctldap/ctldap:     ${CTL_SRC:-(CTL_SRC unset)}
  - common clone locations:            \$HOME/Source/CTL, \$HOME/CTL, \$HOME/src/CTL

Fix one of:

  # Point at an existing build:
  CTLDAP=/path/to/ctldap $0

  # Or point at a CTL source root (script will probe build*/ctldap/ctldap):
  CTL_SRC=/path/to/CTL $0

  # Or build it from the CTL repo (https://github.com/ampas/CTL):
  cd /path/to/CTL
  cmake -B build-dbg-on -DCMAKE_BUILD_TYPE=Debug -DCTL_ENABLE_DEBUGGER=ON
  cmake --build build-dbg-on --target ctldap -j8
EOF
    exit 1
fi
echo "[boot] ctldap: $CTLDAP"

mkdir -p "$MEDIA"

# ---------------------------------------------------------------------------
# Bootstrap the demo workspace once.  launch-demo.sh writes the temp
# workspace + spawns an Extension Development Host pointing at this
# repo's source.  We background it so the rest of the script can drive
# the capture sequence in the foreground.
# ---------------------------------------------------------------------------

cat <<EOF
=== ctl-debug screenshot capture ===

This walks you through every screenshot the README needs.  For each
shot you'll:
  1. read the "set up" block,
  2. follow the steps in VS Code (set BPs, pick the pixel, etc.),
  3. press ENTER,
  4. click the VS Code window when your cursor turns into a camera.

The PNG saves directly to:
  $MEDIA/<filename>.png

If you mis-capture a shot, re-run the script and skip to the bad one
with:  ./scripts/capture-screenshots.sh <shotname>

Press ENTER to launch the demo workspace and begin.
EOF
read -r

if ! pgrep -f "extensionDevelopmentPath=$EXT_ROOT" >/dev/null 2>&1; then
    echo "[boot] launching Extension Development Host…"
    CTLDAP="$CTLDAP" "$HERE/launch-demo.sh" --ctldap "$CTLDAP" >/dev/null 2>&1 &
    sleep 4
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# capture <filename> — interactive window capture, saved to media/<filename>.
capture() {
    local out="$MEDIA/$1"
    echo
    echo "  [📸] press ENTER, then click the VS Code window to capture →  $1"
    read -r
    screencapture -i -W "$out"
    if [ -f "$out" ]; then
        local px
        px=$(sips -g pixelWidth -g pixelHeight "$out" 2>/dev/null \
             | awk '/pixel(Width|Height)/ {printf "%s ", $2}')
        echo "  ✓ saved: $1 (${px}px)"
    else
        echo "  ✗ no file written (cancelled?  re-run to retry)" >&2
    fi
}

# step <name> <heredoc-on-stdin> — print the setup block, gate on
# command-line filter (if user named one or more shots, only run those).
step() {
    local name="$1"
    if [ "$#" -gt 1 ] && ! printf '%s\n' "$@" | grep -qx "$name"; then
        return 0  # skipped by user filter
    fi
    echo
    echo "----- $name --------------------------------------------------"
    cat
    capture "$name.png"
}

# Apply an optional filter from the command line: only matching shots run.
FILTER=("$@")

# ---------------------------------------------------------------------------
# 1. pixel-picker.png — status-bar quick-pick open
# ---------------------------------------------------------------------------
step "pixel-picker" "${FILTER[@]}" <<EOF
  In the spawned VS Code window:
    1. Click the bottom-left status-bar pixel indicator
       ("🎨 CTL pixel: 0.18, 0.18, 0.18").  The quick-pick dropdown
       opens at the top of the window with preset rows visible
       (mid-grey, white, saturated R/G/B, HDR over-range, custom).
    2. DO NOT pick anything — leave the dropdown open.

  Capture should include the dropdown (top of the window) AND the
  status-bar item (bottom-left).
EOF

# ---------------------------------------------------------------------------
# 2. inline-values.png — paused source with inline annotations
# ---------------------------------------------------------------------------
step "inline-values" "${FILTER[@]}" <<EOF
  1. Open demo.ctl in the workspace ($DEMO_WS/demo.ctl).
  2. Set a breakpoint on the `clamped[3] = clamp01_f3(gammaed);` line.
  3. F5.
  4. While paused, frame the source area so 4-6 lines of code are
     visible WITH inline value annotations next to identifiers
     (aces=[…], scaled=[…], etc.).  Variables panel can be hidden.

  Tight on the source — the headline is the inline annotations.
EOF

# ---------------------------------------------------------------------------
# 3. color-swatches.png — colored blocks next to RGB(A) variables
# ---------------------------------------------------------------------------
step "color-swatches" "${FILTER[@]}" <<EOF
  Same paused state as the previous shot.  Reframe so the colored
  swatch decorations next to aces / scaled / lifted are obvious.

  Pick a non-grey pixel via the status bar BEFORE this shot — the
  HDR over-range preset (1.5, 0.5, 0.2) gives a saturated orange
  that photographs well.  Restart the session (Cmd-Shift-F5) so
  the new pixel takes effect.
EOF

# ---------------------------------------------------------------------------
# 4. watch-panel.png — pinned arithmetic expressions
# ---------------------------------------------------------------------------
step "watch-panel" "${FILTER[@]}" <<EOF
  While still paused:
    1. In the WATCH section, click + and add these one at a time:
         scaled[0] * 2
         aces[0] + aces[1] + aces[2]
         (scaled[0] + scaled[1] + scaled[2]) / 3
         scaled[0] > 0.5
    2. Frame the WATCH panel + a sliver of source for context.

  Tight on the panel — show that all four entries have evaluated
  to numeric values (not "<unresolved>").
EOF

# ---------------------------------------------------------------------------
# 5. chain-output.png — Debug Console with → stage K of N: lines
# ---------------------------------------------------------------------------
step "chain-output" "${FILTER[@]}" <<EOF
  1. Stop the current session.
  2. Switch to the "Debug 3-stage chain" config from the Run-and-Debug
     dropdown (top-left).
  3. F5.  Let it run to completion (no breakpoints).
  4. Frame the Debug Console — should show:
         → stage 1 of 3: rOut=…, gOut=…, bOut=…
         → stage 2 of 3: …
         → stage 3 of 3: …
         → output: …
         [ctl-debug] session ended …
EOF

# ---------------------------------------------------------------------------
# 6. conditional-bp.png — Edit Breakpoint dialog open
# ---------------------------------------------------------------------------
step "conditional-bp" "${FILTER[@]}" <<EOF
  1. Open demo.ctl.
  2. Right-click an existing gutter breakpoint (or set one then
     right-click) → Edit Breakpoint.
  3. The inline editor opens above the line with two dropdowns:
       [ Expression ▼ ]   [ aces[0] > 0.5 && aces[1] < 0.3 ]
  4. Type a condition like  aces[0] > 0.5 && aces[1] < 0.3.
  5. Capture before pressing Enter — the dialog's the headline.
EOF

# ---------------------------------------------------------------------------
# 7. hero.png — the marketing shot
# ---------------------------------------------------------------------------
step "hero" "${FILTER[@]}" <<EOF
  This is THE shot — the one Marketplace browsers see first.  Pack
  in as many features as fit naturally in a single frame.

  Set up:
    1. Pixel: HDR over-range (1.5, 0.5, 0.2) so colors pop.
    2. Open demo.ctl.
    3. Set BPs in helper.ctl::soft_clip AND demo.ctl on
       `clamped[3] = …`.
    4. F5 → it'll pause first inside helper::soft_clip (depth 2).
    5. Make sure the layout shows ALL of:
         - Variables panel populated on the left
         - Inline values + color swatches on the right (source)
         - Call Stack panel showing 2 frames
         - Status-bar pixel indicator at bottom-left
         - Debug toolbar visible at the top
    6. Capture the full VS Code window (not just one panel).
EOF

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo
echo "=========================================================="
echo "  Captured screenshots:"
ls -la "$MEDIA"/*.png 2>/dev/null | awk '{print "    " $NF}'
echo
echo "  Review with:    open $MEDIA"
echo "  Re-do one:      ./scripts/capture-screenshots.sh <name>"
echo "                  (e.g. ./scripts/capture-screenshots.sh hero)"
echo "=========================================================="
