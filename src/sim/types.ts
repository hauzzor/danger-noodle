// All block types, in toolbar order. This is the single source of truth:
// adding a type here also gives it a "Create" button in the left toolbar.
export const BLOCK_TYPES = ["basic", "generator", "contractor", "grabber", "flagella", "camera", "eye"] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

// What a block belongs to. Autonomous NPC creatures come in species: a "basic"
// blob flees the player, a "predator" blob chases basic blobs.
export type BlobKind = "player" | "basic" | "predator";


export interface Blob {
  id: number;
  type: BlockType;
  // Ownership: 0 is the player's structure, >0 is an autonomous NPC (the value
  // is that creature's group id). NPCs are not player-controllable.
  faction: number;
  kind: BlobKind;
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
  angle: number;
  impulse: number;
  firing: boolean;
  fireTimer: number;
  fov: number;
  range: number;
  period: number;
  viewTimer: number;
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
  hasDirection: boolean;
  dirX: number;
  dirY: number;
  hasDistance: boolean;
  distance: number;
}

export interface Neighbor {
  bond: number;
  other: number;
}

export interface Vec2 {
  x: number;
  y: number;
}
