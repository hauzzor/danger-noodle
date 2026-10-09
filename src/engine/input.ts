import { Camera } from "./camera";

export class InputController {
  private pointers = new Map<number, { x: number; y: number }>();
  private lastSingle: { x: number; y: number } | null = null;
  private lastPinchDist = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
  ) {
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) this.lastSingle = p;
    if (this.pointers.size === 2) this.lastPinchDist = this.pinchDistance();
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);

    if (this.pointers.size === 1 && this.lastSingle) {
      this.camera.panScreen(p.x - this.lastSingle.x, p.y - this.lastSingle.y);
      this.lastSingle = p;
    } else if (this.pointers.size === 2) {
      const dist = this.pinchDistance();
      if (this.lastPinchDist > 0) {
        const factor = dist / this.lastPinchDist;
        const c = this.pinchCenter();
        this.camera.zoomAt(c.x, c.y, factor);
      }
      this.lastPinchDist = dist;
      this.lastSingle = null;
    }
  };

  private onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastPinchDist = 0;
    if (this.pointers.size === 1) {
      const [p] = [...this.pointers.values()];
      this.lastSingle = p;
    } else {
      this.lastSingle = null;
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const factor = Math.pow(1.0015, -e.deltaY);
    this.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
  };

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private pinchCenter(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}
