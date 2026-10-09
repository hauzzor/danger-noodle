import { mulberry32 } from "../engine/rng";
import { groundY } from "../sim/terrain";
import { World } from "../sim/world";
import type { BlockType, SensorKind } from "../sim/types";

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

  const loose: [BlockType, SensorKind | null][] = [
    ["sensor", "goal"],
    ["sensor", "food"],
    ["contract", null],
    ["contract", null],
    ["grip", null],
    ["grip", null],
    ["basic", null],
    ["basic", null],
    ["basic", null],
    ["basic", null],
    ["heart", null],
  ];
  loose.forEach(([type, sensor]) => {
    const bond = Math.floor(Math.random() * world.bonds.length);
    world.spawnTravellerOnBond(bond, type, sensor);
  });
}

function randomPart(rand: () => number): [BlockType, SensorKind | null] {
  const r = rand();
  if (r < 0.4) return ["basic", null];
  if (r < 0.6) return ["contract", null];
  if (r < 0.75) return ["grip", null];
  if (r < 0.9) return ["heart", null];
  return ["sensor", (["touch", "goal", "food", "tilt", "stretch"] as SensorKind[])[Math.floor(rand() * 5)]];
}

export function createWorld(seed: number): World {
  const world = new World();
  const rand = mulberry32(seed);

  let x = 7;
  while (x < 340) {
    const kind = rand() < 0.5 ? "rock" : "tree";
    const r = kind === "rock" ? 0.5 + rand() * 0.6 : 0.35 + rand() * 0.3;
    world.obstacles.push({ x, y: groundY(x) - r * 0.4, r, kind });
    x += 7 + rand() * 9;
  }

  x = 9;
  while (x < 340) {
    const [type, sensor] = randomPart(rand);
    const cy = groundY(x) - 0.6;
    world.collectibles.push({
      id: world.newId(),
      type,
      sensorKind: sensor,
      x,
      y: cy,
      px: x,
      py: cy,
      radius: 0.22,
      collected: false,
    });
    x += 4 + rand() * 7;
  }

  createStarterCreature(world);
  world.goal = { x: 45 + Math.floor(rand() * 8), y: groundY(45) - 1 };
  return world;
}
