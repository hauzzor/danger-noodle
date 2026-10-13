import type { Camera } from "../engine/camera";
import { closestOnSegment } from "../sim/geometry";
import { units } from "../sim/units";
import type { Blob, BlockType, Traveller, Vec2 } from "../sim/types";
import type { World } from "../sim/world";
import { spawnNpcBlob } from "../world/generator";

type Hit =
  | { kind: "none" }
  | { kind: "blob"; blob: Blob }
  | { kind: "traveller"; traveller: Traveller };

export interface InteractionOptions {
  canvas: HTMLCanvasElement;
  camera: Camera;
  getWorld: () => World;
  onBlobTap: (blob: Blob, screen: Vec2) => void;
  uiOpen: () => boolean;
  onDismissUi: () => void;
  onChange: () => void;
  canDragBlocks: () => boolean;
}

export interface DragRender {
  kind: "blob" | "traveller" | "creature";
  pos: Vec2;
  type: BlockType;
  id: number;
  // Block ids that would be bonded if placed here. The ghost draws exactly
  // these, and the drop builds exactly these ("build what was shown").
  plan: number[];
  // Set when kind === "creature": which NPC species is being placed.
  creatureKind?: "basic" | "predator";
}

const TRAVELLER_PICK = units(0.24);
const BLOB_PICK = units(0.6);
const BEAM_PICK = units(0.5);
const MOVE_THRESHOLD = 6;

type DragState = { kind: "blob" | "traveller"; blob?: Blob; traveller?: Traveller; pos: Vec2; origin?: number[] };

export class Interaction {
  dragRender: DragRender | null = null;

  private pointers = new Map<number, Vec2>();
  private down: { screen: Vec2; hit: Hit; moved: boolean } | null = null;
  private panning = false;
  private drag: DragState | null = null;
  private spawned: Traveller | null = null;
  private spawnType: BlockType | null = null;
  private creatureKind: "basic" | "predator" | null = null;
  private lastPointer: Vec2 | null = null;
  private lastPinch = 0;

  constructor(private readonly o: InteractionOptions) {
    const c = o.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private local(e: PointerEvent): Vec2 {
    const rect = this.o.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private planFor(pos: Vec2): number[] {
    return this.o.getWorld().planBonds(pos.x, pos.y).map((b) => b.id);
  }

  // The block type currently being spawned from the toolbar, or null.
  getSpawnType(): BlockType | null {
    return this.spawnType;
  }

  // The NPC species currently being placed from the toolbar, or null.
  getCreatureKind(): "basic" | "predator" | null {
    return this.creatureKind;
  }

  // Toolbar spawn of a whole NPC creature: first click arms it, then each click
  // on the canvas places a creature at the cursor. Clicking the same button
  // again cancels; picking a block cancels it too.
  beginSpawnCreature(kind: "basic" | "predator"): void {
    if (this.creatureKind === kind) {
      this.creatureKind = null;
      this.dragRender = null;
      this.o.onChange();
      return;
    }
    this.spawnType = null;
    this.spawned = null;
    this.creatureKind = kind;
    const here = this.handPos();
    this.dragRender = { kind: "creature", pos: here, type: "basic", id: 0, plan: [], creatureKind: kind };
    this.o.onChange();
  }

  private handPos(): Vec2 {
    return this.lastPointer
      ? this.o.camera.s2w(this.lastPointer.x, this.lastPointer.y)
      : { x: this.o.camera.x, y: this.o.camera.y };
  }

  // Toolbar spawn: first click puts a block of `type` in the hand; clicking the
  // same button again cancels. Placing a block refills the hand with the same
  // type (see onDown), so you can place repeatedly.
  beginSpawn(type: BlockType): void {
    this.creatureKind = null;
    if (this.spawnType === type) {
      this.spawnType = null;
      this.spawned = null;
      this.dragRender = null;
      this.o.onChange();
      return;
    }
    this.spawnType = type;
    this.refillHand();
    this.o.onChange();
  }

  private refillHand(): void {
    if (!this.spawnType) return;
    const here = this.lastPointer
      ? this.o.camera.s2w(this.lastPointer.x, this.lastPointer.y)
      : { x: this.o.camera.x, y: this.o.camera.y };
    const world = this.o.getWorld();
    const t = world.addFreeTraveller(this.spawnType, here.x, here.y);
    world.removeTraveller(t);
    this.spawned = t;
    this.dragRender = { kind: "traveller", pos: here, type: this.spawnType, id: t.id, plan: this.planFor(here) };
  }

  // Recompute the shown plan from the current world so a drop builds exactly
  // the beams the player can see. Called once per rendered frame.
  refreshDragPlan(): void {
    if (!this.dragRender || this.dragRender.kind === "creature") return;
    const pos = this.drag ? this.drag.pos : this.dragRender.pos;
    this.dragRender.plan = this.planFor(pos);
  }

  private pick(wp: Vec2): Hit {
    const world = this.o.getWorld();

    let bestT: Traveller | null = null;
    let bestTD = Infinity;
    for (const t of world.travellers) {
      const pickR = t.attached ? TRAVELLER_PICK : BLOB_PICK;
      const p = world.travellerPos(t);
      const d = Math.hypot(p.x - wp.x, p.y - wp.y);
      if (d < pickR && d < bestTD) {
        bestTD = d;
        bestT = t;
      }
    }

    let bestB: Blob | null = null;
    let bestBD = BLOB_PICK;
    for (const b of world.activeBlobs()) {
      if (b.held || b.faction !== 0) continue;
      const d = Math.hypot(b.x - wp.x, b.y - wp.y);
      if (d < bestBD) {
        bestBD = d;
        bestB = b;
      }
    }

    if (bestT && bestB) return bestTD <= bestBD ? { kind: "traveller", traveller: bestT } : { kind: "blob", blob: bestB };
    if (bestT) return { kind: "traveller", traveller: bestT };
    if (bestB) return { kind: "blob", blob: bestB };

    // Nothing solid under the pointer: allow grabbing a block by pressing any
    // part of the structure, i.e. along a beam too. Pick the nearer endpoint.
    let beamBlob: Blob | null = null;
    let bestBeamD = BEAM_PICK;
    for (const bond of world.bonds) {
      if (!bond.active) continue;
      const a = world.blobs[bond.a];
      const b = world.blobs[bond.b];
      if (!a || !b || a.removed || b.removed || a.held || b.held) continue;
      if (a.faction !== 0 || b.faction !== 0) continue;
      const cp = closestOnSegment(wp.x, wp.y, a.x, a.y, b.x, b.y);
      const d = Math.hypot(wp.x - cp.x, wp.y - cp.y);
      if (d < bestBeamD) {
        bestBeamD = d;
        const da = Math.hypot(wp.x - a.x, wp.y - a.y);
        const db = Math.hypot(wp.x - b.x, wp.y - b.y);
        beamBlob = da <= db ? a : b;
      }
    }
    if (beamBlob) return { kind: "blob", blob: beamBlob };
    return { kind: "none" };
  }

  private onDown = (e: PointerEvent): void => {
    if (this.spawned) {
      // Place the block being spawned at the click point, then refill the hand
      // with another of the same type.
      const p = this.local(e);
      this.lastPointer = p;
      const pos = this.o.camera.s2w(p.x, p.y);
      const plan = this.dragRender?.plan ?? [];
      this.o.getWorld().buildTravellerAt(this.spawned, pos.x, pos.y, plan);
      this.spawned = null;
      this.dragRender = null;
      this.refillHand();
      this.o.onChange();
      return;
    }
    if (this.creatureKind) {
      // Place a whole creature at the cursor, then keep the mode armed so the
      // player can place several in a row (click the button again to stop).
      const p = this.local(e);
      this.lastPointer = p;
      const pos = this.o.camera.s2w(p.x, p.y);
      spawnNpcBlob(this.o.getWorld(), pos.x, pos.y, this.creatureKind);
      this.o.onChange();
      return;
    }
    if (this.o.uiOpen()) {
      this.o.onDismissUi();
      return;
    }
    this.o.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      this.lastPinch = this.pinchDist();
      this.down = null;
      return;
    }
    if (this.pointers.size === 1) {
      const wp = this.o.camera.s2w(p.x, p.y);
      const hit = this.pick(wp);
      this.down = { screen: p, hit, moved: false };
      // Grab immediately: a structure block is detached into the player's hand
      // (ghost mode) on pointer-down, before any drag movement. Disabled when
      // "replace" is off, so built blocks stay put.
      if (hit.kind === "blob") {
        if (this.o.canDragBlocks()) {
          const world = this.o.getWorld();
          const origin = world.neighbors(hit.blob.id - 1).map((n) => world.blobs[n.other].id);
          world.detachBlob(hit.blob);
          this.drag = { kind: "blob", blob: hit.blob, pos: wp, origin };
          this.dragRender = { kind: "blob", pos: wp, type: hit.blob.type, id: hit.blob.id, plan: this.planFor(wp) };
        }
      } else if (hit.kind === "traveller") {
        // Remove the loose block from the structure immediately; it now lives
        // only in the player's hand (ghost mode) until dropped.
        this.o.getWorld().removeTraveller(hit.traveller);
        this.drag = { kind: "traveller", traveller: hit.traveller, pos: wp };
        this.dragRender = { kind: "traveller", pos: wp, type: hit.traveller.type, id: hit.traveller.id, plan: this.planFor(wp) };
      }
    }
  };

  private onMove = (e: PointerEvent): void => {
    this.lastPointer = this.local(e);
    if (this.spawned && this.dragRender) {
      const pos = this.o.camera.s2w(this.lastPointer.x, this.lastPointer.y);
      this.dragRender = { kind: "traveller", pos, type: this.spawned.type, id: this.spawned.id, plan: this.planFor(pos) };
    }
    if (this.creatureKind && this.dragRender) {
      this.dragRender.pos = this.o.camera.s2w(this.lastPointer.x, this.lastPointer.y);
    }
    if (!this.pointers.has(e.pointerId)) return;
    const prev = this.pointers.get(e.pointerId)!;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);

    if (this.pointers.size === 2) {
      const dist = this.pinchDist();
      if (this.lastPinch > 0) {
        const c = this.pinchCenter();
        this.o.camera.zoomAt(c.x, c.y, dist / this.lastPinch);
      }
      this.lastPinch = dist;
      return;
    }

    if (this.down) {
      if (!this.down.moved && Math.hypot(p.x - this.down.screen.x, p.y - this.down.screen.y) > MOVE_THRESHOLD) {
        this.down.moved = true;
      }
      if (this.drag) {
        this.drag.pos = this.o.camera.s2w(p.x, p.y);
        this.dragRender = {
          kind: this.drag.kind,
          pos: this.drag.pos,
          type: this.dragType(),
          id: this.drag.blob?.id ?? this.drag.traveller?.id ?? 0,
          plan: this.planFor(this.drag.pos),
        };
      } else {
        if (this.down.moved) this.panning = true;
        if (this.panning) this.o.camera.panScreen(p.x - prev.x, p.y - prev.y);
      }
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.pointers.get(e.pointerId)!;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastPinch = 0;

    const moved = this.down?.moved ?? false;
    const plan = this.dragRender?.plan ?? [];
    if (this.drag) {
      const world = this.o.getWorld();
      if (this.drag.kind === "traveller" && this.drag.traveller) {
        if (!moved || world.placementBlocked(this.drag.pos.x, this.drag.pos.y)) {
          // A plain click, or a spot that would intersect the structure: the
          // loose block cannot be built there, so put it back.
          world.travellers.push(this.drag.traveller);
        } else {
          world.buildTravellerAt(this.drag.traveller, this.drag.pos.x, this.drag.pos.y, plan);
        }
      } else if (this.drag.kind === "blob" && this.drag.blob) {
        const blob = this.drag.blob;
        if (!moved) {
          // A plain click: put the block back exactly where it was and open its menu.
          world.attachBlob(blob, blob.x, blob.y, this.drag.origin);
          this.o.onBlobTap(blob, p);
        } else {
          // Replace: attach the shown beams, or — if it would end up with no
          // connecting beams (nothing in range, or the spot is blocked) — turn
          // it into a loose traveller instead.
          world.attachBlob(blob, this.drag.pos.x, this.drag.pos.y, plan);
        }
      }
      this.o.onChange();
    } else if (this.down && !moved && this.down.hit.kind === "blob") {
      // Replace disabled (no grab happened): a plain tap still opens the menu.
      this.o.onBlobTap(this.down.hit.blob, p);
    }

    this.down = null;
    this.panning = false;
    this.drag = null;
    this.dragRender = null;
    if (this.pointers.size === 1) {
      const [only] = [...this.pointers.values()];
      const wp = this.o.camera.s2w(only.x, only.y);
      this.down = { screen: only, hit: this.pick(wp), moved: true };
    }
  };

  private dragType(): BlockType {
    return this.drag?.traveller?.type ?? this.drag?.blob?.type ?? "basic";
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.o.canvas.getBoundingClientRect();
    const factor = Math.pow(1.0015, -e.deltaY);
    this.o.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
  };

  private pinchDist(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private pinchCenter(): Vec2 {
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}
