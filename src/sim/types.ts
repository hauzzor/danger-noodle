export type BlockType = "basic" | "generator" | "contractor" | "grabber";

export interface Blob {
  id: number;
  type: BlockType;
  x: number;
  y: number;
  px: number;
  py: number;
  radius: number;
  invMass: number;
  onGround: boolean;
  held: boolean;
  removed: boolean;
  emitOn: boolean;
  emitInterval: number;
  emitDelay: number;
  signalSpeed: number;
  maxHops: number;
  hopsInFlight: number;
  signalColor: number;
  acceptColors: number[];
  contracting: boolean;
  contractTimer: number;
  contractAmount: number;
  contractTo: number;
  contractTime: number;
  releaseTime: number;
  grabbing: boolean;
  grabTimer: number;
  grabX: number;
  grabY: number;
  grabForce: number;
  grabTime: number;
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
  // Attached travellers ride a beam (from/to/bond/t). Free travellers lie on
  // the ground with their own physics (x/y/px/py).
  attached: boolean;
  x: number;
  y: number;
  px: number;
  py: number;
  radius: number;
  from: number;
  to: number;
  bond: number;
  t: number;
  speed: number;
  recent: number[];
}

export interface Pulse {
  id: number;
  source: number;
  color: number;
  age: number;
  hopTime: number;
  maxHops: number;
  hopDist: Map<number, number>;
  delivered: Set<number>;
}

export interface Neighbor {
  bond: number;
  other: number;
}

export interface Vec2 {
  x: number;
  y: number;
}
