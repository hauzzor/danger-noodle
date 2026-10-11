export interface Point {
  x: number;
  y: number;
}

function cross(ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

function side(o: Point, a: Point, b: Point): number {
  return Math.sign(cross(o.x, o.y, a.x, a.y, b.x, b.y));
}

// Strict (proper) segment crossing: true only when the two segments cross in
// their interiors. Endpoint touching / collinear overlap is not a crossing.
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  return d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0 && d1 !== d2 && d3 !== d4;
}

export interface ClosestOnSegment {
  x: number;
  y: number;
  t: number;
}

export function closestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): ClosestOnSegment {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby || 1e-9;
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: ax + abx * t, y: ay + aby * t, t };
}

export interface SegmentPair {
  d: number;
  p1: ClosestOnSegment;
  p2: ClosestOnSegment;
}

// Closest points between two segments (Ericson, Real-Time Collision Detection).
export function segSegClosest(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): SegmentPair {
  const ux = bx - ax;
  const uy = by - ay;
  const vx = dx - cx;
  const vy = dy - cy;
  const wx = ax - cx;
  const wy = ay - cy;
  const a = ux * ux + uy * uy;
  const b = ux * vx + uy * vy;
  const c = vx * vx + vy * vy;
  const d = ux * wx + uy * wy;
  const e = vx * wx + vy * wy;
  const D = a * c - b * b;
  let sN: number;
  let sD = D;
  let tN: number;
  let tD = D;
  const EPS = 1e-9;
  if (D < EPS) {
    sN = 0;
    sD = 1;
    tN = e;
    tD = c;
  } else {
    sN = b * e - c * d;
    tN = a * e - b * d;
  }
  if (sN < 0) {
    sN = 0;
    tN = e;
    tD = c;
  } else if (sN > sD) {
    sN = sD;
    tN = e + b;
    tD = c;
  }
  if (tN < 0) {
    tN = 0;
    if (-d < 0) sN = 0;
    else if (-d > a) sN = sD;
    else {
      sN = -d;
      sD = a;
    }
  } else if (tN > tD) {
    tN = tD;
    if (-d + b < 0) sN = 0;
    else if (-d + b > a) sN = sD;
    else {
      sN = -d + b;
      sD = a;
    }
  }
  const s = sD ? sN / sD : 0;
  const t = tD ? tN / tD : 0;
  const p1: ClosestOnSegment = { x: ax + ux * s, y: ay + uy * s, t: s };
  const p2: ClosestOnSegment = { x: cx + vx * t, y: cy + vy * t, t };
  return { d: Math.hypot(p2.x - p1.x, p2.y - p1.y), p1, p2 };
}
