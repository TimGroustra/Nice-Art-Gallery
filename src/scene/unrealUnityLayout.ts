export type Vec3 = [number, number, number];
export type Color = [number, number, number];

/** Material identifiers – map these to engine materials when importing. */
export enum MaterialId {
  WhitePlaster = "white_plaster",
  GraphiteMicrocement = "graphite_microcement",
  PolishedConcrete = "polished_concrete",
  DarkResin = "dark_resin",
  AcousticBaffles = "acoustic_baffles",
  NeonRibbon = "neon_ribbon",
  Glass = "glass",
}

/** Definition of a wall segment (also used as a panel holder). */
export interface Wall {
  /** Unique key – also used as the panel identifier for NFT panels. */
  key: string;
  /** Center position of the wall (meters). */
  position: Vec3;
  /** Length of the wall (meters). */
  length: number;
  /** Height of the wall (meters). */
  height: number;
  /** Rotation around Y‑axis (radians). */
  rotationY: number;
  /** Material applied to the wall surface. */
  material: MaterialId;
  /** Optional flag – if true the wall holds an NFT panel. */
  hasPanel?: boolean;
}

/** Light definition – matches the architectural lighting plan. */
export interface Light {
  id: string;
  type: "spot" | "point" | "area" | "neon";
  color: Color;
  intensity: number;
  position: Vec3;
  target?: Vec3;
  angle?: number;
}

/** Core layout definition used by both the 3‑D scene and the config logic. */
export interface LayoutDefinition {
  footprint: {
    width: number;
    depth: number;
    wallThickness: number;
  };
  walls: Wall[];
  lights: Light[];
}

/** Minimal viable layout – real‑world data is loaded elsewhere; we only need the shape for type‑checking. */
export const GalleryLayout: LayoutDefinition = {
  footprint: {
    width: 50,
    depth: 50,
    wallThickness: 0.3,
  },
  walls: [],   // The actual wall data is defined in the full layout file; empty here is sufficient for compilation.
  lights: [],  // Same for lights.
};