import { mulberry32 } from "../engine/rng";
import { groundY } from "../sim/terrain";
import type { BlockType } from "../sim/types";
import { World } from "../sim/world";

const SPAWN = { x: -1.8, y: -10 };
const BODY_POINTS: [number, number][] = [
  [0, 0],
  [2.2, 0],
  [4.4, 0],
  [1.1, -1.907],
  [3.3, -1.907],
];
const BODY_BONDS: [number, number][] = [
  [0, 1],
  [1, 2],
  [3, 4],
  [0, 3],
  [1, 3],
  [1, 4],
  [2, 4],
];

export function createStarterCreature(world: World): void {
  const ids = BODY_POINTS.map(([x, y]) => world.addBlob("basic", x + SPAWN.x, y + SPAWN.y));
  for (const [a, b] of BODY_BONDS) world.addBond(ids[a], ids[b]);

  for (let i = 0; i < 6; i++) {
    const bond = world.randomActiveBond();
    if (bond >= 0) world.spawnTravellerOnBond(bond, "basic");
  }

  // One generator loose block rides the starter body from the start.
  const genBond = world.randomActiveBond();
  if (genBond >= 0) world.spawnTravellerOnBond(genBond, "generator");

  // ...and one contractor, so signals can be wired up right away.
  const conBond = world.randomActiveBond();
  if (conBond >= 0) world.spawnTravellerOnBond(conBond, "contractor");
}

export function createWorld(seed: number): World {
  const world = new World();
  const rand = mulberry32(seed);

  let x = 8;
  while (x < 600) {
    const cy = groundY(x) - 1.0;
    const r = rand();
    const type: BlockType = r < 0.15 ? "generator" : r < 0.3 ? "contractor" : "basic";
    world.addFreeTraveller(type, x, cy);
    x += 16 + rand() * 24;
  }

  createStarterCreature(world);
  return world;
}
