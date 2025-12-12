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

/** Wall segment definition (also used for NFT panels). */
export interface Wall {
  key: string;
  position: Vec3;
  length: number;
  height: number;
  rotationY: number;
  material: MaterialId;
  hasPanel?: boolean;
}

/** Light definition used by the scene. */
export interface Light {
  id: string;
  type: "spot" | "point" | "area" | "neon";
  color: Color;
  intensity: number;
  position: Vec3;
  target?: Vec3;
  angle?: number;
}

/** Core layout definition. */
export interface LayoutDefinition {
  footprint: {
    width: number;
    depth: number;
    wallThickness: number;
  };
  walls: Wall[];
  lights: Light[];
}

/** Minimal viable layout – actual data is loaded elsewhere; this satisfies type‑checking. */
export const GalleryLayout: LayoutDefinition = {
  footprint: {
    width: 50,
    depth: 50,
    wallThickness: 0.3,
  },
  walls: [], // Real wall data will be populated at runtime
  lights: [], // Real light data will be populated at runtime
};