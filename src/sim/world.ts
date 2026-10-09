import { groundY } from "./terrain";
import { updateTravellers } from "./travel";
import type { Blob, BlockType, Bond, Neighbor, Traveller, Vec2 } from "./types";

export class World {
  blobs: Blob[] = [];
  bonds: Bond[] = [];
  travellers: Traveller[] = [];

  gravity = 20;
  damping = 0.99;
  iterations = 4;
  groundFriction = 0.5;

  private adj: Neighbor[][] = [];

  addBlob(type: BlockType, x: number, y: number, radius = 0.24, pinned = false): number {
    const id = this.blobs.length;
    this.blobs.push({
      id,
      type,
      x,
      y,
      px: x,
      py: y,
      radius,
      invMass: pinned ? 0 : 1,
      pinned,
    });
    return id;
  }

  addBond(a: number, b: number, stiffness = 1): number {
    const A = this.blobs[a];
    const B = this.blobs[b];
    const rest = Math.hypot(B.x - A.x, B.y - A.y);
    const id = this.bonds.length;
    this.bonds.push({ a, b, rest, stiffness, active: true });
    return id;
  }

  rebuildAdjacency(): void {
    this.adj = this.blobs.map(() => []);
    this.bonds.forEach((bond, i) => {
      if (!bond.active) return;
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

  step(dt: number): void {
    this.integrate(dt);
    for (let i = 0; i < this.iterations; i++) this.solveConstraints();
    this.collide();
    updateTravellers(this, dt);
  }

  private integrate(dt: number): void {
    const dt2 = dt * dt;
    for (const b of this.blobs) {
      if (b.pinned) continue;
      const vx = (b.x - b.px) * this.damping;
      const vy = (b.y - b.py) * this.damping;
      b.px = b.x;
      b.py = b.y;
      b.x += vx;
      b.y += vy + this.gravity * dt2;
    }
  }

  private solveConstraints(): void {
    for (const bond of this.bonds) {
      if (!bond.active) continue;
      const a = this.blobs[bond.a];
      const b = this.blobs[bond.b];
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

  private collide(): void {
    for (const b of this.blobs) {
      if (b.pinned) continue;
      const floor = groundY(b.x) - b.radius;
      if (b.y > floor) {
        b.y = floor;
        const vx = b.x - b.px;
        b.px = b.x - vx * this.groundFriction;
        b.py = b.y;
      }
    }
  }
}
