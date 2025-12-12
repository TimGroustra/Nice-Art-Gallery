/**
 * Layout definition used to drive both the web‑based Three.js gallery
 * and to export a ready‑to‑import description for Unity / Unreal.
 *
 * This layout features a 3-floor structure with a central atrium,
 * an octagonal pillar, and a spiral NFT display ribbon.
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
    floorY: number;
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
const L = 50; // Building length/width
const HALF_L = L / 2; // 25
const H1 = 6.0; // Floor 1 height
const H2 = 4.5; // Floor 2 height
const H3 = 4.5; // Floor 3 height

const FLOOR_Y_F1 = 0;
const FLOOR_Y_F2 = H1; // 6.0
const FLOOR_Y_F3 = H1 + H2; // 10.5

const Y_F1 = H1 / 2; // 3.0
const Y_F2 = H1 + H2 / 2; // 8.25
const Y_F3 = H1 + H2 + H3 / 2; // 12.75

const CENTER_X = 25;
const CENTER_Z = 25;
const ATRIUM_R = 11; // 22m diameter
const OCTAGON_R_FLAT = 3; // 6m flat-to-flat
const STAIR_WIDTH = 1.6;
const STAIR_INNER_R = OCTAGON_R_FLAT;
const STAIR_OUTER_R = STAIR_INNER_R + STAIR_WIDTH; // 4.6m

// Helper to generate octagon wall segments (Pillar)
function generateOctagonWalls(floor: number, height: number, yCenter: number, material: MaterialId): Wall[] {
    const walls: Wall[] = [];
    const sideLength = 2 * OCTAGON_R_FLAT * Math.tan(Math.PI / 8); // Approx 2.485m
    
    for (let i = 0; i < 8; i++) {
        const angle = i * (Math.PI / 4);
        const rotationY = angle;
        
        // Position of the wall center
        const x = CENTER_X + OCTAGON_R_FLAT * Math.sin(angle);
        const z = CENTER_Z + OCTAGON_R_FLAT * Math.cos(angle);
        
        walls.push({
            key: `octagon-${floor}-${i}`,
            position: [x, yCenter, z],
            length: sideLength,
            height: height,
            rotationY: rotationY,
            material: material,
            hasPanel: true, // All octagon faces have panels
        });
    }
    return walls;
}

// Helper to generate perimeter walls (50m long, split into segments)
function generatePerimeterWalls(floor: number, height: number, yCenter: number, material: MaterialId): Wall[] {
    const walls: Wall[] = [];
    const SEGMENT_LENGTH = 10;
    const NUM_SEGMENTS = 5;
    
    // North Wall (Z=50)
    for (let i = 0; i < NUM_SEGMENTS; i++) {
        const x = HALF_L - (NUM_SEGMENTS - 0.5 - i) * SEGMENT_LENGTH;
        walls.push({
            key: `wall-${floor}-N-${i}`,
            position: [x, yCenter, L - HALF_T],
            length: SEGMENT_LENGTH,
            height: height,
            rotationY: Math.PI,
            material: material,
            hasPanel: i === 2, // Center panel only
        });
    }
    
    // South Wall (Z=0)
    for (let i = 0; i < NUM_SEGMENTS; i++) {
        const x = HALF_L - (NUM_SEGMENTS - 0.5 - i) * SEGMENT_LENGTH;
        walls.push({
            key: `wall-${floor}-S-${i}`,
            position: [x, yCenter, HALF_T],
            length: SEGMENT_LENGTH,
            height: height,
            rotationY: 0,
            material: material,
            hasPanel: i === 2, // Center panel only
        });
    }
    
    // East Wall (X=50)
    for (let i = 0; i < NUM_SEGMENTS; i++) {
        const z = HALF_L - (NUM_SEGMENTS - 0.5 - i) * SEGMENT_LENGTH;
        walls.push({
            key: `wall-${floor}-E-${i}`,
            position: [L - HALF_T, yCenter, z],
            length: SEGMENT_LENGTH,
            height: height,
            rotationY: -Math.PI / 2,
            material: material,
            hasPanel: i === 2, // Center panel only
        });
    }
    
    // West Wall (X=0)
    for (let i = 0; i < NUM_SEGMENTS; i++) {
        const z = HALF_L - (NUM_SEGMENTS - 0.5 - i) * SEGMENT_LENGTH;
        walls.push({
            key: `wall-${floor}-W-${i}`,
            position: [HALF_T, yCenter, z],
            length: SEGMENT_LENGTH,
            height: height,
            rotationY: Math.PI / 2,
            material: material,
            hasPanel: i === 2, // Center panel only
        });
    }
    
    return walls;
}

// Helper to generate the NFT spiral display panels
function generateNftSpiralPanels(startFloorY: number, endFloorY: number, rotations: number = 3): Wall[] {
    const panels: Wall[] = [];
    const totalHeight = endFloorY - startFloorY; // 10.5m
    const numPanels = 36 * rotations; // 108 panels total
    const anglePerPanel = (rotations * 2 * Math.PI) / numPanels;
    const panelRadius = STAIR_OUTER_R + 0.5; // Outer stair radius (4.6m) + Offset (0.5m) = 5.1m
    const panelHeight = 1.0;
    const panelWidth = 1.0;
    const eyeLevelOffset = 1.5; // 1.5m above the step height
    
    for (let i = 0; i < numPanels; i++) {
        const currentAngle = i * anglePerPanel;
        const currentY = startFloorY + (i / numPanels) * totalHeight;
        
        // Panel center position
        const x = CENTER_X + panelRadius * Math.sin(currentAngle);
        const z = CENTER_Z + panelRadius * Math.cos(currentAngle);
        
        panels.push({
            key: `spiral-nft-${i}`,
            position: [x, currentY + eyeLevelOffset, z],
            length: panelWidth,
            height: panelHeight,
            rotationY: currentAngle + Math.PI, // Face outwards from the center
            material: MaterialId.WhitePlaster,
            hasPanel: true,
        });
    }
    return panels;
}

// Helper to generate the atrium inner walls (balustrades)
function generateAtriumWalls(floor: number, yStart: number, height: number): Wall[] {
    const walls: Wall[] = [];
    const yCenter = yStart + height / 2;
    const ATRIUM_WALL_SEGMENTS = 16;
    const ATRIUM_WALL_LENGTH = 2 * ATRIUM_R * Math.tan(Math.PI / ATRIUM_WALL_SEGMENTS);
    
    for (let i = 0; i < ATRIUM_WALL_SEGMENTS; i++) {
        const angle = i * (2 * Math.PI / ATRIUM_WALL_SEGMENTS);
        const rotationY = angle + Math.PI / 2; // Tangent to the circle
        
        // Position of the wall center (on the 11m radius circle)
        const x = CENTER_X + ATRIUM_R * Math.sin(angle);
        const z = CENTER_Z + ATRIUM_R * Math.cos(angle);
        
        walls.push({
            key: `atrium-${floor}-${i}`,
            position: [x, yCenter, z],
            length: ATRIUM_WALL_LENGTH,
            height: height,
            rotationY: rotationY,
            material: MaterialId.Glass, // Use Glass for balustrades
            hasPanel: false,
        });
    }
    return walls;
}

// Helper to generate the spiral staircase steps and railing
function generateSpiralStaircase(startFloorY: number, endFloorY: number, rotations: number = 3): Wall[] {
    const steps: Wall[] = [];
    const totalHeight = endFloorY - startFloorY; // 10.5m
    const numSteps = 36 * rotations; // 108 steps total (36 steps per rotation)
    const anglePerStep = (rotations * 2 * Math.PI) / numSteps;
    const stepHeight = totalHeight / numSteps; // Rise
    const stepDepth = 0.3; // Tread depth (approx)
    
    const STAIR_CENTER_R = (STAIR_INNER_R + STAIR_OUTER_R) / 2; // 3.8m

    for (let i = 0; i < numSteps; i++) {
        const currentAngle = i * anglePerStep;
        const currentY = startFloorY + i * stepHeight;
        
        // Step position (center of the step)
        const x = CENTER_X + STAIR_CENTER_R * Math.sin(currentAngle);
        const z = CENTER_Z + STAIR_CENTER_R * Math.cos(currentAngle);
        
        // Step geometry (a thin box)
        steps.push({
            key: `stair-step-${i}`,
            position: [x, currentY + stepHeight / 2, z],
            length: STAIR_WIDTH,
            height: stepHeight,
            rotationY: currentAngle + Math.PI / 2, // Aligned tangentially
            material: MaterialId.PolishedConcrete,
            hasPanel: false,
        });

        // Glass railing segment (placed on the outer edge of the step)
        const railingHeight = 1.1;
        const railingOffset = STAIR_OUTER_R - STAIR_CENTER_R; // 0.8m
        
        const railingX = CENTER_X + STAIR_OUTER_R * Math.sin(currentAngle);
        const railingZ = CENTER_Z + STAIR_OUTER_R * Math.cos(currentAngle);

        steps.push({
            key: `stair-rail-${i}`,
            position: [railingX, currentY + railingHeight / 2 + stepHeight, railingZ],
            length: STAIR_WIDTH,
            height: railingHeight,
            rotationY: currentAngle + Math.PI / 2, // Aligned tangentially
            material: MaterialId.Glass,
            hasPanel: false,
        });
    }
    return steps;
}


// --- Main Layout Definition ---

const F1_PERIMETER_WALLS = generatePerimeterWalls(1, H1, Y_F1, MaterialId.WhitePlaster);
const F2_PERIMETER_WALLS = generatePerimeterWalls(2, H2, Y_F2, MaterialId.WhitePlaster);
const F3_PERIMETER_WALLS = generatePerimeterWalls(3, H3, Y_F3, MaterialId.WhitePlaster);

const F1_OCTAGON_WALLS = generateOctagonWalls(1, H1, Y_F1, MaterialId.GraphiteMicrocement);
const F2_OCTAGON_WALLS = generateOctagonWalls(2, H2, Y_F2, MaterialId.GraphiteMicrocement);
const F3_OCTAGON_WALLS = generateOctagonWalls(3, H3, Y_F3, MaterialId.GraphiteMicrocement);

const F2_ATRIUM_WALLS = generateAtriumWalls(2, FLOOR_Y_F2, 1.1); // Balustrade height 1.1m
const F3_ATRIUM_WALLS = generateAtriumWalls(3, FLOOR_Y_F3, 1.1); // Balustrade height 1.1m

const SPIRAL_NFT_PANELS = generateNftSpiralPanels(FLOOR_Y_F1, FLOOR_Y_F3);
const SPIRAL_STAIRCASE = generateSpiralStaircase(FLOOR_Y_F1, FLOOR_Y_F3);

export const GalleryLayout: LayoutDefinition = {
  footprint: {
    width: L,
    depth: L,
    wallThickness: T,
  },

  rooms: [
    {
      name: "Ground Floor Hall",
      position: [0, 0, 0],
      size: [L, L],
      ceilingHeight: H1,
      floorY: FLOOR_Y_F1,
      material: MaterialId.PolishedConcrete,
    },
    {
      name: "Floor 2 Balcony",
      position: [0, 0, 0],
      size: [L, L],
      ceilingHeight: H2,
      floorY: FLOOR_Y_F2,
      material: MaterialId.PolishedConcrete,
    },
    {
      name: "Floor 3 Balcony",
      position: [0, 0, 0],
      size: [L, L],
      ceilingHeight: H3,
      floorY: FLOOR_Y_F3,
      material: MaterialId.PolishedConcrete,
    },
  ],

  walls: [
    // Perimeter Walls
    ...F1_PERIMETER_WALLS,
    ...F2_PERIMETER_WALLS,
    ...F3_PERIMETER_WALLS,
    // Octagon Pillar Walls
    ...F1_OCTAGON_WALLS,
    ...F2_OCTAGON_WALLS,
    ...F3_OCTAGON_WALLS,
    // Atrium Balustrades (F2 & F3)
    ...F2_ATRIUM_WALLS,
    ...F3_ATRIUM_WALLS,
    // Spiral NFT Panels
    ...SPIRAL_NFT_PANELS,
    // Spiral Staircase Steps and Railing
    ...SPIRAL_STAIRCASE,
  ],

  doors: [
    // Main Entrance (F1)
    {
      name: "Main Entrance",
      width: 4,
      start: [CENTER_X - 2, 0, 0],
      end: [CENTER_X + 2, 0, 0],
      connects: ["Exterior", "Ground Floor Hall"],
    },
    // Staircase Openings (F2 and F3 access points)
    // We assume the spiral staircase provides continuous access.
  ],

  lights: [
    // Octagon Neon Edges (F1, F2, F3)
    { id: "oct-neon-1", type: "neon", color: [0, 127, 255], intensity: 1000, position: [CENTER_X + 3.5, Y_F1, CENTER_Z] },
    { id: "oct-neon-2", type: "neon", color: [255, 0, 180], intensity: 1000, position: [CENTER_X - 3.5, Y_F1, CENTER_Z] },
    { id: "oct-neon-3", type: "neon", color: [0, 127, 255], intensity: 1000, position: [CENTER_X + 3.5, Y_F2, CENTER_Z] },
    { id: "oct-neon-4", type: "neon", color: [255, 0, 180], intensity: 1000, position: [CENTER_X - 3.5, Y_F2, CENTER_Z] },
    { id: "oct-neon-5", type: "neon", color: [0, 127, 255], intensity: 1000, position: [CENTER_X + 3.5, Y_F3, CENTER_Z] },
    { id: "oct-neon-6", type: "neon", color: [255, 0, 180], intensity: 1000, position: [CENTER_X - 3.5, Y_F3, CENTER_Z] },
    
    // Atrium Upward Wash (F1)
    { id: "atrium-wash-1", type: "point", color: [255, 255, 255], intensity: 5000, position: [CENTER_X, 0.5, CENTER_Z] },
    
    // Balcony Cove Lighting (F2)
    { id: "balcony-cove-2", type: "point", color: [255, 255, 255], intensity: 2000, position: [CENTER_X + ATRIUM_R - 1, FLOOR_Y_F2 + 0.5, CENTER_Z] },
    
    // Balcony Cove Lighting (F3)
    { id: "balcony-cove-3", type: "point", color: [255, 255, 255], intensity: 2000, position: [CENTER_X + ATRIUM_R - 1, FLOOR_Y_F3 + 0.5, CENTER_Z] },
    
    // Perimeter Spotlights (F1)
    { id: "spot-1-N", type: "spot", color: [255, 240, 230], intensity: 1500, position: [CENTER_X, H1 - 0.3, 45], target: [CENTER_X, 0, 45], angle: 30 },
    { id: "spot-1-S", type: "spot", color: [255, 240, 230], intensity: 1500, position: [CENTER_X, H1 - 0.3, 5], target: [CENTER_X, 0, 5], angle: 30 },
  ],
};