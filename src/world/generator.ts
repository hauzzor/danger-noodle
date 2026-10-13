import { World } from "../sim/world";
import { ALERT_SIGNAL_COLOR } from "../sim/palette";
import type { Blob, BlockType } from "../sim/types";

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

// An autonomous NPC "basic blob": a wheel-like creature with a body ring, a
// central eye and a few flagella. It is deliberately not built with the
// player's build rules (no travellers, welded directly), so it never grows or
// changes; it just floats and flees the player. Its flagella only accept the
// dedicated alert signal its own eye fires.
const NPC_RING = 5; // ring vertices
const NPC_RADIUS = 2.2; // ring radius, in game units (unit = block diameter)
const NPC_FLAGELLA: number[] = [0, 2, 4]; // ring indices that are flagella
const NPC_FLAGELLA_IMPULSE = 0.55; // half the previous 1.1 so fleeing reads calmer
const NPC_EYE_RANGE = 22; // how far an NPC can spot the player's structure
const NPC_EYE_PERIOD = 0.6; // seconds between scans (fires ~twice a second)

export function createBasicBlob(world: World, cx: number, cy: number): number {
  const faction = world.newFaction();
  const ring: Blob[] = [];
  for (let i = 0; i < NPC_RING; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / NPC_RING;
    const x = cx + Math.cos(a) * NPC_RADIUS;
    const y = cy + Math.sin(a) * NPC_RADIUS;
    const type: BlockType = NPC_FLAGELLA.includes(i) ? "flagella" : "basic";
    const b = world.addBlob(type, x, y);
    b.faction = faction;
    if (type === "flagella") {
      b.acceptColors = [ALERT_SIGNAL_COLOR];
      b.impulse = NPC_FLAGELLA_IMPULSE;
    }
    ring.push(b);
  }
  const eye = world.addBlob("eye", cx, cy);
  eye.faction = faction;
  eye.fov = 360; // NPC eyes watch all around
  eye.range = NPC_EYE_RANGE;
  eye.period = NPC_EYE_PERIOD;
  for (let i = 0; i < NPC_RING; i++) {
    const next = ring[(i + 1) % NPC_RING];
    world.restoreBond(ring[i], next, Math.hypot(next.x - ring[i].x, next.y - ring[i].y), 1);
    world.restoreBond(ring[i], eye, Math.hypot(eye.x - ring[i].x, eye.y - ring[i].y), 1);
  }
  return faction;
}

const NPC_COUNT = 4;
const NPC_ORBIT_MIN = 14;
const NPC_ORBIT_MAX = 26;

function spawnNpcBlobs(world: World, seed: number): void {
  let s = (seed >>> 0) || 1;
  const rnd = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < NPC_COUNT; i++) {
    const a = rnd() * Math.PI * 2;
    const d = NPC_ORBIT_MIN + rnd() * (NPC_ORBIT_MAX - NPC_ORBIT_MIN);
    createBasicBlob(world, Math.cos(a) * d, Math.sin(a) * d);
  }
}

export function createWorld(seed: number): World {
  const world = new World();
  world.seed = seed;
  createStarterCreature(world);
  spawnNpcBlobs(world, seed);
  return world;
}
