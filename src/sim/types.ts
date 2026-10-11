export type BlockType = "basic";

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
  from: number;
  to: number;
  bond: number;
  t: number;
  speed: number;
  recent: number[];
}

export interface Collectible {
  id: number;
  type: BlockType;
  x: number;
  y: number;
  px: number;
  py: number;
  radius: number;
  collected: boolean;
}

export interface Neighbor {
  bond: number;
  other: number;
}

export interface Vec2 {
  x: number;
  y: number;
}
