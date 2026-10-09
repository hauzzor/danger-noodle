export type BlockType = "basic" | "sensor" | "grip" | "contract";

export interface Blob {
  id: number;
  type: BlockType;
  x: number;
  y: number;
  px: number;
  py: number;
  radius: number;
  invMass: number;
  pinned: boolean;
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

export interface Neighbor {
  bond: number;
  other: number;
}

export interface Vec2 {
  x: number;
  y: number;
}
