import { groundY } from "../sim/terrain";
import type { World } from "../sim/world";
import type { BlockType, SensorKind } from "../sim/types";

export const GOAL_SPACING = 42;

export interface Progress {
  seed: number;
  level: number;
}

export function createProgress(seed: number): Progress {
  return { seed, level: 0 };
}

export function goalXFor(level: number): number {
  return 45 + level * GOAL_SPACING;
}

export function setGoal(world: World, level: number): void {
  const gx = goalXFor(level);
  world.goal = { x: gx, y: groundY(gx) - 1 };
  world.goalReached = false;
}

export function grantReward(world: World): void {
  const specials: [BlockType, SensorKind | null][] = [
    ["sensor", "goal"],
    ["sensor", "food"],
    ["contract", null],
    ["grip", null],
    ["heart", null],
  ];
  const anchor = world.activeBlobs()[0];
  const ax = anchor ? anchor.x : world.goal.x - 6;
  const ay = anchor ? anchor.y : groundY(world.goal.x - 6) - 2;
  for (let i = 0; i < 3; i++) {
    const [type, sensor] = specials[Math.floor(Math.random() * specials.length)];
    world.spawnTravellerNear(ax, ay, type, sensor);
  }
}
