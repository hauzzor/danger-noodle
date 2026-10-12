import { updateTravellers } from "./travel";
import { mulberry32 } from "../engine/rng";
import { closestOnSegment, segmentsCross, segSegClosest } from "./geometry";
import { findFaces, type Compartment } from "./faces";
import { BEAM_RADIUS, BLOB_RADIUS, MAX_BOND_DIST, MIN_BOND_DIST, TRAVELLER_RADIUS } from "./units";
import type { Blob, BlockType, Bond, Neighbor, Pulse, Traveller, Vec2 } from "./types";

export const HOP_TIME = 0.12;
export const MAX_HOPS = 42;
export const CHUNK = 30;
// Gentle ambient flow strength (units/s^2) for the floating, gravity-free world.
const DRIFT = 0.6;
// Air pressure: `pressure = K * (refArea / area - 1)`; the resulting boundary
// force is scaled by PRESSURE_FORCE.
const PRESSURE_K = 1.2;
const PRESSURE_FORCE = 10;

export class World {
  blobs: Blob[] = [];
  bonds: Bond[] = [];
  travellers: Traveller[] = [];
  pulses: Pulse[] = [];
  compartments: Compartment[] = [];
  time = 0;
  seed = 1;

  gravity = 0;
  damping = 0.995;
  iterations = 4;
  maxBondsPerBlob = 6;
  // Beams are springs, not rigid rods: this is the fraction of the stretch
  // corrected per solver pass. Below 1 the length can drift from `rest`
  // (elongate/shorten) and springs back. Lower = softer/springier.
  bondStiffness = 0.15;

  private adj: Neighbor[][] = [];
  private nextId = 1;
  private nextPulse = 1;
  private compartmentRef = new Map<string, number>();
  private pressureFx: number[] = [];
  private pressureFy: number[] = [];

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
      emitOn: false,
      emitInterval: 1.5,
      emitDelay: 0,
      signalSpeed: 1 / HOP_TIME,
      maxHops: MAX_HOPS,
      signalColor: 0,
      acceptColors: [],
      contracting: false,
      contractTimer: 0,
      contractAmount: 1,
      contractTo: 0.5,
      contractTime: 1,
      releaseTime: 1,
      grabbing: false,
      grabTimer: 0,
      grabX: 0,
      grabY: 0,
      grabForce: 0.5,
      grabTime: 1,
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
  // build uses, capped by the per-block bond limit. A new block cannot be built
  // where it would intersect the existing structure, so the plan is empty then.
  // Ghost preview and building both go through this so they never disagree.
  planBonds(x: number, y: number): Blob[] {
    if (this.placementBlocked(x, y)) return [];
    return this.previewCandidates(x, y).slice(0, this.maxBondsPerBlob);
  }

  // True if a new block placed at (x, y) would intersect an existing block or
  // beam. The block being placed (if held) is ignored.
  placementBlocked(x: number, y: number): boolean {
    for (const k of this.blobs) {
      if (k.removed || k.held) continue;
      if (Math.hypot(k.x - x, k.y - y) < BLOB_RADIUS + k.radius) return true;
    }
    for (const bond of this.bonds) {
      if (!bond.active) continue;
      const a = this.blobs[bond.a];
      const b = this.blobs[bond.b];
      if (!a || !b || a.removed || b.removed || a.held || b.held) continue;
      const cp = closestOnSegment(x, y, a.x, a.y, b.x, b.y);
      if (Math.hypot(x - cp.x, y - cp.y) < BLOB_RADIUS + BEAM_RADIUS) return true;
    }
    return false;
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
      // No beams: the block becomes a loose traveller that falls and waits.
      this.makeFree(t, x, y);
      this.settleVelocities();
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
    if (near.length === 0) {
      // No beams: the block becomes a loose traveller that falls and waits.
      const type = blob.type;
      this.removeBlob(blob.id);
      this.addFreeTraveller(type, x, y);
      return;
    }
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

  // Take a block out of the structure but keep it as a loose traveller that
  // falls and waits to be picked up (rather than deleting it).
  disconnectBlob(id: number): void {
    const b = this.blobs[id - 1];
    if (!b || b.removed) return;
    const type = b.type;
    const x = b.x;
    const y = b.y;
    this.removeBlob(id);
    this.addFreeTraveller(type, x, y);
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
    if (!t.attached) return { x: t.x, y: t.y };
    const a = this.blobs[t.from];
    const b = this.blobs[t.to];
    return { x: a.x + (b.x - a.x) * t.t, y: a.y + (b.y - a.y) * t.t };
  }

  private makeFree(t: Traveller, x: number, y: number): void {
    t.attached = false;
    t.x = x;
    t.y = y;
    t.px = x;
    t.py = y;
    t.radius = t.radius || TRAVELLER_RADIUS;
    t.from = -1;
    t.to = -1;
    t.bond = -1;
    t.t = 0;
    t.speed = 0;
    t.recent = [];
    if (!this.travellers.includes(t)) this.travellers.push(t);
  }

  // A loose block lying on the ground, waiting to be picked up.
  addFreeTraveller(type: BlockType, x: number, y: number): Traveller {
    const t: Traveller = {
      id: this.newId(),
      type,
      attached: false,
      x,
      y,
      px: x,
      py: y,
      radius: TRAVELLER_RADIUS,
      from: -1,
      to: -1,
      bond: -1,
      t: 0,
      speed: 0,
      recent: [],
    };
    this.travellers.push(t);
    return t;
  }

  spawnTravellerOnBond(bondIndex: number, type: BlockType): Traveller | null {
    const bond = this.bonds[bondIndex];
    if (!bond || !bond.active) return null;
    const forward = Math.random() < 0.5;
    const t: Traveller = {
      id: this.newId(),
      type,
      attached: true,
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      radius: TRAVELLER_RADIUS,
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

  step(dt: number): void {
    this.time += dt;
    this.updateCompartments();
    this.integrate(dt);
    for (let i = 0; i < this.iterations; i++) {
      this.solveConstraints();
      this.solveCollisions();
      this.solveGrabbers();
    }
    this.reconcileTravellers();
    this.attachFreeTravellers();
    updateTravellers(this, dt);
    this.updateEmitters(dt);
    this.updatePulses(dt);
    this.updateContractors(dt);
    this.updateGrabbers(dt);
  }

  // While grabbing, a block is anchored to where it grabbed (the ground), pulled
  // back each solver pass by up to `grabForce` (0..1 of the way to the anchor).
  private solveGrabbers(): void {
    for (const b of this.blobs) {
      if (b.removed || b.held || !b.grabbing) continue;
      const k = Math.min(Math.max(b.grabForce, 0), 1);
      b.x += (b.grabX - b.x) * k;
      b.y += (b.grabY - b.y) * k;
    }
  }

  private updateGrabbers(dt: number): void {
    for (const b of this.blobs) {
      if (b.removed || !b.grabbing) continue;
      b.grabTimer += dt;
      if (b.grabTimer >= Math.max(0.01, b.grabTime)) b.grabbing = false;
    }
  }

  // Attached travellers whose beam is gone become free and fall.
  private reconcileTravellers(): void {
    for (const t of this.travellers) {
      if (!t.attached) continue;
      const bond = this.bonds[t.bond];
      const a = this.blobs[t.from];
      const b = this.blobs[t.to];
      if (!bond || !bond.active || !a || !b || a.removed || b.removed) {
        const pos = this.travellerPos(t);
        this.makeFree(t, pos.x, pos.y);
      }
    }
  }

  // Free travellers that touch the structure become active (ride a beam).
  // Contact is by the rim of the structure: a beam capsule or a block's edge,
  // not only the block centre.
  private attachFreeTravellers(): void {
    for (const t of this.travellers) {
      if (t.attached) continue;
      let best = -1;
      let bestGap = TRAVELLER_RADIUS;
      this.bonds.forEach((bond, i) => {
        if (!bond.active) return;
        const a = this.blobs[bond.a];
        const b = this.blobs[bond.b];
        if (!a || !b || a.removed || b.removed || a.held || b.held) return;
        const cp = closestOnSegment(t.x, t.y, a.x, a.y, b.x, b.y);
        const beamGap = Math.hypot(t.x - cp.x, t.y - cp.y) - BEAM_RADIUS;
        const aGap = Math.hypot(t.x - a.x, t.y - a.y) - a.radius;
        const bGap = Math.hypot(t.x - b.x, t.y - b.y) - b.radius;
        const gap = Math.min(beamGap, aGap, bGap);
        if (gap < bestGap) {
          bestGap = gap;
          best = i;
        }
      });
      if (best >= 0) this.attachTravellerToBond(t, best);
    }
  }

  private attachTravellerToBond(t: Traveller, bondIndex: number): void {
    const bond = this.bonds[bondIndex];
    if (!bond || !bond.active) return;
    const forward = Math.random() < 0.5;
    t.attached = true;
    t.from = forward ? bond.a : bond.b;
    t.to = forward ? bond.b : bond.a;
    t.bond = bondIndex;
    const from = this.blobs[t.from];
    const to = this.blobs[t.to];
    const len2 = (to.x - from.x) ** 2 + (to.y - from.y) ** 2 || 1e-9;
    const proj = ((t.x - from.x) * (to.x - from.x) + (t.y - from.y) * (to.y - from.y)) / len2;
    t.t = Math.min(Math.max(proj, 0), 0.999);
    t.speed = 1.1 + Math.random() * 0.7;
    t.recent = [];
  }

  private integrate(dt: number): void {
    const dt2 = dt * dt;
    const t = this.time;
    for (let i = 0; i < this.blobs.length; i++) {
      const b = this.blobs[i];
      if (b.removed || b.held) continue;
      const vx = (b.x - b.px) * this.damping;
      const vy = (b.y - b.py) * this.damping;
      b.px = b.x;
      b.py = b.y;
      const pfx = this.pressureFx[i] ?? 0;
      const pfy = this.pressureFy[i] ?? 0;
      b.x += vx + (Math.sin(b.y * 0.12 + t * 0.4) * DRIFT + pfx) * dt2;
      b.y += vy + (Math.cos(b.x * 0.1 + t * 0.33) * DRIFT + pfy) * dt2;
    }
    for (const tr of this.travellers) {
      if (tr.attached) continue;
      const vx = (tr.x - tr.px) * this.damping;
      const vy = (tr.y - tr.py) * this.damping;
      tr.px = tr.x;
      tr.py = tr.y;
      tr.x += vx + Math.sin(tr.y * 0.12 + t * 0.4) * DRIFT * dt2;
      tr.y += vy + Math.cos(tr.x * 0.1 + t * 0.33) * DRIFT * dt2;
    }
  }

  // Air pressure in enclosed compartments. Environment (outer face) is 0; a new
  // compartment starts at 0 and its pressure rises as it shrinks (and falls as
  // it grows). Positive pressure pushes the boundary outward, negative inward.
  private updateCompartments(): void {
    const faces = findFaces(this.blobs, this.bonds);
    const fx = new Array<number>(this.blobs.length).fill(0);
    const fy = new Array<number>(this.blobs.length).fill(0);
    const comps: Compartment[] = [];
    const seen = new Set<string>();

    for (const f of faces) {
      const key = [...f.verts].sort((a, b) => a - b).join(",");
      seen.add(key);
      if (!this.compartmentRef.has(key)) this.compartmentRef.set(key, f.area);
      const refArea = this.compartmentRef.get(key)!;
      const area = Math.max(f.area, 1e-3);
      const pressure = Math.max(-3, Math.min(3, PRESSURE_K * (refArea / area - 1)));
      comps.push({ verts: f.verts, area, pressure });

      if (Math.abs(pressure) < 1e-4) continue;
      for (let k = 0; k < f.verts.length; k++) {
        const ia = f.verts[k];
        const ib = f.verts[(k + 1) % f.verts.length];
        const a = this.blobs[ia];
        const b = this.blobs[ib];
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const L = Math.hypot(ex, ey);
        if (L < 1e-6) continue;
        // Outward normal for a CCW face.
        const nx = ey / L;
        const ny = -ex / L;
        const fhalf = pressure * L * PRESSURE_FORCE * 0.5;
        fx[ia] += nx * fhalf;
        fy[ia] += ny * fhalf;
        fx[ib] += nx * fhalf;
        fy[ib] += ny * fhalf;
      }
    }

    this.compartments = comps;
    this.pressureFx = fx;
    this.pressureFy = fy;
    for (const key of [...this.compartmentRef.keys()]) {
      if (!seen.has(key)) this.compartmentRef.delete(key);
    }
  }

  // `maxHops` is the maximum number of hops a single signal may spread.
  private emitSignal(source: Blob): void {
    const maxHops = source.maxHops > 0 ? source.maxHops : MAX_HOPS;
    const hopDist = new Map<number, number>();
    const start = source.id - 1;
    hopDist.set(start, 0);
    const queue = [start];
    let head = 0;
    while (head < queue.length) {
      const node = queue[head++];
      const d = hopDist.get(node)!;
      if (d >= maxHops) continue;
      for (const n of this.neighbors(node)) {
        if (!hopDist.has(n.other)) {
          hopDist.set(n.other, d + 1);
          queue.push(n.other);
        }
      }
    }
    if (this.pulses.length > 200) this.pulses.shift();
    const speed = source.signalSpeed > 0 ? source.signalSpeed : 1 / HOP_TIME;
    this.pulses.push({
      id: this.nextPulse++,
      source: source.id,
      color: source.signalColor,
      age: 0,
      hopTime: 1 / speed,
      maxHops,
      hopDist,
      delivered: new Set(),
    });
  }

  // Emissions are scheduled on the global clock grid
  //   t = emitDelay + k * emitInterval
  // so generators with the same interval+delay fire at exactly the same time.
  private updateEmitters(dt: number): void {
    const t1 = this.time;
    const t0 = this.time - dt;
    for (const b of this.blobs) {
      if (b.removed || b.held) continue;
      if (b.type !== "generator" || !b.emitOn || b.emitInterval <= 0) continue;
      const kStart = Math.max(0, Math.floor((t0 - b.emitDelay) / b.emitInterval) + 1);
      const kEnd = Math.floor((t1 - b.emitDelay) / b.emitInterval);
      for (let k = kStart; k <= kEnd; k++) this.emitSignal(b);
    }
  }

  private updatePulses(dt: number): void {
    for (const pulse of this.pulses) pulse.age += dt;
    this.pulses = this.pulses.filter((p) => p.age / p.hopTime <= p.maxHops + 1);
    for (const pulse of this.pulses) {
      for (const [node, hops] of pulse.hopDist) {
        if (pulse.delivered.has(node)) continue;
        if (pulse.age >= hops * pulse.hopTime) {
          pulse.delivered.add(node);
          const blob = this.blobs[node];
          if (blob && !blob.removed) this.handleSignal(blob, pulse.color);
        }
      }
    }
  }

  // A delivered signal starts a contractor's contraction / a grabber's grip;
  // while one is already running, further signals are ignored. A block with a
  // colour filter only reacts to accepted signal colours (empty = accept all).
  private handleSignal(blob: Blob, color: number): void {
    if (blob.type !== "contractor" && blob.type !== "grabber") return;
    if (blob.acceptColors.length > 0 && !blob.acceptColors.includes(color)) return;
    if (blob.type === "contractor") {
      if (blob.contracting) return;
      blob.contracting = true;
      blob.contractTimer = 0;
      blob.contractAmount = 1;
    } else {
      if (blob.grabbing) return;
      blob.grabbing = true;
      blob.grabTimer = 0;
      blob.grabX = blob.x;
      blob.grabY = blob.y;
    }
  }

  private updateContractors(dt: number): void {
    for (const b of this.blobs) {
      if (b.removed || !b.contracting) continue;
      b.contractTimer += dt;
      const short = Math.max(0.01, b.contractTime);
      const release = Math.max(0.01, b.releaseTime);
      const target = Math.min(Math.max(b.contractTo, 0.05), 1);
      if (b.contractTimer <= short) {
        b.contractAmount = 1 + (target - 1) * (b.contractTimer / short);
      } else if (b.contractTimer <= short + release) {
        b.contractAmount = target + (1 - target) * ((b.contractTimer - short) / release);
      } else {
        b.contracting = false;
        b.contractAmount = 1;
      }
    }
  }

  // A beam's current natural length: `rest`, shortened if either endpoint is a
  // contracting contractor.
  private effectiveRest(bond: Bond): number {
    let factor = 1;
    for (const idx of [bond.a, bond.b]) {
      const b = this.blobs[idx];
      if (b && !b.removed && b.contracting) factor = Math.min(factor, b.contractAmount);
    }
    return bond.rest * factor;
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
      const rest = this.effectiveRest(bond);
      const diff = ((dist - rest) / dist) * bond.stiffness * this.bondStiffness;
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

  // Procedurally generate loose blocks for any not-yet-populated chunk in the
  // given world-space rectangle. Deterministic per (seed, chunk), so the field
  // is stable; a chunk that already holds a block or traveller is skipped.
  ensureChunks(minX: number, minY: number, maxX: number, maxY: number): void {
    const cx0 = Math.floor(minX / CHUNK);
    const cx1 = Math.floor(maxX / CHUNK);
    const cy0 = Math.floor(minY / CHUNK);
    const cy1 = Math.floor(maxY / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (this.chunkOccupied(cx, cy)) continue;
        this.generateChunk(cx, cy);
      }
    }
  }

  private chunkOccupied(cx: number, cy: number): boolean {
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const x1 = x0 + CHUNK;
    const y1 = y0 + CHUNK;
    for (const b of this.blobs) {
      if (b.removed) continue;
      if (b.x >= x0 && b.x < x1 && b.y >= y0 && b.y < y1) return true;
    }
    for (const t of this.travellers) {
      if (t.attached) continue;
      if (t.x >= x0 && t.x < x1 && t.y >= y0 && t.y < y1) return true;
    }
    return false;
  }

  private generateChunk(cx: number, cy: number): void {
    const rand = mulberry32(chunkHash(this.seed, cx, cy));
    const count = Math.floor(rand() * 3); // 0..2
    for (let i = 0; i < count; i++) {
      const x = (cx + rand()) * CHUNK;
      const y = (cy + rand()) * CHUNK;
      const r = rand();
      const type: BlockType = r < 0.15 ? "generator" : r < 0.3 ? "contractor" : r < 0.45 ? "grabber" : "basic";
      this.addFreeTraveller(type, x, y);
    }
  }
}

function chunkHash(seed: number, cx: number, cy: number): number {
  let h = (seed ^ Math.imul(cx, 0x9e3779b1) ^ Math.imul(cy, 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}
