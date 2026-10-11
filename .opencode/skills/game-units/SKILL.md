---
name: game-units
description: The Danger Noodle length convention. Use whenever adding or changing any distance, radius, spacing, bond length, drag clamp, or pick radius in the simulation. All unitless distances are game units; one game unit is the diameter of the basic building block.
---

# Game units

The simulation measures length in **game units**.

- **1 game unit = the diameter of the basic building block.**
- The basic block radius is half a unit (`BLOB_RADIUS = 0.5`).
- World coordinates are expressed directly in game units, so `UNIT` is `1.0`
  (`src/sim/units.ts`). Keep the unit explicit anyway, so the scale can change
  in one place later.

## The rule

Whenever a distance is used **without** a physical unit (a plain number of
world units), it refers to this game unit — not to pixels, metres, or tiles.

- Prefer expressing distances as multiples of the unit: `units(1)`, `units(3)`.
- Use the shared constants rather than hardcoding numbers:
  - `BLOB_RADIUS` — block radius (½ unit)
  - `COLLECTIBLE_RADIUS`
  - `MIN_BOND_DIST` / `MAX_BOND_DIST` — legal beam length range (1–3 units)
- Screen-space values (pixels) are **not** game units. `camera.zoom` is pixels
  per game unit; rendering widths are derived from `zoom` and are not gameplay
  distances.

## Current unit-denominated values

| Constant / value      | Units | Meaning                                  |
| --------------------- | ----- | ---------------------------------------- |
| `UNIT`                | 1.0   | world length of one game unit            |
| `BLOB_RADIUS`         | 0.5   | basic block radius (diameter = 1 unit)   |
| `TRAVELLER_RADIUS`    | 0.35  | loose block (traveller) radius           |
| `MIN_BOND_DIST`       | 2     | shortest allowed beam                    |
| `MAX_BOND_DIST`       | 3     | longest allowed beam (three diameters)   |
| traveller pick radius | 0.24  | attached traveller hit radius            |
| blob pick radius      | 0.6   | block / free-traveller hit radius        |
| beam pick tolerance   | 0.5   | grab a block by pressing a beam          |

## When editing

1. Check whether the number is a distance. If so, express it in game units and
   reference `src/sim/units.ts`.
2. If you change the block's size, update `BLOB_RADIUS`/`UNIT` here and re-derive
   the dependent constants (bond range, pick radii, drag clamp, spawn spacing).
3. Keep dynamics (gravity, traveller speed, camera zoom) tuned by hand when the
   unit scale changes so motion and framing still feel right.
