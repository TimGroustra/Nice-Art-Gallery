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

// Constants for geometry calculation
const T = 0.3; // Wall thickness
const HALF_T = T / 2;
const H_MAIN = 4.5;
const H_FEATURE = 6;
const H_CORRIDOR = 4;
const PANEL_OFFSET = 0.15; // Distance from wall center to panel center
const PANEL_Y_MAIN = H_MAIN / 2;
const PANEL_Y_FEATURE = H_FEATURE / 2;
const PANEL_Y_CORRIDOR = H_CORRIDOR / 2;

/** Concrete layout data – matches the blueprint from the prompt. */
export const GalleryLayout: LayoutDefinition = {
  footprint: {
    width: 50,
    depth: 50,
    wallThickness: T,
  },

  rooms: [
    {
      name: "Digital Art Wall Zone",
      position: [0, 0, 0],
      size: [15, 5],
      ceilingHeight: H_MAIN,
      material: MaterialId.PolishedConcrete,
    },
    {
      name: "Reception",
      position: [15, 0, 0],
      size: [10, 5],
      ceilingHeight: H_MAIN,
      material: MaterialId.WhitePlaster,
    },
    {
      name: "Shop",
      position: [25, 0, 0],
      size: [10, 5],
      ceilingHeight: H_MAIN,
      material: MaterialId.WhitePlaster,
    },
    {
      name: "Storage / Prep",
      position: [35, 0, 0],
      size: [10, 5],
      ceilingHeight: H_MAIN,
      material: MaterialId.WhitePlaster,
    },
    {
      name: "WC Block",
      position: [45, 0, 0],
      size: [5, 5],
      ceilingHeight: H_MAIN,
      material: MaterialId.WhitePlaster,
    },
    {
      name: "Main Exhibition Hall",
      position: [0, 5, 0],
      size: [30, 30],
      ceilingHeight: H_MAIN,
      material: MaterialId.PolishedConcrete,
    },
    {
      name: "Feature Room",
      position: [0, 35, 0],
      size: [15, 15], // Adjusted to fit 50m depth
      ceilingHeight: H_FEATURE,
      material: MaterialId.DarkResin,
    },
    {
      name: "Neon Corridor",
      position: [15, 35, 0],
      size: [15, 15], // Adjusted to fit 50m depth
      ceilingHeight: H_CORRIDOR,
      material: MaterialId.DarkResin,
    },
    {
      name: "Rotating Gallery",
      position: [30, 25, 0],
      size: [20, 25], // Adjusted to fill remaining space
      ceilingHeight: H_MAIN,
      material: MaterialId.PolishedConcrete,
    },
  ],

  walls: [
    // --- Structural Walls (Collision/Material) ---

    // 1. Front Perimeter (Z=0)
    { key: "W-S-1", position: [7.5, PANEL_Y_MAIN, HALF_T], length: 15, height: H_MAIN, rotationY: 0, material: MaterialId.WhitePlaster },
    { key: "W-S-2", position: [20, PANEL_Y_MAIN, HALF_T], length: 10, height: H_MAIN, rotationY: 0, material: MaterialId.WhitePlaster },
    { key: "W-S-3", position: [30, PANEL_Y_MAIN, HALF_T], length: 10, height: H_MAIN, rotationY: 0, material: MaterialId.WhitePlaster },
    { key: "W-S-4", position: [40, PANEL_Y_MAIN, HALF_T], length: 10, height: H_MAIN, rotationY: 0, material: MaterialId.WhitePlaster },
    { key: "W-S-5", position: [47.5, PANEL_Y_MAIN, HALF_T], length: 5, height: H_MAIN, rotationY: 0, material: MaterialId.WhitePlaster },

    // 2. Back Perimeter (Z=50)
    { key: "W-N-1", position: [7.5, PANEL_Y_FEATURE, 50 - HALF_T], length: 15, height: H_FEATURE, rotationY: Math.PI, material: MaterialId.GraphiteMicrocement },
    { key: "W-N-2", position: [22.5, PANEL_Y_CORRIDOR, 50 - HALF_T], length: 15, height: H_CORRIDOR, rotationY: Math.PI, material: MaterialId.DarkResin },
    { key: "W-N-3", position: [40, PANEL_Y_MAIN, 50 - HALF_T], length: 20, height: H_MAIN, rotationY: Math.PI, material: MaterialId.WhitePlaster },

    // 3. West Perimeter (X=0)
    { key: "W-W-1", position: [HALF_T, PANEL_Y_MAIN, 2.5], length: 5, height: H_MAIN, rotationY: Math.PI / 2, material: MaterialId.PolishedConcrete },
    { key: "W-W-2", position: [HALF_T, PANEL_Y_MAIN, 20], length: 30, height: H_MAIN, rotationY: Math.PI / 2, material: MaterialId.WhitePlaster },
    { key: "W-W-3", position: [HALF_T, PANEL_Y_FEATURE, 42.5], length: 15, height: H_FEATURE, rotationY: Math.PI / 2, material: MaterialId.GraphiteMicrocement },

    // 4. East Perimeter (X=50)
    { key: "W-E-1", position: [50 - HALF_T, PANEL_Y_MAIN, 15], length: 20, height: H_MAIN, rotationY: -Math.PI / 2, material: MaterialId.WhitePlaster },
    { key: "W-E-2", position: [50 - HALF_T, PANEL_Y_MAIN, 37.5], length: 25, height: H_MAIN, rotationY: -Math.PI / 2, material: MaterialId.WhitePlaster },

    // 5. Internal Walls (X-direction)
    { key: "W-I-Z5-1", position: [7.5, PANEL_Y_MAIN, 5 - HALF_T], length: 15, height: H_MAIN, rotationY: Math.PI, material: MaterialId.WhitePlaster }, // Digital Wall / Main Hall
    { key: "W-I-Z5-2", position: [20, PANEL_Y_MAIN, 5 - HALF_T], length: 5, height: H_MAIN, rotationY: Math.PI, material: MaterialId.WhitePlaster }, // Reception / Main Hall (Door at 20-22)
    { key: "W-I-Z5-3", position: [30, PANEL_Y_MAIN, 5 - HALF_T], length: 10, height: H_MAIN, rotationY: Math.PI, material: MaterialId.WhitePlaster }, // Shop / Main Hall
    { key: "W-I-Z5-4", position: [40, PANEL_Y_MAIN, 5 - HALF_T], length: 10, height: H_MAIN, rotationY: Math.PI, material: MaterialId.WhitePlaster }, // Storage / Main Hall (Door at 45-46)
    { key: "W-I-Z5-5", position: [47.5, PANEL_Y_MAIN, 5 - HALF_T], length: 5, height: H_MAIN, rotationY: Math.PI, material: MaterialId.WhitePlaster }, // WC / Rotating Gallery

    { key: "W-I-Z35-1", position: [7.5, PANEL_Y_FEATURE, 35 + HALF_T], length: 15, height: H_FEATURE, rotationY: 0, material: MaterialId.GraphiteMicrocement }, // Feature Room / Main Hall
    { key: "W-I-Z35-2", position: [22.5, PANEL_Y_CORRIDOR, 35 + HALF_T], length: 15, height: H_CORRIDOR, rotationY: 0, material: MaterialId.DarkResin }, // Neon Corridor / Main Hall (Door at 22.5-24.5)

    { key: "W-I-Z25", position: [40, PANEL_Y_MAIN, 25 + HALF_T], length: 20, height: H_MAIN, rotationY: 0, material: MaterialId.WhitePlaster }, // Rotating Gallery / Main Hall

    // 6. Internal Walls (Z-direction)
    { key: "W-I-X15-1", position: [15 - HALF_T, PANEL_Y_MAIN, 2.5], length: 5, height: H_MAIN, rotationY: -Math.PI / 2, material: MaterialId.WhitePlaster }, // Digital Wall / Reception
    { key: "W-I-X15-2", position: [15 - HALF_T, PANEL_Y_FEATURE, 42.5], length: 15, height: H_FEATURE, rotationY: -Math.PI / 2, material: MaterialId.GraphiteMicrocement }, // Feature Room / Neon Corridor (Door at 45-46.5)

    { key: "W-I-X25", position: [25 - HALF_T, PANEL_Y_MAIN, 2.5], length: 5, height: H_MAIN, rotationY: -Math.PI / 2, material: MaterialId.WhitePlaster }, // Reception / Shop

    { key: "W-I-X30-1", position: [30 + HALF_T, PANEL_Y_MAIN, 15], length: 20, height: H_MAIN, rotationY: Math.PI / 2, material: MaterialId.WhitePlaster }, // Main Hall / Rotating Gallery (Z=5 to 25)
    { key: "W-I-X30-2", position: [30 + HALF_T, PANEL_Y_CORRIDOR, 42.5], length: 15, height: H_CORRIDOR, rotationY: Math.PI / 2, material: MaterialId.DarkResin }, // Neon Corridor / Rotating Gallery (Door at 45-46.5)

    { key: "W-I-X35", position: [35 - HALF_T, PANEL_Y_MAIN, 2.5], length: 5, height: H_MAIN, rotationY: -Math.PI / 2, material: MaterialId.WhitePlaster }, // Shop / Storage
    { key: "W-I-X45", position: [45 - HALF_T, PANEL_Y_MAIN, 2.5], length: 5, height: H_MAIN, rotationY: -Math.PI / 2, material: MaterialId.WhitePlaster }, // Storage / WC

    // --- Panel Walls (40 panels, 2m x 2m) ---

    // 1. Main Hall West Wall (5 panels)
    ...Array.from({ length: 5 }, (_, i) => ({
        key: `west-wall-${i}`,
        position: [HALF_T + PANEL_OFFSET, PANEL_Y_MAIN, 5 + 3 + i * 6],
        length: 2, height: 2, rotationY: Math.PI / 2, material: MaterialId.WhitePlaster, hasPanel: true,
    })),

    // 2. Main Hall East Wall (5 panels)
    ...Array.from({ length: 5 }, (_, i) => ({
        key: `east-wall-${i}`,
        position: [30 - HALF_T - PANEL_OFFSET, PANEL_Y_MAIN, 5 + 3 + i * 6],
        length: 2, height: 2, rotationY: -Math.PI / 2, material: MaterialId.WhitePlaster, hasPanel: true,
    })),

    // 3. Main Hall North Wall (5 panels, avoiding door at 22.5-24.5)
    { key: `north-wall-0`, position: [2.8125, PANEL_Y_MAIN, 35 - HALF_T - PANEL_OFFSET], length: 2, height: 2, rotationY: Math.PI, material: MaterialId.WhitePlaster, hasPanel: true },
    { key: `north-wall-1`, position: [8.4375, PANEL_Y_MAIN, 35 - HALF_T - PANEL_OFFSET], length: 2, height: 2, rotationY: Math.PI, material: MaterialId.WhitePlaster, hasPanel: true },
    { key: `north-wall-2`, position: [14.0625, PANEL_Y_MAIN, 35 - HALF_T - PANEL_OFFSET], length: 2, height: 2, rotationY: Math.PI, material: MaterialId.WhitePlaster, hasPanel: true },
    { key: `north-wall-3`, position: [19.6875, PANEL_Y_MAIN, 35 - HALF_T - PANEL_OFFSET], length: 2, height: 2, rotationY: Math.PI, material: MaterialId.WhitePlaster, hasPanel: true },
    { key: `north-wall-4`, position: [27.25, PANEL_Y_MAIN, 35 - HALF_T - PANEL_OFFSET], length: 2, height: 2, rotationY: Math.PI, material: MaterialId.WhitePlaster, hasPanel: true },

    // 4. Rotating Gallery South Wall (5 panels)
    ...Array.from({ length: 5 }, (_, i) => ({
        key: `south-wall-${i}`,
        position: [30 + 2 + i * 4, PANEL_Y_MAIN, 25 + HALF_T + PANEL_OFFSET],
        length: 2, height: 2, rotationY: 0, material: MaterialId.WhitePlaster, hasPanel: true,
    })),

    // 5. Feature Room West Wall (4 inner panels)
    ...Array.from({ length: 4 }, (_, i) => ({
        key: ['north-inner-wall-inner-0', 'north-inner-wall-outer-0', 'north-inner-wall-inner-1', 'north-inner-wall-outer-1'][i],
        position: [HALF_T + PANEL_OFFSET, PANEL_Y_FEATURE, 35 + 1.875 + i * 3.75],
        length: 2, height: 2, rotationY: Math.PI / 2, material: MaterialId.GraphiteMicrocement, hasPanel: true,
    })),

    // 6. Feature Room North Wall (4 inner panels)
    ...Array.from({ length: 4 }, (_, i) => ({
        key: ['south-inner-wall-inner-0', 'south-inner-wall-outer-0', 'south-inner-wall-inner-1', 'south-inner-wall-outer-1'][i],
        position: [1.875 + i * 3.75, PANEL_Y_FEATURE, 50 - HALF_T - PANEL_OFFSET],
        length: 2, height: 2, rotationY: Math.PI, material: MaterialId.GraphiteMicrocement, hasPanel: true,
    })),

    // 7. Neon Corridor North Wall (4 center panels)
    ...Array.from({ length: 4 }, (_, i) => ({
        key: ['north-center-wall-0', 'south-center-wall-0', 'east-center-wall-0', 'west-center-wall-0'][i],
        position: [15 + 1.875 + i * 3.75, PANEL_Y_CORRIDOR, 50 - HALF_T - PANEL_OFFSET],
        length: 2, height: 2, rotationY: Math.PI, material: MaterialId.DarkResin, hasPanel: true,
    })),

    // 8. Rotating Gallery North Wall (4 inner panels)
    ...Array.from({ length: 4 }, (_, i) => ({
        key: ['east-inner-wall-inner-0', 'east-inner-wall-outer-0', 'east-inner-wall-inner-1', 'east-inner-wall-outer-1'][i],
        position: [30 + 2.5 + i * 5, PANEL_Y_MAIN, 50 - HALF_T - PANEL_OFFSET],
        length: 2, height: 2, rotationY: Math.PI, material: MaterialId.WhitePlaster, hasPanel: true,
    })),

    // 9. Rotating Gallery East Wall (4 inner panels)
    ...Array.from({ length: 4 }, (_, i) => ({
        key: ['west-inner-wall-inner-0', 'west-inner-wall-outer-0', 'west-inner-wall-inner-1', 'west-inner-wall-outer-1'][i],
        position: [50 - HALF_T - PANEL_OFFSET, PANEL_Y_MAIN, 25 + 3.125 + i * 6.25],
        length: 2, height: 2, rotationY: -Math.PI / 2, material: MaterialId.WhitePlaster, hasPanel: true,
    })),
  ],

  doors: [
    {
      name: "Main Entrance → Reception",
      width: 2,
      start: [15, 0, 0],
      end: [17, 0, 0],
      connects: ["Digital Art Wall Zone", "Reception"],
    },
    {
      name: "Reception → Main Hall",
      width: 2,
      start: [20, 0, 5],
      end: [22, 0, 5],
      connects: ["Reception", "Main Exhibition Hall"],
    },
    {
      name: "Main Hall → Neon Corridor",
      width: 2,
      start: [22.5, 0, 35],
      end: [24.5, 0, 35],
      connects: ["Main Exhibition Hall", "Neon Corridor"],
    },
    {
      name: "Neon Corridor → Feature Room",
      width: 1.5,
      start: [15, 0, 45],
      end: [15, 0, 46.5],
      connects: ["Neon Corridor", "Feature Room"],
    },
    {
      name: "Neon Corridor → Rotating Gallery",
      width: 1.5,
      start: [30, 0, 45],
      end: [30, 0, 46.5],
      connects: ["Neon Corridor", "Rotating Gallery"],
    },
    {
      name: "Back‑of‑house",
      width: 1,
      start: [45, 0, 5],
      end: [46, 0, 5],
      connects: ["Storage / Prep", "Rotating Gallery"],
    },
  ],

  lights: [
    // Main Hall spotlights (grid 3m spacing)
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `main-spot-x-${i}`,
      type: "spot" as const,
      color: [255, 240, 230] as Color,
      intensity: 1500,
      position: [3 + i * 3, H_MAIN - 0.3, 20] as Vec3,
      target: [3 + i * 3, 0, 20] as Vec3,
      angle: 30,
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `main-spot-z-${i}`,
      type: "spot" as const,
      color: [255, 240, 230] as Color,
      intensity: 1500,
      position: [15, H_MAIN - 0.3, 8 + i * 3] as Vec3,
      target: [15, 0, 8 + i * 3] as Vec3,
      angle: 30,
    })),

    // Rotating Gallery wall washers
    {
      id: "rotating-washer-1",
      type: "area",
      color: [255, 250, 240],
      intensity: 2000,
      position: [40, H_MAIN - 0.3, 25],
      target: [40, 0, 50],
    },
    {
      id: "rotating-washer-2",
      type: "area",
      color: [255, 250, 240],
      intensity: 2000,
      position: [50, H_MAIN - 0.3, 37.5],
      target: [30, 0, 37.5],
    },

    // Feature Room (soft ceiling flicker – represented as a low‑intensity area light)
    {
      id: "feature-ceiling",
      type: "area",
      color: [180, 180, 255],
      intensity: 500,
      position: [7.5, H_FEATURE - 0.2, 42.5],
      target: [7.5, 0, 42.5],
    },

    // Neon Corridor neon ribbons (simulated with neon type lights)
    {
      id: "neon-ribbon-1",
      type: "neon",
      color: [0, 127, 255], // Electric Blue
      intensity: 800,
      position: [22.5, H_CORRIDOR - 0.2, 42.5],
    },
    {
      id: "neon-ribbon-2",
      type: "neon",
      color: [255, 0, 180], // Magenta
      intensity: 800,
      position: [22.5, H_CORRIDOR - 0.2, 37.5],
    },
  ],
};