import { World } from "../sim/world";
import { ALERT_SIGNAL_COLOR } from "../sim/palette";
import type { Blob, BlobKind, BlockType } from "../sim/types";

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

// Autonomous NPC creatures. Both species share the same wheel-like body (a
// 5-node ring, three flagella and a central eye) built outside the player's
// build rules (no travellers, welded directly); only the species and colour
// differ. A "basic" blob flees the player, a "predator" blob chases basic
// blobs; each relies on the alert signal its own eye fires and its own
// flagella accept, so signals never leak between creatures.
const NPC_RING = 5; // ring vertices
export const NPC_RADIUS = 2.2; // ring radius, in game units (unit = block diameter)
const NPC_FLAGELLA: number[] = [0, 2, 4]; // ring indices that are flagella

type NpcKind = Exclude<BlobKind, "player">;

interface NpcSpec {
  impulse: number; // flagella kick strength
  range: number; // how far the eye can spot prey, in game units
  period: number; // seconds between scans
}

// All three flagella paddle together along the signal direction, so speed scales
// with impulse / period and agility with a short period (frequent small nudges,
// little overshoot) versus a long period (big slow lunges, wide turns).
// So: basic = slow but agile, predator = fast but clumsy.
const NPC_SPECS: Record<NpcKind, NpcSpec> = {
  basic: { impulse: 0.1, range: 22, period: 0.6 },
  predator: { impulse: 0.5, range: 26, period: 0.9 },
};

export interface BlobPart {
  type: BlockType;
  x: number;
  y: number;
}

export interface BlobLayout {
  parts: BlobPart[];
  bonds: [number, number][];
}

// The shared wheel layout (five ring blocks, then the central eye) used both to
// build a creature and to draw its spawn ghost.
export function npcLayout(cx: number, cy: number): BlobLayout {
  const parts: BlobPart[] = [];
  for (let i = 0; i < NPC_RING; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / NPC_RING;
    parts.push({
      type: NPC_FLAGELLA.includes(i) ? "flagella" : "basic",
      x: cx + Math.cos(a) * NPC_RADIUS,
      y: cy + Math.sin(a) * NPC_RADIUS,
    });
  }
  parts.push({ type: "eye", x: cx, y: cy }); // centre
  const bonds: [number, number][] = [];
  for (let i = 0; i < NPC_RING; i++) {
    bonds.push([i, (i + 1) % NPC_RING]);
    bonds.push([i, NPC_RING]); // spoke to the eye
  }
  return { parts, bonds };
}

export function createNpcBlob(world: World, cx: number, cy: number, kind: NpcKind): number {
  const faction = world.newFaction();
  const spec = NPC_SPECS[kind];
  const layout = npcLayout(cx, cy);
  const blobs: Blob[] = layout.parts.map((part) => {
    const b = world.addBlob(part.type, part.x, part.y);
    b.faction = faction;
    b.kind = kind;
    if (part.type === "flagella") {
      b.acceptColors = [ALERT_SIGNAL_COLOR];
      b.impulse = spec.impulse;
    } else if (part.type === "eye") {
      b.fov = 360; // NPC eyes watch all around
      b.range = spec.range;
      b.period = spec.period;
    }
    return b;
  });
  for (const [a, c] of layout.bonds) {
    world.restoreBond(blobs[a], blobs[c], Math.hypot(blobs[c].x - blobs[a].x, blobs[c].y - blobs[a].y), 1);
  }
  return faction;
}

export function createBasicBlob(world: World, cx: number, cy: number): number {
  return createNpcBlob(world, cx, cy, "basic");
}

export function createPredatorBlob(world: World, cx: number, cy: number): number {
  return createNpcBlob(world, cx, cy, "predator");
}

// Place an NPC creature as close to (x, y) as possible without overlapping
// anything. Returns the new faction id, or null if no clear spot was found.
export function spawnNpcBlob(world: World, x: number, y: number, kind: NpcKind): number | null {
  if (spotIsClear(world, x, y)) return createNpcBlob(world, x, y, kind);
  for (let ring = 1; ring <= 12; ring++) {
    const r = ring * NPC_CLEARANCE;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (spotIsClear(world, px, py)) return createNpcBlob(world, px, py, kind);
    }
  }
  return null;
}

const NPC_COUNT = 4;
const PREDATOR_COUNT = 2;
const NPC_ORBIT_MIN = 14;
const NPC_ORBIT_MAX = 26;
// Minimum centre-to-block distance when picking a spawn spot. The blob's outer
// ring reaches NPC_RADIUS (2.2) from its centre, so keeping every existing block
// this far away leaves a full block-diameter gap and guarantees the new blob
// never overlaps another one.
const NPC_CLEARANCE = 5.0;
const NPC_SPAWN_TRIES = 80;

// True if a blob centred at (x, y) would not overlap any existing block.
function spotIsClear(world: World, x: number, y: number): boolean {
  for (const b of world.blobs) {
    if (b.removed) continue;
    if (Math.hypot(b.x - x, b.y - y) < NPC_CLEARANCE) return false;
  }
  return true;
}

function spawnNpcBlobs(world: World, seed: number): void {
  let s = (seed >>> 0) || 1;
  const rnd = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  // Try random spots until one is clear of every other blob; skip this NPC
  // rather than ever placing it on top of another.
  const place = (kind: NpcKind): void => {
    for (let attempt = 0; attempt < NPC_SPAWN_TRIES; attempt++) {
      const a = rnd() * Math.PI * 2;
      const d = NPC_ORBIT_MIN + rnd() * (NPC_ORBIT_MAX - NPC_ORBIT_MIN);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      if (!spotIsClear(world, x, y)) continue;
      createNpcBlob(world, x, y, kind);
      break;
    }
  };
  for (let i = 0; i < NPC_COUNT; i++) place("basic");
  for (let i = 0; i < PREDATOR_COUNT; i++) place("predator");
}

export function createWorld(seed: number): World {
  const world = new World();
  world.seed = seed;
  createStarterCreature(world);
  spawnNpcBlobs(world, seed);
  return world;
}
