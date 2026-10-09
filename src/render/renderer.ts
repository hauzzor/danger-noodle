import { Camera } from "../engine/camera";
import { valueNoise1D } from "../engine/rng";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private ground = valueNoise1D(1337);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  private resize = (): void => {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.camera.setViewport(w, h);
  };

  draw(_time: number): void {
    const { ctx, camera } = this;
    const w = camera.vw;
    const h = camera.vh;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0e0f13";
    ctx.fillRect(0, 0, w, h);

    this.drawGrid();
    this.drawGround();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawGrid(): void {
    const { ctx, camera } = this;
    const start = camera.s2w(0, 0);
    const end = camera.s2w(camera.vw, camera.vh);
    const step = 1;

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    for (let x = Math.floor(start.x / step) * step; x <= end.x; x += step) {
      const a = camera.w2s(x, start.y);
      const b = camera.w2s(x, end.y);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    for (let y = Math.floor(start.y / step) * step; y <= end.y; y += step) {
      const a = camera.w2s(start.x, y);
      const b = camera.w2s(end.x, y);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  private drawGround(): void {
    const { ctx, camera } = this;
    const start = camera.s2w(0, 0);
    const end = camera.s2w(camera.vw, camera.vh);

    ctx.beginPath();
    let first = true;
    const stepW = 1 / camera.zoom;
    for (let x = start.x; x <= end.x; x += stepW) {
      const gy = this.ground(x * 0.08) * 2 - 1;
      const p = camera.w2s(x, gy);
      if (first) {
        ctx.moveTo(p.x, p.y);
        first = false;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    const bottomLeft = camera.w2s(start.x, end.y);
    const bottomRight = camera.w2s(end.x, end.y);
    ctx.lineTo(bottomRight.x, bottomRight.y);
    ctx.lineTo(bottomLeft.x, bottomLeft.y);
    ctx.closePath();
    ctx.fillStyle = "#241a12";
    ctx.fill();
    ctx.strokeStyle = "#4a351f";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
