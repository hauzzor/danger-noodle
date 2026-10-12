import type { Bond } from "./types";

export interface Compartment {
  verts: number[];
  area: number;
  pressure: number;
}

interface Pt {
  x: number;
  y: number;
}

// Enumerate the bounded faces (enclosed compartments) of the planar graph
// formed by the active beams. Beams never cross and blobs never overlap, so the
// graph is planar; the single unbounded face (the environment) is dropped.
export function findFaces(blobs: Pt[], bonds: Bond[]): { verts: number[]; area: number }[] {
  const n = blobs.length;
  const nbrs: number[][] = Array.from({ length: n }, () => []);
  for (const bd of bonds) {
    if (!bd.active) continue;
    if (bd.a < 0 || bd.b < 0 || bd.a >= n || bd.b >= n) continue;
    nbrs[bd.a].push(bd.b);
    nbrs[bd.b].push(bd.a);
  }

  // Sort each vertex's neighbours by angle (CCW).
  const pos = new Map<string, number>();
  for (let v = 0; v < n; v++) {
    const list = nbrs[v];
    list.sort(
      (p, q) =>
        Math.atan2(blobs[p].y - blobs[v].y, blobs[p].x - blobs[v].x) -
        Math.atan2(blobs[q].y - blobs[v].y, blobs[q].x - blobs[v].x),
    );
    list.forEach((w, i) => pos.set(`${v}_${w}`, i));
  }

  const visited = new Set<string>();
  const faces: { verts: number[]; area: number }[] = [];

  for (let v = 0; v < n; v++) {
    for (const w of nbrs[v]) {
      if (visited.has(`${v}>${w}`)) continue;
      const verts: number[] = [];
      let u = v;
      let cv = w;
      let guard = 0;
      while (!visited.has(`${u}>${cv}`) && guard++ < 100000) {
        visited.add(`${u}>${cv}`);
        verts.push(cv);
        const list = nbrs[cv];
        const i = pos.get(`${cv}_${u}`);
        if (i == null || list.length === 0) break;
        const nxt = list[(i + 1) % list.length];
        u = cv;
        cv = nxt;
      }
      if (verts.length < 3) continue;
      let area2 = 0;
      for (let k = 0; k < verts.length; k++) {
        const a = verts[k];
        const b = verts[(k + 1) % verts.length];
        area2 += blobs[a].x * blobs[b].y - blobs[b].x * blobs[a].y;
      }
      const signed = area2 / 2;
      if (signed > 1e-3) faces.push({ verts, area: signed });
    }
  }

  return faces;
}
