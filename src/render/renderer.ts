import { Camera } from "../engine/camera";
import { signalCss } from "../sim/palette";
import { BLOB_RADIUS } from "../sim/units";
import type { World } from "../sim/world";
import type { Blob, BlockType } from "../sim/types";
import type { DragRender } from "../ui/interaction";

const BG_TOP = "#103a22";
const BG_MID = "#0a2718";
const BG_BOTTOM = "#05160d";

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
    this.drawBonds(world);
    this.drawBlobs(world);
    this.drawTravellers(world);
    this.drawPulses(world);
    if (drag) this.drawGhost(world, drag);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private P(x: number, y: number): { x: number; y: number } {
    return this.camera.w2s(x, y);
  }

  private hue(blob: Blob): number {
    if (blob.type === "generator") return 2;
    if (blob.type === "contractor") return 205;
    if (blob.type === "grabber") return 40;
    if (blob.type === "flagella") return 300;
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

    // Procedural motes in world space, so the field parallaxes as you pan.
    const start = camera.s2w(0, 0);
    const end = camera.s2w(camera.vw, camera.vh);
    const step = 8;
    const x0 = Math.floor(start.x / step);
    const x1 = Math.ceil(end.x / step);
    const y0 = Math.floor(start.y / step);
    const y1 = Math.ceil(end.y / step);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const h = hash2(gx, gy);
        const a = ((h >>> 8) & 255) / 255;
        if (a < 0.5) continue;
        const px = (gx + (h & 255) / 255) * step;
        const py = (gy + ((h >>> 16) & 255) / 255) * step;
        const p = this.P(px, py);
        const r = Math.max(0.6, camera.zoom * 0.03) * (0.5 + a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(120, 220, 160, ${0.03 + a * 0.05})`;
        ctx.fill();
      }
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
      if (blob.type === "flagella") this.drawFlagellum(blob, world.flagellaAngle(blob), world.time);
      this.drawBlock(blob);
      if (blob.contracting || blob.grabbing) this.drawActiveGlow(blob);
    }
  }

  // A wavy flagellum tail reaching outward along `angle`.
  private drawFlagellum(blob: Blob, angle: number, t: number, alpha = 1): void {
    const { ctx, camera } = this;
    const hue = this.hue(blob);
    const base = blob.radius;
    const len = 2.6;
    const segs = 16;
    const amp = blob.firing ? 0.5 : 0.22;
    const dirx = Math.cos(angle);
    const diry = Math.sin(angle);
    const nx = -diry;
    const ny = dirx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = `hsl(${hue}, 60%, 62%)`;
    ctx.lineCap = "round";
    let prev: { x: number; y: number } | null = null;
    for (let i = 0; i <= segs; i++) {
      const f = i / segs;
      const along = base + f * len;
      const wave = Math.sin(f * Math.PI * 3 - t * 8) * amp * f;
      const p = this.P(blob.x + dirx * along + nx * wave, blob.y + diry * along + ny * wave);
      if (prev) {
        ctx.lineWidth = Math.max(0.6, (1 - f) * blob.radius * camera.zoom * 0.5 + 0.6);
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      prev = p;
    }
    ctx.restore();
  }

  private drawActiveGlow(blob: Blob): void {
    const { ctx, camera } = this;
    const p = this.P(blob.x, blob.y);
    const r = blob.radius * camera.zoom;
    const act = Math.max(0, Math.min(1, (1 - blob.contractAmount) * 2));
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 1.3, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${this.hue(blob)}, 90%, 78%, ${0.35 + 0.55 * act})`;
    ctx.lineWidth = Math.max(2, r * 0.28);
    ctx.stroke();
  }

  private travellerHue(type: BlockType): number {
    if (type === "generator") return 2;
    if (type === "contractor") return 205;
    if (type === "grabber") return 40;
    if (type === "flagella") return 300;
    return 146;
  }

  private drawTravellers(world: World): void {
    const { ctx, camera } = this;
    for (const t of world.travellers) {
      const pos = world.travellerPos(t);
      const p = this.P(pos.x, pos.y);
      const hue = this.travellerHue(t.type);

      if (!t.attached) {
        // Free loose block lying on the ground, waiting to be picked up.
        const r = t.radius * camera.zoom;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${hue}, 32%, 42%)`;
        ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.16);
        ctx.strokeStyle = `hsl(${hue}, 30%, 28%)`;
        ctx.stroke();
        continue;
      }

      const r = BLOB_RADIUS * camera.zoom * 0.55;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 60%, 60%, 0.10)`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue}, 60%, 58%)`;
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.25);
      ctx.strokeStyle = "rgba(230, 255, 240, 0.6)";
      ctx.stroke();
    }
  }

  private drawPulses(world: World): void {
    const { ctx, camera } = this;
    for (const pulse of world.pulses) {
      const front = pulse.age / pulse.hopTime;
      const fade = Math.max(0, 1 - pulse.age / (pulse.maxHops * pulse.hopTime));
      for (const bond of world.bonds) {
        if (!bond.active) continue;
        const da = pulse.hopDist.get(bond.a);
        const db = pulse.hopDist.get(bond.b);
        let parent: number;
        let child: number;
        let dparent: number;
        if (da != null && db != null && db === da + 1) {
          parent = bond.a;
          child = bond.b;
          dparent = da;
        } else if (da != null && db != null && da === db + 1) {
          parent = bond.b;
          child = bond.a;
          dparent = db;
        } else {
          continue;
        }
        const f = front - dparent;
        if (f < 0 || f > 1) continue;
        const a = world.blobs[parent];
        const b = world.blobs[child];
        if (!a || !b || a.removed || b.removed) continue;
        const p = this.P(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
        const r = 0.14 * camera.zoom;
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = signalCss(pulse.color);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
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
      emitOn: false,
      emitInterval: 1.5,
      emitDelay: 0,
      signalSpeed: 0,
      maxHops: 0,
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
      angle: 0,
      impulse: 0.6,
      firing: false,
      fireTimer: 0,
    };

    for (const id of drag.plan) {
      const other = world.getBlob(id);
      if (!other) continue;
      this.drawBeam(
        this.P(drag.pos.x, drag.pos.y),
        this.P(other.x, other.y),
        this.blockColor(ghost),
        this.blockColor(other),
        0.45,
      );
    }
    this.drawBlock(ghost, 0.5);
    if (drag.type === "flagella") this.drawFlagellum(ghost, world.flagellaAngle(ghost), world.time, 0.5);

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

function hash2(x: number, y: number): number {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}
