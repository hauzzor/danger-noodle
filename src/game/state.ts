export interface Progress {
  seed: number;
}

export function createProgress(seed: number): Progress {
  return { seed };
}
