import { mulberry32 } from "../engine/rng";
import { groundY } from "../sim/terrain";
import { World } from "../sim/world";

const SPAWN = { x: -0.9, y: -5 };
const BODY_POINTS: [number, number][] = [
  [0, 0],
  [0.9, 0],
  [1.8, 0],
  [0.45, -0.78],
  [1.35, -0.78],
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
  const ids = BODY_POINTS.map(([x, y]) => world.addBlob("basic", x + SPAWN.x, y + SPAWN.y, 0.24));
  for (const [a, b] of BODY_BONDS) world.addBond(ids[a], ids[b]);

  for (let i = 0; i < 6; i++) {
    const bond = world.randomActiveBond();
    if (bond >= 0) world.spawnTravellerOnBond(bond, "basic");
  }
}

export function createWorld(seed: number): World {
  const world = new World();
  const rand = mulberry32(seed);

  let x = 9;
  while (x < 340) {
    const cy = groundY(x) - 0.6;
    world.collectibles.push({
      id: world.newId(),
      type: "basic",
      x,
      y: cy,
      px: x,
      py: cy,
      radius: 0.22,
      collected: false,
    });
    x += 8 + rand() * 10;
  }

  createStarterCreature(world);
  return world;
}
