export interface PanelConfig {
  [key: string]: string; // Key is the panel identifier (e.g., 'north-wall-center-center'), value is the metadata URL
}

// Sample metadata URLs used to populate the gallery initially
const SAMPLE_URLS = [
  "https://raw.githubusercontent.com/dyad-sh/dyad-assets/main/nft-gallery-samples/sample1.json",
  "https://raw.githubusercontent.com/dyad-sh/dyad-assets/main/nft-gallery-samples/sample2.json",
  "https://raw.githubusercontent.com/dyad-sh/dyad-assets/main/nft-gallery-samples/sample3.json",
  "https://raw.githubusercontent.com/dyad-sh/dyad-assets/main/nft-gallery-samples/sample4.json",
  "https://raw.githubusercontent.com/dyad-sh/dyad-assets/main/nft-gallery-samples/sample5.json",
  "https://raw.githubusercontent.com/dyad-sh/dyad-assets/main/nft-gallery-samples/sample6.json",
];

// Helper to cycle through sample URLs to ensure all 20 panels have content
const getSampleUrl = (index: number) => SAMPLE_URLS[index % SAMPLE_URLS.length];

export const GALLERY_PANEL_CONFIG: PanelConfig = {
  // --- East Wall (Right side of the room, Z increases from Left-to-Right when facing the wall) ---
  'east-wall-left-left': getSampleUrl(0),
  'east-wall-left-center': getSampleUrl(1),
  'east-wall-center-center': getSampleUrl(2),
  'east-wall-right-center': getSampleUrl(3),
  'east-wall-right-right': getSampleUrl(4),

  // --- West Wall (Left side of the room, Z increases from Right-to-Left when facing the wall) ---
  'west-wall-right-right': getSampleUrl(5), // Z=-6
  'west-wall-right-center': getSampleUrl(6), // Z=-3
  'west-wall-center-center': getSampleUrl(7), // Z=0
  'west-wall-left-center': getSampleUrl(8), // Z=3
  'west-wall-left-left': getSampleUrl(9), // Z=6

  // --- South Wall (Back wall, X increases from Left-to-Right when facing the wall) ---
  'south-wall-left-left': getSampleUrl(10),
  'south-wall-left-center': getSampleUrl(11),
  'south-wall-center-center': getSampleUrl(12),
  'south-wall-right-center': getSampleUrl(13),
  'south-wall-right-right': getSampleUrl(14),

  // --- North Wall (Front wall, X increases from Right-to-Left when facing the wall) ---
  'north-wall-right-right': getSampleUrl(15), // X=-6
  'north-wall-right-center': getSampleUrl(16), // X=-3
  'north-wall-center-center': getSampleUrl(17), // X=0
  'north-wall-left-center': getSampleUrl(18), // X=3
  'north-wall-left-left': getSampleUrl(19), // X=6
};