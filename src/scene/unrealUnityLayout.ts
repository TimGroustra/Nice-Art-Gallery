/**
 * Layout definition used to drive both the web‑based Three.js gallery
 * and to export a ready‑to‑import description for Unity / Unreal.
 *
 * Each wall is a collision box with a material ID that matches the
 * material palette from the architectural blueprint.
 *
 * The data structure is deliberately simple so it can be serialized
 * to JSON and imported as a data table (Unreal) or ScriptableObject (Unity).
 */

export type Vec3 = [number, number, number];
export type Color = [number, number, number]; // RGB 0‑255

/** Material identifiers – map these to engine materials when importing. */
export enum MaterialId {
  WhitePlaster = "white_plaster",
  GraphiteMicrocement = "graphite_microcement",
  PolishedConcrete = "polished_concrete",
  DarkResin = "dark_resin",
  AcousticBaffles = "acoustic_baffles",
  NeonRibbon = "neon_ribbon",
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

/** Simple door / opening definition. */
export interface Door {
  /** Human‑readable name. */
  name: string;
  /** Width of the opening (meters). */
  width: number;
  /** World‑space start point (meters). */
  start: Vec3;
  /** World‑space end point (meters). */
  end: Vec3;
  /** Rooms that the door connects (by wall key or room name). */
  connects: [string, string];
}

/** Light definition – matches the architectural lighting plan. */
export interface Light {
  /** Unique identifier (used for engine light actors). */
  id: string;
  /** Type of light (point, spot, area, neon). */
  type: "spot" | "point" | "area" | "neon";
  /** Light colour (RGB). */
  color: Color;
  /** Intensity in lumens (or engine‑specific units). */
  intensity: number;
  /** Position in world space. */
  position: Vec3;
  /** For spot/area lights – where the light points. */
  target?: Vec3;
  /** Optional beam angle for spot lights (degrees). */
  angle?: number;
}

/** Full layout container. */
export interface LayoutDefinition {
  /** Overall building footprint (meters). */
  footprint: {
    width: number;
    depth: number;
    wallThickness: number;
  };
  /** All rooms (including their size & ceiling height). */
  rooms: {
    name: string;
    position: Vec3;
    size: [number, number]; // [width, depth]
    ceilingHeight: number;
    material: MaterialId;
  }[];
  /** All walls – each wall can optionally host an NFT panel. */
  walls: Wall[];
  /** Door / opening definitions. */
  doors: Door[];
  /** Light fixtures placed throughout the gallery. */
  lights: Light[];
}

/** Concrete layout data – matches the blueprint from the prompt. */
export const GalleryLayout: LayoutDefinition = {
  footprint: {
    width: 50,
    depth: 50,
    wallThickness: 0.3,
  },

  rooms: [
    {
      name: "Main Exhibition Hall",
      position: [0, 5, 0],
      size: [30, 30],
      ceilingHeight: 4.5,
      material: MaterialId.PolishedConcrete,
    },
    {
      name: "Rotating Gallery",
      position: [30, 25, 0],
      size: [15, 20],
      ceilingHeight: 4.5,
      material: MaterialId.PolishedConcrete,
    },
    {
      name: "Feature Room",
      position: [0, 35, 0],
      size: [15, 20],
      ceilingHeight: 6,
      material: MaterialId.DarkResin,
    },
    {
      name: "Neon Corridor",
      position: [15, 35, 0],
      size: [15, 20],
      ceilingHeight: 4,
      material: MaterialId.DarkResin,
    },
    {
      name: "Digital Art Wall Zone",
      position: [0, 0, 0],
      size: [15, 5],
      ceilingHeight: 4.5,
      material: MaterialId.PolishedConcrete,
    },
    {
      name: "Reception",
      position: [15, 0, 0],
      size: [10, 5],
      ceilingHeight: 4.5,
      material: MaterialId.WhitePlaster,
    },
    {
      name: "Shop",
      position: [25, 0, 0],
      size: [10, 5],
      ceilingHeight: 4.5,
      material: MaterialId.WhitePlaster,
    },
    {
      name: "Storage / Prep",
      position: [35, 0, 0],
      size: [10, 5],
      ceilingHeight: 4.5,
      material: MaterialId.WhitePlaster,
    },
    {
      name: "WC Block",
      position: [45, 0, 0],
      size: [5, 5],
      ceilingHeight: 4.5,
      material: MaterialId.WhitePlaster,
    },
  ],

  walls: [
    // ---- Main Hall perimeter walls (panel‑enabled) ----
    {
      key: "north-wall-0",
      position: [15, 4.5 / 2, 5 + 30],
      length: 30,
      height: 4.5,
      rotationY: 0,
      material: MaterialId.WhitePlaster,
      hasPanel: true,
    },
    {
      key: "south-wall-0",
      position: [15, 4.5 / 2, 5],
      length: 30,
      height: 4.5,
      rotationY: Math.PI,
      material: MaterialId.WhitePlaster,
      hasPanel: true,
    },
    {
      key: "west-wall-0",
      position: [0, 4.5 / 2, 20],
      length: 30,
      height: 4.5,
      rotationY: Math.PI / 2,
      material: MaterialId.WhitePlaster,
      hasPanel: true,
    },
    {
      key: "east-wall-0",
      position: [30, 4.5 / 2, 20],
      length: 30,
      height: 4.5,
      rotationY: -Math.PI / 2,
      material: MaterialId.WhitePlaster,
      hasPanel: true,
    },

    // ---- Rotating Gallery walls ----
    {
      key: "rotating-north",
      position: [37.5, 4.5 / 2, 25 + 20],
      length: 15,
      height: 4.5,
      rotationY: 0,
      material: MaterialId.WhitePlaster,
      hasPanel: true,
    },
    {
      key: "rotating-south",
      position: [37.5, 4.5 / 2, 25],
      length: 15,
      height: 4.5,
      rotationY: Math.PI,
      material: MaterialId.WhitePlaster,
      hasPanel: true,
    },
    {
      key: "rotating-west",
      position: [30, 4.5 / 2, 35],
      length: 20,
      height: 4.5,
      rotationY: Math.PI / 2,
      material: MaterialId.WhitePlaster,
      hasPanel: true,
    },
    {
      key: "rotating-east",
      position: [45, 4.5 / 2, 35],
      length: 20,
      height: 4.5,
      rotationY: -Math.PI / 2,
      material: MaterialId.WhitePlaster,
      hasPanel: true,
    },

    // ---- Feature Room walls (graphite) ----
    {
      key: "feature-north",
      position: [7.5, 6 / 2, 35 + 20],
      length: 15,
      height: 6,
      rotationY: 0,
      material: MaterialId.GraphiteMicrocement,
      hasPanel: true,
    },
    {
      key: "feature-south",
      position: [7.5, 6 / 2, 35],
      length: 15,
      height: 6,
      rotationY: Math.PI,
      material: MaterialId.GraphiteMicrocement,
      hasPanel: true,
    },
    {
      key: "feature-west",
      position: [0, 6 / 2, 45],
      length: 20,
      height: 6,
      rotationY: Math.PI / 2,
      material: MaterialId.GraphiteMicrocement,
      hasPanel: true,
    },
    {
      key: "feature-east",
      position: [15, 6 / 2, 45],
      length: 20,
      height: 6,
      rotationY: -Math.PI / 2,
      material: MaterialId.GraphiteMicrocement,
      hasPanel: true,
    },

    // ---- Neon Corridor walls (dark resin) ----
    {
      key: "corridor-north",
      position: [22.5, 4 / 2, 35 + 20],
      length: 15,
      height: 4,
      rotationY: 0,
      material: MaterialId.DarkResin,
      hasPanel: true,
    },
    {
      key: "corridor-south",
      position: [22.5, 4 / 2, 35],
      length: 15,
      height: 4,
      rotationY: Math.PI,
      material: MaterialId.DarkResin,
      hasPanel: true,
    },
    {
      key: "corridor-west",
      position: [15, 4 / 2, 45],
      length: 20,
      height: 4,
      rotationY: Math.PI / 2,
      material: MaterialId.DarkResin,
      hasPanel: true,
    },
    {
      key: "corridor-east",
      position: [30, 4 / 2, 45],
      length: 20,
      height: 4,
      rotationY: -Math.PI / 2,
      material: MaterialId.DarkResin,
      hasPanel: true,
    },

    // ---- Miscellaneous walls (reception, shop, etc.) ----
    {
      key: "digital-wall",
      position: [7.5, 4.5 / 2, 2.5],
      length: 15,
      height: 4.5,
      rotationY: 0,
      material: MaterialId.WhitePlaster,
      hasPanel: false,
    },
    {
      key: "reception-wall",
      position: [20, 4.5 / 2, 2.5],
      length: 10,
      height: 4.5,
      rotationY: 0,
      material: MaterialId.WhitePlaster,
      hasPanel: false,
    },
    {
      key: "shop-wall",
      position: [30, 4.5 / 2, 2.5],
      length: 10,
      height: 4.5,
      rotationY: 0,
      material: MaterialId.WhitePlaster,
      hasPanel: false,
    },
    {
      key: "storage-wall",
      position: [40, 4.5 / 2, 2.5],
      length: 10,
      height: 4.5,
      rotationY: 0,
      material: MaterialId.WhitePlaster,
      hasPanel: false,
    },
    {
      key: "wc-wall",
      position: [47.5, 4.5 / 2, 2.5],
      length: 5,
      height: 4.5,
      rotationY: 0,
      material: MaterialId.WhitePlaster,
      hasPanel: false,
    },
  ],

  doors: [
    {
      name: "Main Entrance → Reception",
      width: 2,
      start: [15, 0, 0],
      end: [17, 0, 0],
      connects: ["digital-wall", "reception-wall"],
    },
    {
      name: "Reception → Main Hall",
      width: 2,
      start: [20, 0, 5],
      end: [22, 0, 5],
      connects: ["reception-wall", "south-wall-0"],
    },
    {
      name: "Main Hall → Neon Corridor",
      width: 2,
      start: [22.5, 0, 35],
      end: [24.5, 0, 35],
      connects: ["east-wall-0", "corridor-west"],
    },
    {
      name: "Neon Corridor → Feature Room",
      width: 1.5,
      start: [15, 0, 45],
      end: [16.5, 0, 45],
      connects: ["corridor-east", "feature-west"],
    },
    {
      name: "Neon Corridor → Rotating Gallery",
      width: 1.5,
      start: [30, 0, 45],
      end: [31.5, 0, 45],
      connects: ["corridor-east", "rotating-west"],
    },
    {
      name: "Back‑of‑house",
      width: 1,
      start: [45, 0, 5],
      end: [46, 0, 5],
      connects: ["shop-wall", "storage-wall"],
    },
  ],

  lights: [
    // Main Hall spotlights (grid 3m spacing)
    ...Array.from({ length: 11 }, (_, i) => ({
      id: `main-spot-${i}`,
      type: "spot" as const,
      color: [255, 240, 230] as Color,
      intensity: 1500,
      position: [i * 3, 4.2, 5] as Vec3,
      target: [i * 3, 0, 35] as Vec3,
      angle: 30,
    })),

    // Rotating Gallery wall washers
    {
      id: "rotating-washer-1",
      type: "area",
      color: [255, 250, 240],
      intensity: 2000,
      position: [37.5, 4.2, 25],
      target: [37.5, 0, 45],
    },
    {
      id: "rotating-washer-2",
      type: "area",
      color: [255, 250, 240],
      intensity: 2000,
      position: [45, 4.2, 35],
      target: [30, 0, 35],
    },

    // Feature Room (soft ceiling flicker – represented as a low‑intensity area light)
    {
      id: "feature-ceiling",
      type: "area",
      color: [180, 180, 255],
      intensity: 500,
      position: [7.5, 5.8, 45],
      target: [7.5, 0, 55],
    },

    // Neon Corridor neon ribbons (simulated with neon type lights)
    {
      id: "neon-ribbon-1",
      type: "neon",
      color: [0, 127, 255],
      intensity: 800,
      position: [22.5, 2, 45],
    },
    {
      id: "neon-ribbon-2",
      type: "neon",
      color: [255, 0, 180],
      intensity: 800,
      position: [22.5, 2, 35],
    },
  ],
};