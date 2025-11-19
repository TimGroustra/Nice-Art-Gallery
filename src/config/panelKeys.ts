export const PANEL_KEYS: string[] = [];

const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall'];
const MAX_SEGMENT_INDEX = 4;

// Outer walls (50x50) - 5 segments * 4 walls = 20 panels
for (let i = 0; i <= MAX_SEGMENT_INDEX; i++) {
  for (const wallNameBase of WALL_NAMES) {
    PANEL_KEYS.push(`${wallNameBase}-${i}`);
  }
}

// Inner walls (30x30) - 2 segments * 4 walls * 2 sides = 16 panels
const innerWallBases = ['north-inner-wall', 'south-inner-wall', 'east-inner-wall', 'west-inner-wall'];
const innerWallSides = ['outer', 'inner'];
for (let i = 0; i < 2; i++) { // Corresponds to segments -10 and 10
  for (const base of innerWallBases) {
    for (const side of innerWallSides) {
      PANEL_KEYS.push(`${base}-${side}-${i}`);
    }
  }
}

// Center walls (10x10) - 4 walls = 4 panels
const centerWallBases = ['north-center-wall', 'south-center-wall', 'east-center-wall', 'west-center-wall'];
for (const base of centerWallBases) {
  PANEL_KEYS.push(`${base}-0`);
}