import { groundY, groundSlope } from "./terrain";
import { updateTravellers } from "./travel";
import type {
  Blob,
  BlockType,
  Bond,
  Collectible,
  Neighbor,
  Obstacle,
  PendingAction,
  Pulse,
  Rule,
  SensorKind,
  Traveller,
  Vec2,
} from "./types";

export const HOP_TIME = 0.12;
export const MAX_HOPS = 42;
export const GOAL_RADIUS = 1.3;
export const MAX_STRAND = 1.5;

export class World {
  blobs: Blob[] = [];
  bonds: Bond[] = [];
  travellers: Traveller[] = [];
  collectibles: Collectible[] = [];
  obstacles: Obstacle[] = [];
  pulses: Pulse[] = [];
  goal: Vec2 = { x: 45, y: -2 };
  time = 0;
  goalReached = false;
  signalLog: { type: string; payload: number; time: number }[] = [];

  gravity = 20;
  damping = 0.99;
  iterations = 4;
  groundFriction = 0.5;
  maxBondsPerBlob = 6;

  private adj: Neighbor[][] = [];
  private nextId = 1;
  private nextPulse = 1;

  newId(): number {
    return this.nextId++;
  }

  addBlob(
    type: BlockType,
    x: number,
    y: number,
    radius = 0.24,
    sensorKind: SensorKind | null = null,
  ): Blob {
    const blob: Blob = {
      id: this.blobs.length + 1,
      type,
      sensorKind,
      x,
      y,
      px: x,
      py: y,
      radius,
      invMass: 1,
      pinned: false,
      gripActive: false,
      contractActive: false,
      contractAmount: 0.6,
      rules: [],
      pending: [],
      emitInterval: type === "heart" ? 2 : 1.5,
      emitTimer: type === "heart" ? 2 : 0,
      emitType: type === "heart" ? "beat" : (sensorKind ?? "touch"),
      onGround: false,
      removed: false,
    };
    this.blobs.push(blob);
    this.rebuildAdjacency();
    return blob;
  }

  activeBlobs(): Blob[] {
    return this.blobs.filter((b) => !b.removed);
  }

  getBlob(id: number): Blob | undefined {
    const b = this.blobs[id - 1];
    return b && !b.removed ? b : undefined;
  }

  addBond(a: Blob, b: Blob, stiffness = 1): number | null {
    if (a.id === b.id || a.removed || b.removed) return null;
    if (this.degree(a) >= this.maxBondsPerBlob || this.degree(b) >= this.maxBondsPerBlob) return null;
    const existing = this.adj[a.id - 1]?.some((n) => n.other === b.id);
    if (existing) return null;
    const rest = Math.hypot(b.x - a.x, b.y - a.y);
    const id = this.bonds.length;
    this.bonds.push({ a: a.id - 1, b: b.id - 1, rest, stiffness, active: true });
    this.rebuildAdjacency();
    return id;
  }

  degree(b: Blob): number {
    return this.adj[b.id - 1]?.length ?? 0;
  }

  restoreBond(a: Blob, b: Blob, rest: number, stiffness: number): void {
    this.bonds.push({ a: a.id - 1, b: b.id - 1, rest, stiffness, active: true });
    this.rebuildAdjacency();
  }

  removeTraveller(t: Traveller): void {
    this.travellers = this.travellers.filter((x) => x !== t);
  }

  nearbyBlobs(x: number, y: number, within: number): Blob[] {
    return this.activeBlobs()
      .filter((o) => Math.hypot(o.x - x, o.y - y) <= within)
      .sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y));
  }

  buildTravellerAt(t: Traveller, x: number, y: number): Blob | null {
    const near = this.nearbyBlobs(x, y, MAX_STRAND).filter((o) => this.degree(o) < this.maxBondsPerBlob);
    if (near.length === 0) {
      this.collectibles.push({
        id: this.newId(),
        type: t.type,
        sensorKind: t.sensorKind,
        x,
        y,
        px: x,
        py: y,
        radius: 0.22,
        collected: false,
      });
      this.removeTraveller(t);
      return null;
    }
    const blob = this.addBlob(t.type, x, y, 0.24, t.sensorKind);
    for (const o of near) {
      if (this.degree(blob) >= this.maxBondsPerBlob) break;
      this.addBond(blob, o);
    }
    this.removeTraveller(t);
    return blob;
  }

  repositionBlob(blob: Blob, x: number, y: number): void {
    blob.x = x;
    blob.y = y;
    blob.px = x;
    blob.py = y;
  }

  removeBlob(id: number): void {
    const b = this.blobs[id - 1];
    if (!b) return;
    b.removed = true;
    for (const bond of this.bonds) {
      if (bond.a === id - 1 || bond.b === id - 1) bond.active = false;
    }
    this.travellers = this.travellers.filter((t) => t.from !== id && t.to !== id);
    this.rebuildAdjacency();
  }

  rebuildAdjacency(): void {
    this.adj = this.blobs.map(() => []);
    this.bonds.forEach((bond, i) => {
      if (!bond.active) return;
      const a = this.blobs[bond.a];
      const b = this.blobs[bond.b];
      if (!a || !b || a.removed || b.removed) return;
      this.adj[bond.a].push({ bond: i, other: bond.b });
      this.adj[bond.b].push({ bond: i, other: bond.a });
    });
  }

  neighbors(node: number): Neighbor[] {
    return this.adj[node] ?? [];
  }

  travellerPos(t: Traveller): Vec2 {
    const a = this.blobs[t.from];
    const b = this.blobs[t.to];
    return { x: a.x + (b.x - a.x) * t.t, y: a.y + (b.y - a.y) * t.t };
  }

  spawnTravellerOnBond(
    bondIndex: number,
    type: BlockType,
    sensorKind: SensorKind | null = null,
  ): Traveller | null {
    const bond = this.bonds[bondIndex];
    if (!bond || !bond.active) return null;
    const forward = Math.random() < 0.5;
    const t: Traveller = {
      id: this.newId(),
      type,
      sensorKind,
      from: forward ? bond.a : bond.b,
      to: forward ? bond.b : bond.a,
      bond: bondIndex,
      t: Math.random(),
      speed: 1.1 + Math.random() * 0.7,
      recent: [],
    };
    this.travellers.push(t);
    return t;
  }

  spawnTravellerNear(x: number, y: number, type: BlockType, sensorKind: SensorKind | null): Traveller | null {
    let best = -1;
    let bestD = Infinity;
    this.bonds.forEach((bond, i) => {
      if (!bond.active) return;
      const a = this.blobs[bond.a];
      const b = this.blobs[bond.b];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const d = Math.hypot(mx - x, my - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) return null;
    return this.spawnTravellerOnBond(best, type, sensorKind);
  }

  collect(): void {
    for (const c of this.collectibles) {
      if (c.collected) continue;
      for (const b of this.blobs) {
        if (b.removed) continue;
        if (Math.hypot(b.x - c.x, b.y - c.y) <= b.radius + c.radius) {
          c.collected = true;
          this.spawnTravellerNear(b.x, b.y, c.type, c.sensorKind);
          break;
        }
      }
    }
    if (this.collectibles.some((c) => c.collected)) {
      this.collectibles = this.collectibles.filter((c) => !c.collected);
    }
  }

  step(dt: number): void {
    this.time += dt;
    this.applyGrip();
    this.integrate(dt);
    for (let i = 0; i < this.iterations; i++) this.solveConstraints();
    this.collide();
    this.collect();
    updateTravellers(this, dt);
    this.updateEmitters(dt);
    this.updatePulses(dt);
    this.processPending();
    this.checkGoal();
  }

  private applyGrip(): void {
    for (const b of this.blobs) {
      if (b.removed) continue;
      if (b.gripActive) {
        if (!b.pinned) {
          b.pinned = true;
          b.invMass = 0;
          b.px = b.x;
          b.py = b.y;
        }
      } else if (b.pinned) {
        b.pinned = false;
        b.invMass = 1;
      }
    }
  }

  private integrate(dt: number): void {
    const dt2 = dt * dt;
    for (const b of this.blobs) {
      if (b.removed || b.pinned) continue;
      const vx = (b.x - b.px) * this.damping;
      const vy = (b.y - b.py) * this.damping;
      b.px = b.x;
      b.py = b.y;
      b.x += vx;
      b.y += vy + this.gravity * dt2;
    }
    for (const c of this.collectibles) {
      const vx = (c.x - c.px) * this.damping;
      const vy = (c.y - c.py) * this.damping;
      c.px = c.x;
      c.py = c.y;
      c.x += vx;
      c.y += vy + this.gravity * dt2;
    }
  }

  private effectiveRest(bond: Bond): number {
    let factor = 1;
    for (const idx of [bond.a, bond.b]) {
      const b = this.blobs[idx];
      if (b && !b.removed && b.type === "contract" && b.contractActive) {
        factor = Math.min(factor, b.contractAmount);
      }
    }
    return bond.rest * factor;
  }

  private solveConstraints(): void {
    for (const bond of this.bonds) {
      if (!bond.active) continue;
      const a = this.blobs[bond.a];
      const b = this.blobs[bond.b];
      if (!a || !b || a.removed || b.removed) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1e-6;
      const total = a.invMass + b.invMass;
      if (total === 0) continue;
      const rest = this.effectiveRest(bond);
      const diff = ((dist - rest) / dist) * bond.stiffness;
      const ax = (dx * diff * a.invMass) / total;
      const ay = (dy * diff * a.invMass) / total;
      const bx = (dx * diff * b.invMass) / total;
      const by = (dy * diff * b.invMass) / total;
      a.x += ax;
      a.y += ay;
      b.x -= bx;
      b.y -= by;
    }
  }

  private collideCircle(x: number, y: number, r: number): { x: number; y: number; onGround: boolean } {
    let ny = y;
    let onGround = false;
    const floor = groundY(x) - r;
    if (ny > floor) {
      ny = floor;
      onGround = true;
    }
    for (const o of this.obstacles) {
      const dx = x - o.x;
      const dy = ny - o.y;
      const d = Math.hypot(dx, dy);
      const min = r + o.r;
      if (d < min && d > 1e-6) {
        const push = (min - d) / d;
        ny += dy * push;
      }
    }
    return { x, y: ny, onGround };
  }

  private collide(): void {
    for (const b of this.blobs) {
      if (b.removed) continue;
      const res = this.collideCircle(b.x, b.y, b.radius);
      b.onGround = res.onGround;
      if (b.pinned) continue;
      if (res.y !== b.y || res.x !== b.x) {
        if (res.onGround) {
          const vx = b.x - b.px;
          b.px = b.x - vx * this.groundFriction;
          b.py = res.y;
        }
        b.y = res.y;
      }
    }
    for (const c of this.collectibles) {
      const res = this.collideCircle(c.x, c.y, c.radius);
      if (res.onGround) {
        const vx = c.x - c.px;
        c.px = c.x - vx * this.groundFriction;
        c.py = res.y;
      }
      c.y = res.y;
    }
  }

  private updateEmitters(dt: number): void {
    for (const b of this.blobs) {
      if (b.removed) continue;
      if (b.type !== "sensor" && b.type !== "heart") continue;
      b.emitTimer += dt;
      if (b.emitTimer >= b.emitInterval) {
        b.emitTimer -= b.emitInterval;
        const type = b.type === "heart" ? b.emitType : (b.sensorKind ?? "touch");
        this.emitPulse(b, type, this.sensorPayload(b));
      }
    }
  }

  private sensorPayload(b: Blob): number {
    switch (b.sensorKind) {
      case "touch":
        return b.onGround ? 1 : 0;
      case "goal": {
        const dx = this.goal.x - b.x;
        const dy = this.goal.y - b.y;
        return Math.atan2(dy, dx);
      }
      case "food": {
        let best = 0;
        let bestD = Infinity;
        for (const c of this.collectibles) {
          if (c.collected) continue;
          const d = Math.hypot(c.x - b.x, c.y - b.y);
          if (d < bestD) {
            bestD = d;
            best = Math.atan2(c.y - b.y, c.x - b.x);
          }
        }
        return bestD === Infinity ? 0 : best;
      }
      case "tilt":
        return Math.atan(groundSlope(b.x));
      case "stretch": {
        const nbrs = this.neighbors(b.id - 1);
        if (nbrs.length === 0) return 0;
        let sum = 0;
        for (const n of nbrs) {
          const bond = this.bonds[n.bond];
          const other = this.blobs[n.other];
          const dist = Math.hypot(other.x - b.x, other.y - b.y);
          sum += dist / (bond.rest || 1) - 1;
        }
        return sum / nbrs.length;
      }
      default:
        return 0;
    }
  }

  private emitPulse(source: Blob, type: string, payload: number): void {
    const hopDist = new Map<number, number>();
    const start = source.id - 1;
    hopDist.set(start, 0);
    const queue = [start];
    let head = 0;
    while (head < queue.length) {
      const node = queue[head++];
      const d = hopDist.get(node)!;
      if (d >= MAX_HOPS) continue;
      for (const n of this.neighbors(node)) {
        if (!hopDist.has(n.other)) {
          hopDist.set(n.other, d + 1);
          queue.push(n.other);
        }
      }
    }
    if (this.pulses.length > 200) this.pulses.shift();
    this.pulses.push({
      id: this.nextPulse++,
      type,
      payload,
      source: source.id,
      age: 0,
      hopTime: HOP_TIME,
      maxHops: MAX_HOPS,
      hopDist,
      delivered: new Set(),
    });
    this.signalLog.unshift({ type, payload, time: this.time });
    if (this.signalLog.length > 12) this.signalLog.pop();
  }

  private updatePulses(dt: number): void {
    for (const pulse of this.pulses) {
      pulse.age += dt;
    }
    this.pulses = this.pulses.filter((p) => p.age / p.hopTime <= p.maxHops + 1);
    for (const pulse of this.pulses) {
      for (const [node, hops] of pulse.hopDist) {
        if (pulse.delivered.has(node)) continue;
        if (pulse.age >= hops * pulse.hopTime) {
          pulse.delivered.add(node);
          const blob = this.blobs[node];
          if (blob && !blob.removed) this.triggerRules(blob, pulse.type, pulse.payload);
        }
      }
    }
  }

  private triggerRules(blob: Blob, type: string, payload: number): void {
    for (const rule of blob.rules) {
      if (rule.trigger !== type) continue;
      if (!this.conditionHolds(rule, payload)) continue;
      if (this.time < rule.busyUntil) continue;
      const applyAt = this.time + rule.delay;
      const endsAt = applyAt + rule.duration;
      rule.busyUntil = endsAt;
      this.schedule(blob, { time: applyAt, kind: "apply", action: rule.action });
      if ((rule.action === "grip" || rule.action === "contract") && rule.duration > 0) {
        this.schedule(blob, { time: endsAt, kind: "revert", action: rule.action });
      }
    }
  }

  private conditionHolds(rule: Rule, payload: number): boolean {
    if (!rule.condition) return true;
    const v = rule.condition.value;
    if (rule.condition.op === ">") return payload > v;
    if (rule.condition.op === "<") return payload < v;
    return Math.abs(payload - v) < 0.2;
  }

  private schedule(blob: Blob, action: PendingAction): void {
    blob.pending.push(action);
  }

  private processPending(): void {
    for (const b of this.blobs) {
      if (b.removed || b.pending.length === 0) continue;
      const remaining: PendingAction[] = [];
      for (const a of b.pending) {
        if (a.time <= this.time) this.applyAction(b, a);
        else remaining.push(a);
      }
      b.pending = remaining;
    }
    this.applyGrip();
  }

  private applyAction(blob: Blob, action: PendingAction): void {
    const on = action.kind === "apply";
    switch (action.action) {
      case "grip":
        blob.gripActive = on;
        break;
      case "release":
        if (on) blob.gripActive = false;
        break;
      case "contract":
        blob.contractActive = on;
        break;
      case "extend":
        if (on) blob.contractActive = false;
        break;
    }
  }

  private checkGoal(): void {
    if (this.goalReached) return;
    for (const b of this.blobs) {
      if (b.removed) continue;
      if (Math.hypot(b.x - this.goal.x, b.y - this.goal.y) <= GOAL_RADIUS) {
        this.goalReached = true;
        return;
      }
    }
  }
}
