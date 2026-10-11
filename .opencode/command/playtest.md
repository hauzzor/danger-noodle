---
description: Play-test the Danger Noodle game in a real browser via the Playwright MCP (desktop + mobile) and report what breaks.
agent: build
---

Play-test the Danger Noodle game end-to-end in a real browser and report concrete, evidence-backed failures.

## Setup

1. Start the dev server in the background and wait until it responds:
   - `npm run dev`
   - URL: http://127.0.0.1:5173/danger-noodle/ (Vite `base` is `/danger-noodle/`).
   - Use `127.0.0.1`, not `localhost`: on Windows `localhost` resolves to `::1`, where another project's dev server may hold the port.
2. Use the `playwright` MCP to `browser_navigate` to that URL. Use `playwright-mobile` for the touch pass.

## Inspect (use the debug hook)

The dev build exposes `window.__dn` (see `src/app.ts` `debugApi()`). Use `browser_evaluate` to read/drive state instead of guessing:

- `__dn.worldSummary()` -> `{ blobs, bonds, travellers, collectibles }`
- `__dn.toScreen(x, y)` -> canvas pixel coords for a world position (for taps/drags)
- `__dn.getWorld()`, `__dn.getProgress()`, `__dn.getCamera()`, `__dn.getLoop()`
- `__dn.setSpeed(n)`, `__dn.regenerate()`, `__dn.clearCreature()`, `__dn.save()`, `__dn.load()`

The canvas fills the viewport; the top bar is a DOM overlay — avoid clicking through it. The radial menu and any panel need `pointer-events: auto` (see `src/style.css`).

## Checklist (desktop first, then iPhone 15)

1. Load: no console errors (a `favicon.ico` 404 is harmless). The 5-block body plus loose blocks render, and the body settles on the ground.
2. Tap a body blob -> radial menu opens with Delete.
3. Radial Delete works with a real click, and removes exactly that blob's own loose blocks (watch `worldSummary()`; no ghosts).
4. Attach a loose block: drag one onto the body; confirm `blobs` rises and `travellers` falls.
5. Reposition a body blob by dragging; confirm it does not explode (drop distance is clamped).
6. Pick up a collectible by moving the body over it; confirm a new loose block appears and the collectible disappears.
7. Save, then Load; confirm the state is restored (block/bond/traveller/collectible counts).
8. Pan and zoom (drag empty space, wheel / pinch).
9. Mobile pass: repeat taps/drags with the `playwright-mobile` profile.

## Known suspects to confirm/refute

- `world.ts` `removeBlob` filters travellers by blob id instead of index (wrong travellers removed / ghosts left).
- `persistence/save.ts` traveller `bond` resolution after load.
- Dragging a bonded blob far then releasing yanks violently (no distance clamp).
- Loose blocks overlapping body blobs shadow taps (pick priority).

## Report

For each checklist item: pass/fail, the exact reproduction (coordinates/steps), any console errors, and a screenshot path. End with a prioritised list of what actually does not work. Stop the dev server when done.
