import { groundY } from "./terrain";
import { updateTravellers } from "./travel";
import type { Blob, BlockType, Bond, Collectible, Neighbor, Traveller, Vec2 } from "./types";

export const MAX_STRAND = 1.5;

export class World {
  blobs: Blob[] = [];
  bonds: Bond[] = [];
  travellers: Traveller[] = [];
  collectibles: Collectible[] = [];
  time = 0;

  gravity = 20;
  damping = 0.99;
  iterations = 4;
  groundFriction = 0.5;
  maxBondsPerBlob = 6;

  private adj: Neighbor[][] = [];
  private nextId = 1;

  newId(): number {
    return this.nextId++;
  }

  addBlob(type: BlockType, x: number, y: number, radius = 0.24): Blob {
    const blob: Blob = {
      id: this.blobs.length + 1,
      type,
      x,
      y,
      px: x,
      py: y,
      radius,
      invMass: 1,
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

  findBondIndex(aId: number, bId: number): number {
    for (let i = 0; i < this.bonds.length; i++) {
      const bond = this.bonds[i];
      if (!bond.active) continue;
      const a = this.blobs[bond.a];
      const b = this.blobs[bond.b];
      if (!a || !b || a.removed || b.removed) continue;
      if ((a.id === aId && b.id === bId) || (a.id === bId && b.id === aId)) return i;
    }
    return -1;
  }

  randomActiveBond(): number {
    const active: number[] = [];
    this.bonds.forEach((bond, i) => {
      if (!bond.active) return;
      const a = this.blobs[bond.a];
      const b = this.blobs[bond.b];
      if (!a || !b || a.removed || b.removed) return;
      active.push(i);
    });
    if (active.length === 0) return -1;
    return active[Math.floor(Math.random() * active.length)];
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
    const blob = this.addBlob(t.type, x, y, 0.24);
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
    this.travellers = this.travellers.filter((t) => t.from !== id - 1 && t.to !== id - 1);
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

  spawnTravellerOnBond(bondIndex: number, type: BlockType): Traveller | null {
    const bond = this.bonds[bondIndex];
    if (!bond || !bond.active) return null;
    const forward = Math.random() < 0.5;
    const t: Traveller = {
      id: this.newId(),
      type,
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

  spawnTravellerNear(x: number, y: number, type: BlockType): Traveller | null {
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
    return this.spawnTravellerOnBond(best, type);
  }

  collect(): void {
    for (const c of this.collectibles) {
      if (c.collected) continue;
      for (const b of this.blobs) {
        if (b.removed) continue;
        if (Math.hypot(b.x - c.x, b.y - c.y) <= b.radius + c.radius) {
          c.collected = true;
          this.spawnTravellerNear(b.x, b.y, c.type);
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
    this.integrate(dt);
    for (let i = 0; i < this.iterations; i++) this.solveConstraints();
    this.collide();
    this.collect();
    updateTravellers(this, dt);
  }

  private integrate(dt: number): void {
    const dt2 = dt * dt;
    for (const b of this.blobs) {
      if (b.removed) continue;
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
      const diff = ((dist - bond.rest) / dist) * bond.stiffness;
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
    return { x, y: ny, onGround };
  }

  private collide(): void {
    for (const b of this.blobs) {
      if (b.removed) continue;
      const res = this.collideCircle(b.x, b.y, b.radius);
      b.onGround = res.onGround;
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
}
