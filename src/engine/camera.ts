export interface Vec2 {
  x: number;
  y: number;
}

export class Camera {
  x = 0;
  y = 0;
  zoom = 20;
  minZoom = 4;
  maxZoom = 100;

  vw = 0;
  vh = 0;

  setViewport(w: number, h: number): void {
    this.vw = w;
    this.vh = h;
  }

  w2s(wx: number, wy: number): Vec2 {
    return {
      x: (wx - this.x) * this.zoom + this.vw / 2,
      y: (wy - this.y) * this.zoom + this.vh / 2,
    };
  }

  s2w(sx: number, sy: number): Vec2 {
    return {
      x: (sx - this.vw / 2) / this.zoom + this.x,
      y: (sy - this.vh / 2) / this.zoom + this.y,
    };
  }

  panScreen(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.s2w(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.s2w(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
