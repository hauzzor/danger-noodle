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
