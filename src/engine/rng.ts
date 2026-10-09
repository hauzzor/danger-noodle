export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function valueNoise1D(seed: number): (x: number) => number {
  const rand = mulberry32(seed);
  const table: number[] = [];
  for (let i = 0; i < 4096; i++) table.push(rand());
  const period = table.length;
  return (x: number) => {
    const xf = Math.floor(x);
    const t = x - xf;
    const a = table[((xf % period) + period) % period];
    const b = table[(((xf + 1) % period) + period) % period];
    const s = t * t * (3 - 2 * t);
    return a + (b - a) * s;
  };
}
