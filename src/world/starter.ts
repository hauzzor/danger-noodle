import { World } from "../sim/world";
import type { BlockType, Traveller } from "../sim/types";

const BODY_OFFSET = { x: -0.9, y: -5 };
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

const LOOSE_TYPES: BlockType[] = [
  "sensor",
  "contract",
  "contract",
  "grip",
  "grip",
  "basic",
  "basic",
  "basic",
  "basic",
  "basic",
  "basic",
];

export function createStarterWorld(): World {
  const world = new World();

  const ids = BODY_POINTS.map(([x, y]) =>
    world.addBlob("basic", x + BODY_OFFSET.x, y + BODY_OFFSET.y, 0.24),
  );
  for (const [a, b] of BODY_BONDS) world.addBond(ids[a], ids[b]);
  world.rebuildAdjacency();

  LOOSE_TYPES.forEach((type, i) => {
    const bond = Math.floor(Math.random() * world.bonds.length);
    const b = world.bonds[bond];
    const forward = Math.random() < 0.5;
    const traveller: Traveller = {
      id: i,
      type,
      from: forward ? b.a : b.b,
      to: forward ? b.b : b.a,
      bond,
      t: Math.random(),
      speed: 1.1 + Math.random() * 0.7,
      recent: [],
    };
    world.travellers.push(traveller);
  });

  return world;
}
