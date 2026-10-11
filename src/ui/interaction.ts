import type { Camera } from "../engine/camera";
import { closestOnSegment } from "../sim/geometry";
import { units } from "../sim/units";
import type { Blob, BlockType, Traveller, Vec2 } from "../sim/types";
import type { World } from "../sim/world";

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
}

export interface DragRender {
  kind: "blob" | "traveller";
  pos: Vec2;
  type: BlockType;
  id: number;
  // Block ids that would be bonded if placed here. The ghost draws exactly
  // these, and the drop builds exactly these ("build what was shown").
  plan: number[];
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

  // Recompute the shown plan from the current world so a drop builds exactly
  // the beams the player can see. Called once per rendered frame.
  refreshDragPlan(): void {
    if (!this.drag || !this.dragRender) return;
    this.dragRender.plan = this.planFor(this.drag.pos);
  }

  private pick(wp: Vec2): Hit {
    const world = this.o.getWorld();

    let bestT: Traveller | null = null;
    let bestTD = TRAVELLER_PICK;
    for (const t of world.travellers) {
      const p = world.travellerPos(t);
      const d = Math.hypot(p.x - wp.x, p.y - wp.y);
      if (d < bestTD) {
        bestTD = d;
        bestT = t;
      }
    }

    let bestB: Blob | null = null;
    let bestBD = BLOB_PICK;
    for (const b of world.activeBlobs()) {
      if (b.held) continue;
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
      // (ghost mode) on pointer-down, before any drag movement.
      if (hit.kind === "blob") {
        const world = this.o.getWorld();
        const origin = world.neighbors(hit.blob.id - 1).map((n) => world.blobs[n.other].id);
        world.detachBlob(hit.blob);
        this.drag = { kind: "blob", blob: hit.blob, pos: wp, origin };
        this.dragRender = { kind: "blob", pos: wp, type: hit.blob.type, id: hit.blob.id, plan: this.planFor(wp) };
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
        if (moved) {
          world.buildTravellerAt(this.drag.traveller, this.drag.pos.x, this.drag.pos.y, plan);
        } else {
          // A plain click: put the loose block back where it was.
          world.travellers.push(this.drag.traveller);
        }
      } else if (this.drag.kind === "blob" && this.drag.blob) {
        const blob = this.drag.blob;
        if (moved) {
          world.attachBlob(blob, this.drag.pos.x, this.drag.pos.y, plan);
        } else {
          // A plain click: put the block back exactly where it was and open its menu.
          world.attachBlob(blob, blob.x, blob.y, this.drag.origin);
          this.o.onBlobTap(blob, p);
        }
      }
      this.o.onChange();
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
