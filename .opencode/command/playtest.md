---
description: Play-test the Danger Noodle game in a real browser via the Playwright MCP (desktop + mobile) and report what breaks.
agent: build
---

Play-test the Danger Noodle game end-to-end in a real browser and report concrete, evidence-backed failures.

## Setup

1. Start the dev server in the background and wait until it responds:
   - `npm run dev`
   - URL: http://localhost:5173/danger-noodle/ (Vite `base` is `/danger-noodle/`).
2. Use the `playwright` MCP to `browser_navigate` to that URL. Use `playwright-mobile` for the touch pass.

## Inspect (use the debug hook)

The dev build exposes `window.__dn` (see `src/app.ts` `debugApi()`). Use `browser_evaluate` to read/drive state instead of guessing:

- `__dn.worldSummary()` -> `{ blobs, bonds, travellers, collectibles, pulses, goalReached, level, goal }`
- `__dn.toScreen(x, y)` -> canvas pixel coords for a world position (for taps/drags)
- `__dn.getWorld()`, `__dn.getProgress()`, `__dn.getCamera()`, `__dn.getLoop()`
- `__dn.addRule(blobId, { trigger, action, delay, duration })`, `__dn.setSpeed(n)`, `__dn.regenerate()`, `__dn.clearCreature()`, `__dn.save()`, `__dn.load()`

The canvas fills the viewport; the top bar and the properties panel are DOM overlays — avoid clicking through them.

## Checklist (desktop first, then iPhone 15)

1. Load: no console errors, the 5-block body plus travelling blocks render, the body settles on the ground.
2. Tap a body blob -> radial menu opens with Properties/Delete.
3. Open Properties -> add a rule -> confirm the rule row appears.
4. Attach a travelling block: drag one onto the body; confirm `blobs` count rises and `travellers` falls.
5. Wire a minimal gait and confirm motion: e.g. `addRule` grip on `beat` for grip blocks and `contract` on `beat` (staggered delays) for contract blocks, plus a heart with `emitType: beat`; confirm signal pulses appear and the body translates (goal distance in `worldSummary()` decreases).
6. Reposition a body blob by dragging; confirm it does not explode.
7. Delete a block via the radial; confirm the correct blob and its travellers are removed (watch `worldSummary()`).
8. Save, then Load; confirm the state is restored (block/traveller counts, goal).
9. Mobile pass: repeat taps/drags with the `playwright-mobile` profile.

## Known suspects to confirm/refute

- `world.ts` `removeBlob` filters travellers by blob id instead of index (wrong travellers removed / ghosts left).
- `persistence/save.ts` traveller `bond` index breaks on load (bond list is active-filtered).
- Load does not restore `emitTimer`, `gripActive`, `contractActive`, `pinned`, rule `busyUntil`.
- Dragging a bonded blob far then releasing yanks violently (no distance clamp).
- Starter has no rules and its ability blocks start as travellers, so nothing moves until programmed.

## Report

For each checklist item: pass/fail, the exact reproduction (coordinates/steps), any console errors, and a screenshot path. End with a prioritised list of what actually does not work. Stop the dev server when done.
