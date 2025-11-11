import { PanelDescriptor } from '@/components/WallSegment';
import { PanelConfig } from './galleryConfig';

// Define the structure for a single wall segment placement
export interface WallLayoutConfig {
  wallName: keyof PanelConfig;
  position: [number, number, number]; // Global X, Y, Z position of the group origin
  rotationY: number; // Global Y rotation
  panelDescriptors: PanelDescriptor[];
}

const UNIT_SIZE = 10; // The size of a single wall segment
const GRID_DIMENSION = 10; // The number of segments per side
const WORLD_OFFSET = (GRID_DIMENSION - 1) / 2; // Used to center the grid around origin (0,0)

export const GALLERY_LAYOUT: WallLayoutConfig[] = [];

// Generate North Wall (top boundary)
for (let i = 0; i < GRID_DIMENSION; i++) {
  GALLERY_LAYOUT.push({
    wallName: 'north-wall',
    position: [(i - WORLD_OFFSET) * UNIT_SIZE, 0, -WORLD_OFFSET * UNIT_SIZE - UNIT_SIZE / 2],
    rotationY: 0,
    panelDescriptors: [{ id: `main-n-${i}`, offsetX: 0 }],
  });
}

// Generate South Wall (bottom boundary)
for (let i = 0; i < GRID_DIMENSION; i++) {
  GALLERY_LAYOUT.push({
    wallName: 'south-wall',
    position: [(i - WORLD_OFFSET) * UNIT_SIZE, 0, WORLD_OFFSET * UNIT_SIZE + UNIT_SIZE / 2],
    rotationY: Math.PI,
    panelDescriptors: [{ id: `main-s-${i}`, offsetX: 0 }],
  });
}

// Generate West Wall (left boundary)
for (let j = 0; j < GRID_DIMENSION; j++) {
  GALLERY_LAYOUT.push({
    wallName: 'west-wall',
    position: [-WORLD_OFFSET * UNIT_SIZE - UNIT_SIZE / 2, 0, (j - WORLD_OFFSET) * UNIT_SIZE],
    rotationY: Math.PI / 2,
    panelDescriptors: [{ id: `main-w-${j}`, offsetX: 0 }],
  });
}

// Generate East Wall (right boundary)
for (let j = 0; j < GRID_DIMENSION; j++) {
  GALLERY_LAYOUT.push({
    wallName: 'east-wall',
    position: [WORLD_OFFSET * UNIT_SIZE + UNIT_SIZE / 2, 0, (j - WORLD_OFFSET) * UNIT_SIZE],
    rotationY: -Math.PI / 2,
    panelDescriptors: [{ id: `main-e-${j}`, offsetX: 0 }],
  });
}