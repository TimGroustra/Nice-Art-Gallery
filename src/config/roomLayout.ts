import { PanelDescriptor } from '@/components/WallSegment';
import { PanelConfig } from './galleryConfig';

// Define the structure for a single wall segment placement
export interface WallLayoutConfig {
  wallName: string; // Can be a descriptive name for the wall segment itself
  position: [number, number, number]; // Global X, Y, Z position of the group origin
  rotationY: number; // Global Y rotation
  panelDescriptors: PanelDescriptor[];
  width?: number; // Optional width for this specific wall segment
}

// --- Layout Constants ---
const wallHeight = 4;
const mainRoomSize = 12;
const passageLength = 8;
const passageWidth = 4;
const subRoomSize = 10;

// The total size of the gallery floor area
export const galleryTotalSize = mainRoomSize + 2 * passageLength; // 12 + 16 = 28

// Helper for positioning
const mainRoomOffset = mainRoomSize / 2;
const passageOffset = mainRoomOffset + passageLength / 2;
const subRoomOffset = mainRoomOffset + passageLength;

export const GALLERY_LAYOUT: WallLayoutConfig[] = [
  // =================================================================
  // == 1. Main Central Room (12 Panels: 1-12)
  // =================================================================
  {
    wallName: 'main-north',
    position: [0, 0, -mainRoomOffset],
    rotationY: 0,
    width: mainRoomSize,
    panelDescriptors: [
      { id: 'panel-1', offsetX: -4 },
      { id: 'panel-2', offsetX: 0 },
      { id: 'panel-3', offsetX: 4 },
    ],
  },
  {
    wallName: 'main-south',
    position: [0, 0, mainRoomOffset],
    rotationY: Math.PI,
    width: mainRoomSize,
    panelDescriptors: [
      { id: 'panel-4', offsetX: -4 },
      { id: 'panel-5', offsetX: 0 },
      { id: 'panel-6', offsetX: 4 },
    ],
  },
  {
    wallName: 'main-east',
    position: [mainRoomOffset, 0, 0],
    rotationY: -Math.PI / 2,
    width: mainRoomSize,
    panelDescriptors: [
      { id: 'panel-7', offsetX: -4 },
      { id: 'panel-8', offsetX: 0 },
      { id: 'panel-9', offsetX: 4 },
    ],
  },
  {
    wallName: 'main-west',
    position: [-mainRoomOffset, 0, 0],
    rotationY: Math.PI / 2,
    width: mainRoomSize,
    panelDescriptors: [
      { id: 'panel-10', offsetX: -4 },
      { id: 'panel-11', offsetX: 0 },
      { id: 'panel-12', offsetX: 4 },
    ],
  },

  // =================================================================
  // == 2. Central Pillar (1 Panel: 49)
  // =================================================================
  {
    wallName: 'central-pillar-north',
    position: [0, 0, -1.5],
    rotationY: 0,
    width: 3,
    panelDescriptors: [{ id: 'panel-49', offsetX: 0 }],
  },
  // Add other pillar faces for solid appearance
  { wallName: 'central-pillar-south', position: [0, 0, 1.5], rotationY: Math.PI, width: 3, panelDescriptors: [] },
  { wallName: 'central-pillar-east', position: [1.5, 0, 0], rotationY: -Math.PI / 2, width: 3, panelDescriptors: [] },
  { wallName: 'central-pillar-west', position: [-1.5, 0, 0], rotationY: Math.PI / 2, width: 3, panelDescriptors: [] },


  // =================================================================
  // == 3. Passages (12 Panels: 13-24)
  // =================================================================
  // North Passage
  {
    wallName: 'passage-north-east-wall',
    position: [passageWidth / 2, 0, -passageOffset],
    rotationY: -Math.PI / 2,
    width: passageLength,
    panelDescriptors: [{ id: 'panel-13', offsetX: -2 }, { id: 'panel-14', offsetX: 2 }],
  },
  {
    wallName: 'passage-north-west-wall',
    position: [-passageWidth / 2, 0, -passageOffset],
    rotationY: Math.PI / 2,
    width: passageLength,
    panelDescriptors: [{ id: 'panel-15', offsetX: 0 }],
  },
  // South Passage
  {
    wallName: 'passage-south-east-wall',
    position: [passageWidth / 2, 0, passageOffset],
    rotationY: -Math.PI / 2,
    width: passageLength,
    panelDescriptors: [{ id: 'panel-16', offsetX: 0 }],
  },
  {
    wallName: 'passage-south-west-wall',
    position: [-passageWidth / 2, 0, passageOffset],
    rotationY: Math.PI / 2,
    width: passageLength,
    panelDescriptors: [{ id: 'panel-17', offsetX: -2 }, { id: 'panel-18', offsetX: 2 }],
  },
  // East Passage
  {
    wallName: 'passage-east-north-wall',
    position: [passageOffset, 0, -passageWidth / 2],
    rotationY: 0,
    width: passageLength,
    panelDescriptors: [{ id: 'panel-19', offsetX: -2 }, { id: 'panel-20', offsetX: 2 }],
  },
  {
    wallName: 'passage-east-south-wall',
    position: [passageOffset, 0, passageWidth / 2],
    rotationY: Math.PI,
    width: passageLength,
    panelDescriptors: [{ id: 'panel-21', offsetX: 0 }],
  },
  // West Passage
  {
    wallName: 'passage-west-north-wall',
    position: [-passageOffset, 0, -passageWidth / 2],
    rotationY: 0,
    width: passageLength,
    panelDescriptors: [{ id: 'panel-22', offsetX: 0 }],
  },
  {
    wallName: 'passage-west-south-wall',
    position: [-passageOffset, 0, passageWidth / 2],
    rotationY: Math.PI,
    width: passageLength,
    panelDescriptors: [{ id: 'panel-23', offsetX: -2 }, { id: 'panel-24', offsetX: 2 }],
  },

  // =================================================================
  // == 4. Sub-Rooms (24 Panels: 25-48)
  // =================================================================
  // North Sub-Room (Top of map)
  {
    wallName: 'subroom-north-back',
    position: [0, 0, -subRoomOffset],
    rotationY: 0,
    width: subRoomSize,
    panelDescriptors: [{ id: 'panel-25', offsetX: -3 }, { id: 'panel-26', offsetX: 0 }, { id: 'panel-27', offsetX: 3 }],
  },
  {
    wallName: 'subroom-north-east',
    position: [subRoomSize / 2, 0, -subRoomOffset],
    rotationY: -Math.PI / 2,
    width: subRoomSize,
    panelDescriptors: [{ id: 'panel-28', offsetX: -2.5 }, { id: 'panel-29', offsetX: 2.5 }],
  },
  {
    wallName: 'subroom-north-west',
    position: [-subRoomSize / 2, 0, -subRoomOffset],
    rotationY: Math.PI / 2,
    width: subRoomSize,
    panelDescriptors: [{ id: 'panel-30', offsetX: 0 }],
  },
  // South Sub-Room (Bottom of map)
  {
    wallName: 'subroom-south-back',
    position: [0, 0, subRoomOffset],
    rotationY: Math.PI,
    width: subRoomSize,
    panelDescriptors: [{ id: 'panel-31', offsetX: -3 }, { id: 'panel-32', offsetX: 0 }, { id: 'panel-33', offsetX: 3 }],
  },
  {
    wallName: 'subroom-south-east',
    position: [subRoomSize / 2, 0, subRoomOffset],
    rotationY: -Math.PI / 2,
    width: subRoomSize,
    panelDescriptors: [{ id: 'panel-34', offsetX: 0 }],
  },
  {
    wallName: 'subroom-south-west',
    position: [-subRoomSize / 2, 0, subRoomOffset],
    rotationY: Math.PI / 2,
    width: subRoomSize,
    panelDescriptors: [{ id: 'panel-35', offsetX: -2.5 }, { id: 'panel-36', offsetX: 2.5 }],
  },
  // East Sub-Room (Right of map)
  {
    wallName: 'subroom-east-back',
    position: [subRoomOffset, 0, 0],
    rotationY: -Math.PI / 2,
    width: subRoomSize,
    panelDescriptors: [{ id: 'panel-37', offsetX: -3 }, { id: 'panel-38', offsetX: 0 }, { id: 'panel-39', offsetX: 3 }],
  },
  {
    wallName: 'subroom-east-north',
    position: [subRoomOffset, 0, -subRoomSize / 2],
    rotationY: 0,
    width: subRoomSize,
    panelDescriptors: [{ id: 'panel-40', offsetX: -2.5 }, { id: 'panel-41', offsetX: 2.5 }],
  },
  {
    wallName: 'subroom-east-south',
    position: [subRoomOffset, 0, subRoomSize / 2],
    rotationY: Math.PI,
    width: subRoomSize,
    panelDescriptors: [{ id: 'panel-42', offsetX: 0 }],
  },
  // West Sub-Room (Left of map)
  {
    wallName: 'subroom-west-back',
    position: [-subRoomOffset, 0, 0],
    rotationY: Math.PI / 2,
    width: subRoomSize,
    panelDescriptors: [{ id: 'panel-43', offsetX: -3 }, { id: 'panel-44', offsetX: 0 }, { id: 'panel-45', offsetX: 3 }],
  },
  {
    wallName: 'subroom-west-north',
    position: [-subRoomOffset, 0, -subRoomSize / 2],
    rotationY: 0,
    width: subRoomSize,
    panelDescriptors: [{ id: 'panel-46', offsetX: 0 }],
  },
  {
    wallName: 'subroom-west-south',
    position: [-subRoomOffset, 0, subRoomSize / 2],
    rotationY: Math.PI,
    width: subRoomSize,
    panelDescriptors: [{ id: 'panel-47', offsetX: -2.5 }, { id: 'panel-48', offsetX: 2.5 }],
  },
];