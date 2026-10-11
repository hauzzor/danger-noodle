import { groundY } from "./terrain";
import { updateTravellers } from "./travel";
import { closestOnSegment, segmentsCross, segSegClosest } from "./geometry";
import { BEAM_RADIUS, BLOB_RADIUS, COLLECTIBLE_RADIUS, MAX_BOND_DIST, MIN_BOND_DIST } from "./units";
import type { Blob, BlockType, Bond, Collectible, Neighbor, Traveller, Vec2 } from "./types";

export class World {
  blobs: Blob[] = [];
  bonds: Bond[] = [];
  travellers: Traveller[] = [];
  collectibles: Collectible[] = [];
  time = 0;

  gravity = 40;
  damping = 0.99;
  iterations = 4;
  groundFriction = 0.5;
  maxBondsPerBlob = 6;

  private adj: Neighbor[][] = [];
  private nextId = 1;

  newId(): number {
    return this.nextId++;
  }

  addBlob(type: BlockType, x: number, y: number, radius = BLOB_RADIUS): Blob {
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
      held: false,
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
    if (rest < MIN_BOND_DIST || rest > MAX_BOND_DIST) return null;
    if (this.crossesExisting(a.x, a.y, b.x, b.y, [a.id - 1, b.id - 1])) return null;
    if (this.segmentHitsBlob(a.x, a.y, b.x, b.y, [a.id - 1, b.id - 1])) return null;
    const id = this.bonds.length;
    this.bonds.push({ a: a.id - 1, b: b.id - 1, rest, stiffness, active: true });
    this.rebuildAdjacency();
    return id;
  }

  // True if the segment (x1,y1)-(x2,y2) properly crosses any active bond whose
  // endpoints are not in `exclude` (indices).
  private crossesExisting(x1: number, y1: number, x2: number, y2: number, exclude: number[]): boolean {
    for (const bond of this.bonds) {
      if (!bond.active) continue;
      if (exclude.includes(bond.a) || exclude.includes(bond.b)) continue;
      const a = this.blobs[bond.a];
      const b = this.blobs[bond.b];
      if (!a || !b || a.removed || b.removed) continue;
      if (segmentsCross({ x: x1, y: y1 }, { x: x2, y: y2 }, { x: a.x, y: a.y }, { x: b.x, y: b.y })) return true;
    }
    return false;
  }

  // True if the segment (x1,y1)-(x2,y2) passes within colliding distance of any
  // active, non-held blob whose index is not in `exclude`.
  private segmentHitsBlob(x1: number, y1: number, x2: number, y2: number, exclude: number[]): boolean {
    for (const k of this.blobs) {
      const ki = k.id - 1;
      if (k.removed || k.held || exclude.includes(ki)) continue;
      const cp = closestOnSegment(k.x, k.y, x1, y1, x2, y2);
      if (Math.hypot(k.x - cp.x, k.y - cp.y) < BEAM_RADIUS + k.radius) return true;
    }
    return false;
  }

  // Blocks that a hypothetical new block at (x, y) could legally bond to:
  // within the [min, max] unit range, with spare bond slots, and without the
  // new beam crossing an existing beam or passing through another block.
  // Sorted nearest-first.
  previewCandidates(x: number, y: number): Blob[] {
    const result: Blob[] = [];
    for (const o of this.activeBlobs()) {
      if (o.removed || o.held) continue;
      if (this.degree(o) >= this.maxBondsPerBlob) continue;
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < MIN_BOND_DIST || d > MAX_BOND_DIST) continue;
      if (this.crossesExisting(x, y, o.x, o.y, [o.id - 1])) continue;
      if (this.segmentHitsBlob(x, y, o.x, o.y, [o.id - 1])) continue;
      result.push(o);
    }
    return result.sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y));
  }

  // The beams a new block at (x, y) would actually form: the same list the
  // build uses, capped by the per-block bond limit. Ghost preview and building
  // must both go through this so they never disagree.
  planBonds(x: number, y: number): Blob[] {
    return this.previewCandidates(x, y).slice(0, this.maxBondsPerBlob);
  }

  // Resolve a list of block ids to live blocks, optionally excluding one.
  resolveTargets(ids: number[], exclude?: Blob): Blob[] {
    const out: Blob[] = [];
    for (const id of ids) {
      const b = this.getBlob(id);
      if (b && b !== exclude) out.push(b);
    }
    return out;
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

  buildTravellerAt(t: Traveller, x: number, y: number, planIds?: number[]): Blob | null {
    const forced = planIds !== undefined;
    const near = planIds ? this.resolveTargets(planIds) : this.planBonds(x, y);
    if (near.length === 0) {
      this.collectibles.push({
        id: this.newId(),
        type: t.type,
        x,
        y,
        px: x,
        py: y,
        radius: COLLECTIBLE_RADIUS,
        collected: false,
      });
      this.removeTraveller(t);
      return null;
    }
    const blob = this.addBlob(t.type, x, y, BLOB_RADIUS);
    for (const o of near) {
      if (this.degree(blob) >= this.maxBondsPerBlob) break;
      if (forced) this.restoreBond(blob, o, Math.hypot(o.x - blob.x, o.y - blob.y), 1);
      else this.addBond(blob, o);
    }
    this.removeTraveller(t);
    this.settleVelocities();
    return blob;
  }

  // Take a block out of the structure and into the player's hand. Its beams are
  // removed and it stops being simulated; it is re-attached on drop.
  detachBlob(blob: Blob): void {
    if (blob.removed || blob.held) return;
    for (const bond of this.bonds) {
      if (bond.active && (bond.a === blob.id - 1 || bond.b === blob.id - 1)) bond.active = false;
    }
    blob.held = true;
    this.rebuildAdjacency();
    this.settleVelocities();
  }

  // Place a held block at (x, y) and (re)build every beam shown for it. The
  // plan is computed while the block is still held so it never blocks its own
  // new beams.
  attachBlob(blob: Blob, x: number, y: number, planIds?: number[]): void {
    const forced = planIds !== undefined;
    blob.x = x;
    blob.y = y;
    blob.px = x;
    blob.py = y;
    const near = planIds ? this.resolveTargets(planIds, blob) : this.planBonds(x, y);
    blob.held = false;
    this.rebuildAdjacency();
    for (const o of near) {
      if (this.degree(blob) >= this.maxBondsPerBlob) break;
      if (forced) this.restoreBond(blob, o, Math.hypot(o.x - blob.x, o.y - blob.y), 1);
      else this.addBond(blob, o);
    }
    this.settleVelocities();
  }

  // Adding or removing blocks must not inject momentum into the structure:
  // cancel the implied velocity of every block after a structural change.
  private settleVelocities(): void {
    for (const b of this.blobs) {
      if (b.removed) continue;
      b.px = b.x;
      b.py = b.y;
    }
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
    this.settleVelocities();
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
        if (b.removed || b.held) continue;
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
    for (let i = 0; i < this.iterations; i++) {
      this.solveConstraints();
      this.solveCollisions();
    }
    this.collide();
    this.collect();
    updateTravellers(this, dt);
  }

  private integrate(dt: number): void {
    const dt2 = dt * dt;
    for (const b of this.blobs) {
      if (b.removed || b.held) continue;
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
      if (!a || !b || a.removed || b.removed || a.held || b.held) continue;
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

  // Solid-body pass: blocks and beams cannot overlap or pass through one another.
  // Beams are treated as capsules; blocks as circles.
  private solveCollisions(): void {
    const blobs = this.blobs;

    // block vs block
    for (let i = 0; i < blobs.length; i++) {
      const a = blobs[i];
      if (a.removed || a.held) continue;
      for (let j = i + 1; j < blobs.length; j++) {
        const b = blobs[j];
        if (b.removed || b.held) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minD = a.radius + b.radius;
        if (d >= minD || d < 1e-6) continue;
        const nx = dx / d;
        const ny = dy / d;
        const pen = (minD - d) * 0.5;
        a.x -= nx * pen;
        a.y -= ny * pen;
        b.x += nx * pen;
        b.y += ny * pen;
      }
    }

    // block vs beam
    for (const bond of this.bonds) {
      if (!bond.active) continue;
      const a = blobs[bond.a];
      const b = blobs[bond.b];
      if (!a || !b || a.removed || b.removed || a.held || b.held) continue;
      for (const k of blobs) {
        const ki = k.id - 1;
        if (k.removed || k.held || ki === bond.a || ki === bond.b) continue;
        const cp = closestOnSegment(k.x, k.y, a.x, a.y, b.x, b.y);
        let dx = k.x - cp.x;
        let dy = k.y - cp.y;
        let d = Math.hypot(dx, dy);
        const minD = BEAM_RADIUS + k.radius;
        if (d >= minD) continue;
        if (d < 1e-6) {
          dx = k.x - a.x;
          dy = k.y - a.y;
          d = Math.hypot(dx, dy) || 1e-6;
        }
        const nx = dx / d;
        const ny = dy / d;
        const pen = (minD - d) * 0.5;
        k.x += nx * pen;
        k.y += ny * pen;
        a.x -= nx * pen * (1 - cp.t);
        a.y -= ny * pen * (1 - cp.t);
        b.x -= nx * pen * cp.t;
        b.y -= ny * pen * cp.t;
      }
    }

    // beam vs beam
    for (let i = 0; i < this.bonds.length; i++) {
      const b1 = this.bonds[i];
      if (!b1.active) continue;
      const a = blobs[b1.a];
      const b = blobs[b1.b];
      if (!a || !b || a.removed || b.removed || a.held || b.held) continue;
      for (let j = i + 1; j < this.bonds.length; j++) {
        const b2 = this.bonds[j];
        if (!b2.active) continue;
        if (b1.a === b2.a || b1.a === b2.b || b1.b === b2.a || b1.b === b2.b) continue;
        const c = blobs[b2.a];
        const d = blobs[b2.b];
        if (!c || !d || c.removed || d.removed || c.held || d.held) continue;
        const r = segSegClosest(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
        const minD = 2 * BEAM_RADIUS;
        if (r.d >= minD || r.d < 1e-6) continue;
        const nx = (r.p2.x - r.p1.x) / r.d;
        const ny = (r.p2.y - r.p1.y) / r.d;
        const pen = (minD - r.d) * 0.5;
        a.x -= nx * pen * (1 - r.p1.t);
        a.y -= ny * pen * (1 - r.p1.t);
        b.x -= nx * pen * r.p1.t;
        b.y -= ny * pen * r.p1.t;
        c.x += nx * pen * (1 - r.p2.t);
        c.y += ny * pen * (1 - r.p2.t);
        d.x += nx * pen * r.p2.t;
        d.y += ny * pen * r.p2.t;
      }
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
      if (b.removed || b.held) continue;
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
