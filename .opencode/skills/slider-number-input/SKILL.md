---
name: slider-number-input
description: Use whenever a slider (range input) is added to a context menu, radial menu, or any in-game control panel. Every slider must be paired with a numeric input next to it that shows the current value and can edit it directly.
---

# Sliders must be paired with a numeric input

In this project, **every slider shown in a context menu must also have a
numerical input beside it** that displays the slider's current value and lets
the player type/step an exact value. The two stay in sync.

This applies to the in-game context menu (the radial menu rendered from
`src/ui/radial.ts`) and any future context menu or control surface.

## Why

Sliders are good for quick, coarse changes but bad for exact values. Pairing the
two gives both: drag for feel, type for precision.

## How (radial menu)

The radial menu's `slider` item is defined in `src/ui/radial.ts`:

```ts
| { kind: "slider"; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }
```

When rendering a `slider` item, build **both** controls in one row:

- `<input type="range">` — the slider (`min`/`max`/`step`/`value`).
- `<input type="number">` — the numeric field, same `min`/`max`/`step`.

Rules:

1. Both inputs reflect the same clamped value.
2. Editing either one clamps to `[min, max]`, updates the other, and calls
   `onChange(value)`.
3. Neither control closes the menu (only `button` items do).
4. Do not add a `slider` item without the paired numeric input.

Reference implementation lives in `src/ui/radial.ts` (the `slider` branch); the
matching styles are in `src/style.css` (`.radial-control`, `.radial-number`).

## When adding a new slider

- Use the existing radial `slider` item type; it already renders the number
  input. Only add a bespoke control if the radial cannot express it, and then
  still include the numeric input.
- Keep the label short; the value lives in the number input, not the label.
