import type { World } from "./world";
import type { Neighbor, Traveller } from "./types";

function weightedPick(items: Neighbor[], weights: number[]): Neighbor {
  let total = 0;
  for (const w of weights) total += w;
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function edgeLength(world: World, t: Traveller): number {
  const a = world.blobs[t.from];
  const b = world.blobs[t.to];
  return Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
}

export function updateTravellers(world: World, dt: number): void {
  for (const t of world.travellers) {
    if (!t.attached) continue;
    t.t += (t.speed * dt) / edgeLength(world, t);

    let guard = 0;
    while (t.t >= 1 && guard++ < 64) {
      t.t -= 1;
      t.recent.unshift(t.bond);
      if (t.recent.length > 4) t.recent.pop();

      const arrived = t.to;
      const nbrs = world.neighbors(arrived);
      if (nbrs.length === 0) {
        t.t = Math.min(t.t, 1);
        break;
      }

      let candidates = nbrs.filter((n) => n.bond !== t.bond);
      if (candidates.length === 0) candidates = nbrs;

      const weights = candidates.map((n) => (t.recent.includes(n.bond) ? 1 : 4));
      const pick = weightedPick(candidates, weights);

      t.from = arrived;
      t.to = pick.other;
      t.bond = pick.bond;
    }
  }
}
