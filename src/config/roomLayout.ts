import { PanelDescriptor } from '@/components/WallSegment';
import { PanelConfig } from './galleryConfig';

// Define the structure for a single wall segment placement
export interface WallLayoutConfig {
  wallName: keyof PanelConfig;
  position: [number, number, number]; // Global X, Y, Z position of the group origin
  rotationY: number; // Global Y rotation
  panelDescriptors: PanelDescriptor[];
}

const roomSize = 10;
const wallHeight = 4;

export const GALLERY_LAYOUT: WallLayoutConfig[] = [
  {
    wallName: 'north-wall',
    position: [0, 0, -roomSize / 2],
    rotationY: 0,
    panelDescriptors: [{ id: 'main', offsetX: 0 }],
  },
  {
    wallName: 'south-wall',
    position: [0, 0, roomSize / 2],
    rotationY: Math.PI,
    panelDescriptors: [{ id: 'main', offsetX: 0 }],
  },
  {
    wallName: 'east-wall',
    position: [roomSize / 2, 0, 0],
    rotationY: -Math.PI / 2,
    panelDescriptors: [{ id: 'main', offsetX: 0 }],
  },
  {
    wallName: 'west-wall',
    position: [-roomSize / 2, 0, 0],
    rotationY: Math.PI / 2,
    panelDescriptors: [{ id: 'main', offsetX: 0 }],
  },
];