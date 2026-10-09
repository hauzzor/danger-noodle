import { Camera } from "../engine/camera";
import { groundY } from "../sim/terrain";
import type { World } from "../sim/world";
import type { BlockType } from "../sim/types";
import type { DragRender } from "../ui/interaction";

const COLORS: Record<BlockType, string> = {
  basic: "#9aa3b2",
  sensor: "#6ad1a3",
  grip: "#e0a458",
  contract: "#b07be0",
  heart: "#ff6b6b",
};

const SIGNAL_COLORS: Record<string, string> = {
  beat: "#ffd166",
  touch: "#e8eaf0",
  goal: "#6ad1a3",
  food: "#ef476f",
  tilt: "#8ecae6",
  stretch: "#b07be0",
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

  draw(world: World, drag: DragRender | null = null): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#0e0f13";
    ctx.fillRect(0, 0, this.camera.vw, this.camera.vh);

    this.drawGrid();
    this.drawGround();
    this.drawGoal(world);
    this.drawObstacles(world);
    this.drawCollectibles(world);
    this.drawBonds(world);
    this.drawBlobs(world);
    this.drawTravellers(world);
    this.drawPulses(world);
    if (drag) this.drawGhost(drag);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private P(x: number, y: number): { x: number; y: number } {
    return this.camera.w2s(x, y);
  }

  private drawGrid(): void {
    const { ctx, camera } = this;
    const start = camera.s2w(0, 0);
    const end = camera.s2w(camera.vw, camera.vh);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    for (let x = Math.floor(start.x); x <= end.x; x += 1) {
      const a = this.P(x, start.y);
      const b = this.P(x, end.y);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    for (let y = Math.floor(start.y); y <= end.y; y += 1) {
      const a = this.P(start.x, y);
      const b = this.P(end.x, y);
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
    ctx.fillStyle = "#241a12";
    ctx.fill();
    ctx.strokeStyle = "#4a351f";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawObstacles(world: World): void {
    const { ctx, camera } = this;
    for (const o of world.obstacles) {
      const p = this.P(o.x, o.y);
      const r = o.r * camera.zoom;
      if (o.kind === "rock") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = "#3a3f47";
        ctx.fill();
        ctx.strokeStyle = "#565c66";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = "#3b2a18";
        ctx.fillRect(p.x - r * 0.2, p.y, r * 0.4, r);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = "#2f5d3a";
        ctx.fill();
        ctx.strokeStyle = "#3f7a4e";
        ctx.stroke();
      }
    }
  }

  private drawGoal(world: World): void {
    const { ctx, camera } = this;
    const p = this.P(world.goal.x, world.goal.y);
    const r = 1.3 * camera.zoom;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = world.goalReached ? "rgba(106,209,163,0.25)" : "rgba(255,209,102,0.12)";
    ctx.fill();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(p.x - 1.5, p.y - r, 3, r);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r);
    ctx.lineTo(p.x + r * 0.5, p.y - r * 0.75);
    ctx.lineTo(p.x, p.y - r * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  private drawCollectibles(world: World): void {
    const { ctx, camera } = this;
    for (const c of world.collectibles) {
      const p = this.P(c.x, c.y);
      const r = c.radius * camera.zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[c.type];
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.16);
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.stroke();
    }
  }

  private drawBonds(world: World): void {
    const { ctx, camera } = this;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#5b6270";
    ctx.lineWidth = Math.max(2, camera.zoom * 0.07);
    ctx.beginPath();
    for (const bond of world.bonds) {
      if (!bond.active) continue;
      const a = world.blobs[bond.a];
      const b = world.blobs[bond.b];
      if (!a || !b || a.removed || b.removed) continue;
      const pa = this.P(a.x, a.y);
      const pb = this.P(b.x, b.y);
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
    }
    ctx.stroke();
  }

  private drawBlobs(world: World): void {
    const { ctx, camera } = this;
    for (const blob of world.activeBlobs()) {
      const p = this.P(blob.x, blob.y);
      const r = blob.radius * camera.zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[blob.type];
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.14);
      ctx.strokeStyle = blob.gripActive ? "#fff2c2" : "rgba(0,0,0,0.35)";
      ctx.stroke();
      this.drawGlyph(blob.type, p.x, p.y, r, blob.contractActive);
    }
  }

  private drawGlyph(type: BlockType, x: number, y: number, r: number, active: boolean): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = Math.max(1.2, r * 0.18);
    if (type === "sensor") {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = "#0e0f13";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + r * 0.12, y, r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = "#e8eaf0";
      ctx.fill();
    } else if (type === "grip") {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.45, y - r * 0.35);
      ctx.lineTo(x, y + r * 0.4);
      ctx.lineTo(x + r * 0.45, y - r * 0.35);
      ctx.stroke();
    } else if (type === "contract") {
      const gap = active ? r * 0.18 : r * 0.34;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(x - r * 0.45, y + i * gap);
        ctx.lineTo(x + r * 0.45, y + i * gap);
        ctx.stroke();
      }
    } else if (type === "heart") {
      ctx.beginPath();
      ctx.arc(x - r * 0.2, y - r * 0.1, r * 0.22, 0, Math.PI * 2);
      ctx.arc(x + r * 0.2, y - r * 0.1, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - r * 0.4, y - r * 0.05);
      ctx.lineTo(x, y + r * 0.45);
      ctx.lineTo(x + r * 0.4, y - r * 0.05);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawTravellers(world: World): void {
    const { ctx, camera } = this;
    for (const t of world.travellers) {
      const pos = world.travellerPos(t);
      const p = this.P(pos.x, pos.y);
      const r = 0.15 * camera.zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.7, 0, Math.PI * 2);
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

  private drawPulses(world: World): void {
    const { ctx, camera } = this;
    for (const pulse of world.pulses) {
      const front = pulse.age / pulse.hopTime;
      const fade = 1 - pulse.age / (pulse.maxHops * pulse.hopTime);
      const color = SIGNAL_COLORS[pulse.type] ?? "#ffffff";
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
        if (!a || !b) continue;
        const p = this.P(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
        const r = 0.12 * camera.zoom;
        ctx.globalAlpha = Math.max(0, Math.min(1, fade));
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawGhost(drag: DragRender): void {
    const { ctx, camera } = this;
    const p = this.P(drag.pos.x, drag.pos.y);
    const r = 0.24 * camera.zoom;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = COLORS[drag.type];
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}
