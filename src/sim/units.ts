// Game units.
//
// One game unit is the diameter of the basic building block. All unitless
// distances in the simulation refer to this unit. World coordinates are
// expressed in game units, so UNIT is currently 1.
export const UNIT = 1.0;

export const BLOB_RADIUS = 0.5 * UNIT;
export const COLLECTIBLE_RADIUS = 0.45 * UNIT;

export const MIN_BOND_DIST = 1 * UNIT;
export const MAX_BOND_DIST = 3 * UNIT;

export function units(n: number): number {
  return n * UNIT;
}
