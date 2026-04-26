# Media — README screenshots + extension icon

Files in this directory are referenced by the top-level `README.md`
(which is what the VS Code Marketplace renders as the extension's
landing page).

## Required files

| File | Used in | Spec |
|---|---|---|
| `icon.png`            | `package.json` `icon` field | 128×128 PNG, opaque background, the extension's logo / mark |
| `hero.png`            | README, top of page         | 1920×~1100 PNG, the marketing shot — see "Hero" below |
| `pixel-picker.png`    | README, Features            | ~800px wide, status-bar pixel picker dropdown open |
| `inline-values.png`   | README, Features            | ~800px wide, paused source with inline values rendered |
| `color-swatches.png`  | README, Features            | ~800px wide, colored blocks next to RGB(A) variables |
| `watch-panel.png`     | README, Features            | ~600px wide, Watch panel with `aces[0] * 2`-style entries |
| `chain-output.png`    | README, Features            | ~800px wide, Debug Console showing `→ stage K of N: …` lines |
| `conditional-bp.png`  | README, Features            | ~700px wide, gutter context menu → Edit Breakpoint dialog with `if EXPR` |

PNG > JPG (sharp text), but a `.gif` for the hero is also fine if
you want to show the pixel-picker → status-bar update → F5 → pause
flow as a 5-second loop.

## Hero shot — what it should contain

The single image at the top of the README has to convince a
first-time visitor in two seconds that the extension is worth
installing.  Pack it with the things only this extension does:

1. A paused CTL session.
2. **Variables panel** populated on the left.
3. **Inline values** rendered next to identifiers in the source.
4. **Color swatches** visible (so it reads as "color tool", not
   generic debugger).
5. **Status-bar pixel picker** at the bottom-left edge.
6. **Call Stack** showing a multi-frame state.

Use `demo.ctl` from the CTL repo's `make demo` workspace — it's
designed for exactly this.

## Status: placeholders shipped, real captures pending

The `.png` files committed here right now are dark-themed
placeholders generated programmatically (filename + dimensions +
"TODO" watermark).  They exist so the README, the GitHub repo
preview, and the Marketplace listing all render cleanly during
bring-up — broken-image icons everywhere would look worse than a
"placeholder · capture this" hint.

Replace each one with a real screenshot before the first release tag.

## How to capture (the easy way)

A guided script handles everything except the actual mouse-click:

```sh
./scripts/capture-screenshots.sh
```

It launches the Extension Development Host once, then for each shot
prints what to set up in VS Code, waits for ENTER, and invokes
`screencapture -i -W` (cursor turns into a camera; click the window).
PNGs save directly to `media/` at the right filename and overwrite
the placeholders.

To redo just one shot after the initial pass:

```sh
./scripts/capture-screenshots.sh hero          # just the hero
./scripts/capture-screenshots.sh watch-panel pixel-picker   # multiple
```

## How to capture (manually)

1. Run `make demo` from the CTL repo (or `./scripts/launch-demo.sh`
   from this repo with a built ctldap).
2. In the spawned Extension Development Host:
   - Click the status-bar pixel picker → pick **HDR over-range
     (1.5, 0.5, 0.2)**.  Saturated colors photograph better than
     mid-grey.
   - Open `demo.ctl`.
   - Set a breakpoint on the `clamped[3]` line — by then `aces`,
     `scaled`, `lifted`, `gammaed` are all in scope as float[3]s,
     so the color swatches all show up.
   - F5 → pauses.
   - Cmd-Shift-4 → space → click the VS Code window.  macOS captures
     the active window; saves to `~/Desktop/Screen Shot ...png`.
3. Move into `media/`, rename to match the table above.
4. Trim if needed (`sips -c 1100 1920 hero.png`) and consider
   shrinking with `tinypng.com` to keep the .vsix slim.

## Icon

`icon.png` is a real (not-placeholder) 128×128 generated from
`icon.svg` via `sips`.  Three additive RGB primaries with a debug
play-arrow overlay — recognisable at 16px, color-themed, debug-
themed.  Replace if you'd rather a designed mark; the shape is just
a placeholder until someone with a stronger visual brand identity
takes a pass.

To regenerate from the SVG:

```sh
sips -s format png media/icon.svg --out media/icon.png
sips -z 128 128 media/icon.png
```

## Marketplace gotcha

Relative `media/foo.png` paths in README.md work on GitHub but the
Marketplace's renderer needs **absolute URLs**.  The `vsce package`
step rewrites these automatically when `package.json`'s
`repository.url` is set, BUT it only rewrites paths under
`media/`, `images/`, or `resources/` — that's why this dir is named
`media/` rather than something cute.  Don't move it.

## Adding more screenshots later

Drop the file in here and add a row to the table.  The README's
`<img>` tags use relative paths; nothing else to wire up.
