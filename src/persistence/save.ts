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
    emitOn: boolean;
    emitInterval: number;
    emitTimer: number;
  }[];
  bonds: { a: number; b: number; rest: number; stiffness: number }[];
  travellers: {
    type: BlockType;
    attached: boolean;
    from?: number;
    to?: number;
    t?: number;
    speed?: number;
    x?: number;
    y?: number;
  }[];
}

export function serialize(world: World, progress: Progress): Snapshot {
  return {
    version: 4,
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
      emitOn: b.emitOn,
      emitInterval: b.emitInterval,
      emitTimer: b.emitTimer,
    })),
    bonds: world.bonds
      .filter((bond) => bond.active)
      .map((bond) => ({
        a: world.blobs[bond.a].id,
        b: world.blobs[bond.b].id,
        rest: bond.rest,
        stiffness: bond.stiffness,
      })),
    travellers: world.travellers.map((t) =>
      t.attached
        ? { type: t.type, attached: true, from: world.blobs[t.from].id, to: world.blobs[t.to].id, t: t.t, speed: t.speed }
        : { type: t.type, attached: false, x: t.x, y: t.y },
    ),
  };
}

export function deserialize(data: Snapshot): { world: World; progress: Progress } {
  const world = new World();
  world.time = data.time ?? 0;

  const idMap = new Map<number, number>();
  for (const bd of data.blobs) {
    const blob = world.addBlob(bd.type ?? "basic", bd.x, bd.y, bd.radius);
    blob.px = bd.px;
    blob.py = bd.py;
    blob.emitOn = bd.emitOn ?? false;
    blob.emitInterval = bd.emitInterval ?? 1.5;
    blob.emitTimer = bd.emitTimer ?? 0;
    idMap.set(bd.id, blob.id);
  }

  for (const bond of data.bonds) {
    const a = world.blobs[(idMap.get(bond.a) ?? 0) - 1];
    const b = world.blobs[(idMap.get(bond.b) ?? 0) - 1];
    if (a && b) world.restoreBond(a, b, bond.rest, bond.stiffness);
  }

  for (const t of data.travellers ?? []) {
    const type: BlockType = t.type ?? "basic";
    if (t.attached) {
      const fromId = idMap.get(t.from ?? -1);
      const toId = idMap.get(t.to ?? -1);
      if (fromId == null || toId == null) continue;
      const bondIndex = world.findBondIndex(fromId, toId);
      if (bondIndex < 0) continue;
      const bond = world.bonds[bondIndex];
      const traveller: Traveller = {
        id: world.newId(),
        type,
        attached: true,
        x: 0,
        y: 0,
        px: 0,
        py: 0,
        radius: 0,
        from: bond.a,
        to: bond.b,
        bond: bondIndex,
        t: t.t ?? 0,
        speed: t.speed ?? 1.4,
        recent: [],
      };
      world.travellers.push(traveller);
    } else {
      world.addFreeTraveller(type, t.x ?? 0, t.y ?? 0);
    }
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
