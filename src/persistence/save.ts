import { World } from "../sim/world";
import type { BlockType, Condition, Rule, SensorKind, ActionKind } from "../sim/types";
import type { Progress } from "../game/state";

export interface Snapshot {
  version: number;
  timestamp: number;
  progress: Progress;
  goal: { x: number; y: number };
  time: number;
  blobs: {
    id: number;
    type: BlockType;
    sensorKind: SensorKind | null;
    x: number;
    y: number;
    px: number;
    py: number;
    radius: number;
    contractAmount: number;
    emitInterval: number;
    emitType: string;
    rules: {
      trigger: string;
      condition: Condition | null;
      action: ActionKind;
      delay: number;
      duration: number;
    }[];
  }[];
  bonds: { a: number; b: number; rest: number; stiffness: number }[];
  travellers: { type: BlockType; sensorKind: SensorKind | null; from: number; to: number; bond: number; t: number; speed: number }[];
  collectibles: { type: BlockType; sensorKind: SensorKind | null; x: number; y: number; radius: number }[];
  obstacles: { x: number; y: number; r: number; kind: "rock" | "tree" }[];
}

export function serialize(world: World, progress: Progress): Snapshot {
  return {
    version: 1,
    timestamp: Date.now(),
    progress: { ...progress },
    goal: { ...world.goal },
    time: world.time,
    blobs: world.activeBlobs().map((b) => ({
      id: b.id,
      type: b.type,
      sensorKind: b.sensorKind,
      x: b.x,
      y: b.y,
      px: b.px,
      py: b.py,
      radius: b.radius,
      contractAmount: b.contractAmount,
      emitInterval: b.emitInterval,
      emitType: b.emitType,
      rules: b.rules.map((r: Rule) => ({
        trigger: r.trigger,
        condition: r.condition,
        action: r.action,
        delay: r.delay,
        duration: r.duration,
      })),
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
      sensorKind: t.sensorKind,
      from: world.blobs[t.from].id,
      to: world.blobs[t.to].id,
      bond: t.bond,
      t: t.t,
      speed: t.speed,
    })),
    collectibles: world.collectibles.map((c) => ({
      type: c.type,
      sensorKind: c.sensorKind,
      x: c.x,
      y: c.y,
      radius: c.radius,
    })),
    obstacles: world.obstacles.map((o) => ({ ...o })),
  };
}

export function deserialize(data: Snapshot): { world: World; progress: Progress } {
  const world = new World();
  world.obstacles = data.obstacles.map((o) => ({ ...o }));
  world.goal = { ...data.goal };
  world.time = data.time;

  const idMap = new Map<number, number>();
  for (const bd of data.blobs) {
    const blob = world.addBlob(bd.type, bd.x, bd.y, bd.radius, bd.sensorKind);
    blob.px = bd.px;
    blob.py = bd.py;
    blob.contractAmount = bd.contractAmount;
    blob.emitInterval = bd.emitInterval;
    blob.emitType = bd.emitType;
    for (const r of bd.rules) {
      blob.rules.push({
        id: world.newId(),
        trigger: r.trigger,
        condition: r.condition,
        action: r.action,
        delay: r.delay,
        duration: r.duration,
        busyUntil: 0,
      });
    }
    idMap.set(bd.id, blob.id);
  }

  for (const bond of data.bonds) {
    const a = world.blobs[(idMap.get(bond.a) ?? 0) - 1];
    const b = world.blobs[(idMap.get(bond.b) ?? 0) - 1];
    if (a && b) world.restoreBond(a, b, bond.rest, bond.stiffness);
  }

  for (const t of data.travellers) {
    const from = idMap.get(t.from);
    const to = idMap.get(t.to);
    if (from == null || to == null) continue;
    if (!world.bonds[t.bond] || !world.bonds[t.bond].active) continue;
    world.travellers.push({
      id: world.newId(),
      type: t.type,
      sensorKind: t.sensorKind,
      from: from - 1,
      to: to - 1,
      bond: t.bond,
      t: t.t,
      speed: t.speed,
      recent: [],
    });
  }

  for (const c of data.collectibles) {
    world.collectibles.push({
      id: world.newId(),
      type: c.type,
      sensorKind: c.sensorKind,
      x: c.x,
      y: c.y,
      px: c.x,
      py: c.y,
      radius: c.radius,
      collected: false,
    });
  }

  return { world, progress: { ...data.progress }, };
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
  a.download = `danger-noodle-${data.progress.level}.json`;
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
