export type BlockType = "basic" | "sensor" | "grip" | "contract" | "heart";
export type SensorKind = "touch" | "goal" | "food" | "tilt" | "stretch";
export type ActionKind = "grip" | "release" | "contract" | "extend";

export interface Condition {
  op: ">" | "<" | "=";
  value: number;
}

export interface Rule {
  id: number;
  trigger: string;
  condition: Condition | null;
  action: ActionKind;
  delay: number;
  duration: number;
  busyUntil: number;
}

export interface PendingAction {
  time: number;
  kind: "apply" | "revert";
  action: ActionKind;
}

export interface Blob {
  id: number;
  type: BlockType;
  sensorKind: SensorKind | null;
  x: number;
  y: number;
  px: number;
  py: number;
  radius: number;
  invMass: number;
  pinned: boolean;
  gripActive: boolean;
  contractActive: boolean;
  contractAmount: number;
  rules: Rule[];
  pending: PendingAction[];
  emitInterval: number;
  emitTimer: number;
  emitType: string;
  onGround: boolean;
  removed: boolean;
}

export interface Bond {
  a: number;
  b: number;
  rest: number;
  stiffness: number;
  active: boolean;
}

export interface Traveller {
  id: number;
  type: BlockType;
  sensorKind: SensorKind | null;
  from: number;
  to: number;
  bond: number;
  t: number;
  speed: number;
  recent: number[];
}

export interface Pulse {
  id: number;
  type: string;
  payload: number;
  source: number;
  age: number;
  hopTime: number;
  maxHops: number;
  hopDist: Map<number, number>;
  delivered: Set<number>;
}

export interface Collectible {
  id: number;
  type: BlockType;
  sensorKind: SensorKind | null;
  x: number;
  y: number;
  px: number;
  py: number;
  radius: number;
  collected: boolean;
}

export interface Obstacle {
  x: number;
  y: number;
  r: number;
  kind: "rock" | "tree";
}

export interface Neighbor {
  bond: number;
  other: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface SignalInfo {
  type: string;
  payload: number;
}
