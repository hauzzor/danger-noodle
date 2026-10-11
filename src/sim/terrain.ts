import { valueNoise1D } from "../engine/rng";

const hills = valueNoise1D(1337);
const bumps = valueNoise1D(7331);

export function groundY(x: number): number {
  const h = hills(x * 0.035) * 2 - 1;
  const b = bumps(x * 0.22) * 2 - 1;
  return h * 3.0 + b * 0.5;
}

export function groundSlope(x: number): number {
  const d = 0.25;
  return (groundY(x + d) - groundY(x - d)) / (2 * d);
}
