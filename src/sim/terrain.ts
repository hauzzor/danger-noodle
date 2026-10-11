import { valueNoise1D } from "../engine/rng";

const hills = valueNoise1D(1337);
const bumps = valueNoise1D(7331);

export function groundY(x: number): number {
  const h = hills(x * 0.05) * 2 - 1;
  const b = bumps(x * 0.23) * 2 - 1;
  return h * 1.1 + b * 0.45;
}

export function groundSlope(x: number): number {
  const d = 0.25;
  return (groundY(x + d) - groundY(x - d)) / (2 * d);
}
