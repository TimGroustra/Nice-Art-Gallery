// Room Geometry
export const ROOM_SEGMENT_SIZE = 10;
export const NUM_SEGMENTS = 5;
export const ROOM_SIZE = ROOM_SEGMENT_SIZE * NUM_SEGMENTS;
export const WALL_HEIGHT = 4;
export const PANEL_Y_POSITION = 1.8;
export const BOUNDARY = ROOM_SIZE / 2 - 0.5;

// Panel and Text Geometry
export const TEXT_PANEL_WIDTH = 2.5;
export const TITLE_HEIGHT = 0.5;
export const DESCRIPTION_HEIGHT = 1.5;
export const ATTRIBUTES_HEIGHT = 1.5;
export const DESCRIPTION_PANEL_HEIGHT = TITLE_HEIGHT + DESCRIPTION_HEIGHT;
export const TITLE_PANEL_WIDTH = 4.0;

// Interaction
export const ARROW_DEPTH_OFFSET = 0.15;
export const ARROW_PANEL_OFFSET = 1.5;
export const TEXT_DEPTH_OFFSET = 0.16;
export const ARROW_COLOR_DEFAULT = 0xcccccc;
export const ARROW_COLOR_HOVER = 0x00ff00;
export const PLAYER_SPEED = 20.0;