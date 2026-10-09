import type { Camera } from "../engine/camera";
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
  onChange: () => void;
}

export interface DragRender {
  kind: "blob" | "traveller";
  pos: Vec2;
  type: BlockType;
}

export class Interaction {
  dragRender: DragRender | null = null;

  private pointers = new Map<number, Vec2>();
  private down: { screen: Vec2; hit: Hit; moved: boolean } | null = null;
  private panning = false;
  private drag: { kind: "blob" | "traveller"; blob?: Blob; traveller?: Traveller; pos: Vec2 } | null = null;
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

  private pick(wp: Vec2): Hit {
    const world = this.o.getWorld();
    let bestT: Traveller | null = null;
    let bestD = 0.45;
    for (const t of world.travellers) {
      const p = world.travellerPos(t);
      const d = Math.hypot(p.x - wp.x, p.y - wp.y);
      if (d < bestD) {
        bestD = d;
        bestT = t;
      }
    }
    if (bestT) return { kind: "traveller", traveller: bestT };

    let bestB: Blob | null = null;
    let bestBD = 0.5;
    for (const b of world.activeBlobs()) {
      const d = Math.hypot(b.x - wp.x, b.y - wp.y);
      if (d < bestBD) {
        bestBD = d;
        bestB = b;
      }
    }
    if (bestB) return { kind: "blob", blob: bestB };
    return { kind: "none" };
  }

  private onDown = (e: PointerEvent): void => {
    if (this.o.uiOpen()) return;
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
      this.down = { screen: p, hit: this.pick(wp), moved: false };
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
      if (!this.down.moved && Math.hypot(p.x - this.down.screen.x, p.y - this.down.screen.y) > 8) {
        this.down.moved = true;
        if (this.down.hit.kind === "traveller") {
          this.drag = { kind: "traveller", traveller: this.down.hit.traveller, pos: this.o.camera.s2w(p.x, p.y) };
        } else if (this.down.hit.kind === "blob") {
          this.drag = { kind: "blob", blob: this.down.hit.blob, pos: this.o.camera.s2w(p.x, p.y) };
        } else {
          this.panning = true;
        }
      }
      if (this.panning) {
        this.o.camera.panScreen(p.x - prev.x, p.y - prev.y);
      } else if (this.drag) {
        this.drag.pos = this.o.camera.s2w(p.x, p.y);
        this.dragRender = { kind: this.drag.kind, pos: this.drag.pos, type: this.dragType() };
      }
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.pointers.get(e.pointerId)!;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastPinch = 0;

    if (this.down && !this.down.moved) {
      if (this.down.hit.kind === "blob") this.o.onBlobTap(this.down.hit.blob, p);
    }

    if (this.drag) {
      const world = this.o.getWorld();
      if (this.drag.kind === "traveller" && this.drag.traveller) {
        world.buildTravellerAt(this.drag.traveller, this.drag.pos.x, this.drag.pos.y);
      } else if (this.drag.kind === "blob" && this.drag.blob) {
        world.repositionBlob(this.drag.blob, this.drag.pos.x, this.drag.pos.y);
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
