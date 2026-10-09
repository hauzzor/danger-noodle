import { Camera } from "../engine/camera";
import { groundY } from "../sim/terrain";
import type { World } from "../sim/world";
import type { BlockType } from "../sim/types";

const COLORS: Record<BlockType, string> = {
  basic: "#9aa3b2",
  sensor: "#6ad1a3",
  grip: "#e0a458",
  contract: "#b07be0",
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;

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

  draw(world: World): void {
    const { ctx } = this;
    const w = this.camera.vw;
    const h = this.camera.vh;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#0e0f13";
    ctx.fillRect(0, 0, w, h);

    this.drawGrid();
    this.drawGround();
    this.drawBonds(world);
    this.drawBlobs(world);
    this.drawTravellers(world);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawGrid(): void {
    const { ctx, camera } = this;
    const start = camera.s2w(0, 0);
    const end = camera.s2w(camera.vw, camera.vh);

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    for (let x = Math.floor(start.x); x <= end.x; x += 1) {
      const a = camera.w2s(x, start.y);
      const b = camera.w2s(x, end.y);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    for (let y = Math.floor(start.y); y <= end.y; y += 1) {
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
      const p = camera.w2s(x, groundY(x));
      if (first) {
        ctx.moveTo(p.x, p.y);
        first = false;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    const bl = camera.w2s(start.x, end.y);
    const br = camera.w2s(end.x, end.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.fillStyle = "#241a12";
    ctx.fill();
    ctx.strokeStyle = "#4a351f";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawBonds(world: World): void {
    const { ctx, camera } = this;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#5b6270";
    ctx.lineWidth = Math.max(2, camera.zoom * 0.07);
    ctx.beginPath();
    for (const bond of world.bonds) {
      if (!bond.active) continue;
      const a = camera.w2s(world.blobs[bond.a].x, world.blobs[bond.a].y);
      const b = camera.w2s(world.blobs[bond.b].x, world.blobs[bond.b].y);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  private drawBlobs(world: World): void {
    const { ctx, camera } = this;
    for (const blob of world.blobs) {
      const p = camera.w2s(blob.x, blob.y);
      const r = blob.radius * camera.zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[blob.type];
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.14);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.stroke();
      this.drawGlyph(blob.type, p.x, p.y, r);
    }
  }

  private drawGlyph(type: BlockType, x: number, y: number, r: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = Math.max(1.2, r * 0.18);
    if (type === "sensor") {
      ctx.fillStyle = "#0e0f13";
      ctx.beginPath();
      ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8eaf0";
      ctx.beginPath();
      ctx.arc(x + r * 0.12, y, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "grip") {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.4, y - r * 0.3);
      ctx.lineTo(x, y + r * 0.35);
      ctx.lineTo(x + r * 0.4, y - r * 0.3);
      ctx.stroke();
    } else if (type === "contract") {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(x - r * 0.45, y + i * r * 0.3);
        ctx.lineTo(x + r * 0.45, y + i * r * 0.3);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawTravellers(world: World): void {
    const { ctx, camera } = this;
    for (const t of world.travellers) {
      const pos = world.travellerPos(t);
      const p = camera.w2s(pos.x, pos.y);
      const r = 0.15 * camera.zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[t.type];
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.2);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.stroke();
    }
  }
}
