import { World } from "../sim/world";
import type { BlockType, Traveller } from "../sim/types";
import type { Progress } from "../game/state";

export interface Snapshot {
  version: number;
  timestamp: number;
  progress: Progress;
  time: number;
  blobs: {
    id: number;
    type: BlockType;
    x: number;
    y: number;
    px: number;
    py: number;
    radius: number;
  }[];
  bonds: { a: number; b: number; rest: number; stiffness: number }[];
  travellers: { type: BlockType; from: number; to: number; t: number; speed: number }[];
  collectibles: { type: BlockType; x: number; y: number; radius: number }[];
}

export function serialize(world: World, progress: Progress): Snapshot {
  return {
    version: 3,
    timestamp: Date.now(),
    progress: { ...progress },
    time: world.time,
    blobs: world.activeBlobs().map((b) => ({
      id: b.id,
      type: b.type,
      x: b.x,
      y: b.y,
      px: b.px,
      py: b.py,
      radius: b.radius,
    })),
    bonds: world.bonds
      .filter((bond) => bond.active)
      .map((bond) => ({
        a: world.blobs[bond.a].id,
        b: world.blobs[bond.b].id,
        rest: bond.rest,
        stiffness: bond.stiffness,
      })),
    travellers: world.travellers.map((t) => ({
      type: t.type,
      from: world.blobs[t.from].id,
      to: world.blobs[t.to].id,
      t: t.t,
      speed: t.speed,
    })),
    collectibles: world.collectibles.map((c) => ({
      type: c.type,
      x: c.x,
      y: c.y,
      radius: c.radius,
    })),
  };
}

export function deserialize(data: Snapshot): { world: World; progress: Progress } {
  const world = new World();
  world.time = data.time ?? 0;

  const idMap = new Map<number, number>();
  for (const bd of data.blobs) {
    const blob = world.addBlob("basic", bd.x, bd.y, bd.radius);
    blob.px = bd.px;
    blob.py = bd.py;
    idMap.set(bd.id, blob.id);
  }

  for (const bond of data.bonds) {
    const a = world.blobs[(idMap.get(bond.a) ?? 0) - 1];
    const b = world.blobs[(idMap.get(bond.b) ?? 0) - 1];
    if (a && b) world.restoreBond(a, b, bond.rest, bond.stiffness);
  }

  for (const t of data.travellers) {
    const fromId = idMap.get(t.from);
    const toId = idMap.get(t.to);
    if (fromId == null || toId == null) continue;
    const bondIndex = world.findBondIndex(fromId, toId);
    if (bondIndex < 0) continue;
    const bond = world.bonds[bondIndex];
    const traveller: Traveller = {
      id: world.newId(),
      type: "basic",
      from: bond.a,
      to: bond.b,
      bond: bondIndex,
      t: t.t,
      speed: t.speed,
      recent: [],
    };
    world.travellers.push(traveller);
  }

  for (const c of data.collectibles ?? []) {
    world.collectibles.push({
      id: world.newId(),
      type: "basic",
      x: c.x,
      y: c.y,
      px: c.x,
      py: c.y,
      radius: c.radius,
      collected: false,
    });
  }

  return { world, progress: { seed: data.progress?.seed ?? Math.floor(Math.random() * 1e9) } };
}

const PREFIX = "danger-noodle:slot:";

export function saveSlot(name: string, data: Snapshot): void {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(data));
  } catch (err) {
    console.error("save failed", err);
  }
}

export function loadSlot(name: string): Snapshot | null {
  const raw = localStorage.getItem(PREFIX + name);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

export function exportSnapshot(data: Snapshot): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `danger-noodle-${data.progress.seed}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importSnapshot(): Promise<Snapshot | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(String(reader.result)) as Snapshot);
        } catch {
          resolve(null);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}
