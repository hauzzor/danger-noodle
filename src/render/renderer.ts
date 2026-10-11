import { Camera } from "../engine/camera";
import { groundY } from "../sim/terrain";
import { BLOB_RADIUS } from "../sim/units";
import type { World } from "../sim/world";
import type { Blob } from "../sim/types";
import type { DragRender } from "../ui/interaction";

const BG_TOP = "#103a22";
const BG_MID = "#0a2718";
const BG_BOTTOM = "#05160d";
const GROUND_TOP = "#2f7046";
const GROUND_BOTTOM = "#0f331f";
const GROUND_EDGE = "#4aa468";

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

  draw(world: World, drag: DragRender | null = null): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.drawBackground();
    this.drawGround();
    this.drawCollectibles(world);
    this.drawBonds(world);
    this.drawBlobs(world);
    this.drawTravellers(world);
    if (drag) this.drawGhost(world, drag);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private P(x: number, y: number): { x: number; y: number } {
    return this.camera.w2s(x, y);
  }

  private hue(blob: Blob): number {
    return 142 + (((blob.id * 47) % 13) - 6);
  }

  private blockColor(blob: Blob): string {
    return `hsl(${this.hue(blob)}, 45%, 43%)`;
  }

  private drawBackground(): void {
    const { ctx, camera } = this;
    const g = ctx.createLinearGradient(0, 0, 0, camera.vh);
    g.addColorStop(0, BG_TOP);
    g.addColorStop(0.55, BG_MID);
    g.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, camera.vw, camera.vh);
  }

  private drawGround(): void {
    const { ctx, camera } = this;
    const start = camera.s2w(0, 0);
    const end = camera.s2w(camera.vw, camera.vh);
    ctx.beginPath();
    let first = true;
    const stepW = 1 / camera.zoom;
    for (let x = start.x; x <= end.x; x += stepW) {
      const p = this.P(x, groundY(x));
      if (first) {
        ctx.moveTo(p.x, p.y);
        first = false;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    const bl = this.P(start.x, end.y);
    const br = this.P(end.x, end.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, this.P(0, 0).y, 0, this.P(0, end.y).y);
    g.addColorStop(0, GROUND_TOP);
    g.addColorStop(1, GROUND_BOTTOM);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = GROUND_EDGE;
    ctx.lineWidth = Math.max(2, camera.zoom * 0.06);
    ctx.stroke();
  }

  private drawCollectibles(world: World): void {
    const { ctx, camera } = this;
    for (const c of world.collectibles) {
      const p = this.P(c.x, c.y);
      const r = c.radius * camera.zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(120, 220, 150, 0.10)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = "hsl(145, 52%, 55%)";
      ctx.fill();
    }
  }

  private drawBeam(pa: { x: number; y: number }, pb: { x: number; y: number }, colorA: string, colorB: string, alpha = 1): void {
    const { ctx, camera } = this;
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2;
    const wEnd = Math.max(2, BLOB_RADIUS * camera.zoom * 0.6);
    const wMid = Math.max(1, wEnd * 0.22);

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(pa.x + nx * wEnd, pa.y + ny * wEnd);
    ctx.quadraticCurveTo(mx + nx * wMid, my + ny * wMid, pb.x + nx * wEnd, pb.y + ny * wEnd);
    ctx.lineTo(pb.x - nx * wEnd, pb.y - ny * wEnd);
    ctx.quadraticCurveTo(mx - nx * wMid, my - ny * wMid, pa.x - nx * wEnd, pa.y - ny * wEnd);
    ctx.closePath();
    const g = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
    g.addColorStop(0, colorA);
    g.addColorStop(1, colorB);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawBonds(world: World): void {
    for (const bond of world.bonds) {
      if (!bond.active) continue;
      const a = world.blobs[bond.a];
      const b = world.blobs[bond.b];
      if (!a || !b || a.removed || b.removed) continue;
      this.drawBeam(this.P(a.x, a.y), this.P(b.x, b.y), this.blockColor(a), this.blockColor(b));
    }
  }

  private drawBlock(blob: Blob, alpha = 1): void {
    const { ctx, camera } = this;
    const p = this.P(blob.x, blob.y);
    const r = blob.radius * camera.zoom;
    const h = this.hue(blob);
    const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
    g.addColorStop(0, `hsl(${h + 6}, 58%, 62%)`);
    g.addColorStop(1, `hsl(${h - 4}, 46%, 36%)`);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawBlobs(world: World): void {
    for (const blob of world.activeBlobs()) {
      if (blob.held) continue;
      this.drawBlock(blob);
    }
  }

  private drawTravellers(world: World): void {
    const { ctx, camera } = this;
    for (const t of world.travellers) {
      const pos = world.travellerPos(t);
      const p = this.P(pos.x, pos.y);
      const r = BLOB_RADIUS * camera.zoom * 0.55;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(160, 240, 190, 0.08)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = "hsl(146, 55%, 58%)";
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.25);
      ctx.strokeStyle = "rgba(210, 255, 225, 0.6)";
      ctx.stroke();
    }
  }

  private drawGhost(world: World, drag: DragRender): void {
    const { ctx, camera } = this;
    const ghost: Blob = {
      id: drag.id,
      type: drag.type,
      x: drag.pos.x,
      y: drag.pos.y,
      px: drag.pos.x,
      py: drag.pos.y,
      radius: BLOB_RADIUS,
      invMass: 1,
      onGround: false,
      held: false,
      removed: false,
    };

    for (const other of world.planBonds(drag.pos.x, drag.pos.y)) {
      this.drawBeam(
        this.P(drag.pos.x, drag.pos.y),
        this.P(other.x, other.y),
        this.blockColor(ghost),
        this.blockColor(other),
        0.45,
      );
    }
    this.drawBlock(ghost, 0.5);

    const p = this.P(drag.pos.x, drag.pos.y);
    const r = BLOB_RADIUS * camera.zoom;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(230, 255, 235, 0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
