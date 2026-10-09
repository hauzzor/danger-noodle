import { valueNoise1D } from "../engine/rng";

const noise = valueNoise1D(1337);

export function groundY(x: number): number {
  return noise(x * 0.08) * 2 - 1;
}
