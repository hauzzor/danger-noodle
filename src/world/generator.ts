import { World } from "../sim/world";

const SPAWN = { x: 0, y: 0 };
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
}

export function createWorld(seed: number): World {
  const world = new World();
  world.seed = seed;
  createStarterCreature(world);
  return world;
}
