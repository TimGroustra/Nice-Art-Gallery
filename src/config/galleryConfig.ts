export interface NftCollection {
  contractAddress: string;
  tokenIds: number[]; // Array of token IDs available in this collection
  currentIndex: number; // Index of the currently displayed token in the tokenIds array
}

export interface PanelConfig {
  [wallName: string]: NftCollection; // Key is the wall identifier (e.g., 'north-wall')
}

// The Panth.art collection address
const PANTH_ART_ADDRESS = "0xe86fb488532e86d99574B9fed9D42ff4AC0FDE23";

// Define token IDs for each collection (using 1-20 for Panth.art for simplicity)
const panthArtTokens = Array.from({ length: 20 }, (_, i) => i + 1);

export const GALLERY_PANEL_CONFIG: PanelConfig = {
  'north-wall': {
    contractAddress: PANTH_ART_ADDRESS,
    tokenIds: panthArtTokens,
    currentIndex: 0,
  },
  'south-wall': {
    // Placeholder collection 2
    contractAddress: "0xPlaceholderSouth", 
    tokenIds: [1, 2, 3, 4, 5],
    currentIndex: 0,
  },
  'east-wall': {
    // Placeholder collection 3
    contractAddress: "0xPlaceholderEast", 
    tokenIds: [101, 102, 103],
    currentIndex: 0,
  },
  'west-wall': {
    // Placeholder collection 4
    contractAddress: "0xPlaceholderWest", 
    tokenIds: [201, 202, 203, 204],
    currentIndex: 0,
  },
};

// Utility function to get the current NFT source for a wall
export const getCurrentNftSource = (wallName: keyof PanelConfig) => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config) return null;
  const tokenId = config.tokenIds[config.currentIndex];
  return {
    contractAddress: config.contractAddress,
    tokenId: tokenId,
  };
};

// Utility function to update the current index (used by NftGallery)
export const updatePanelIndex = (wallName: keyof PanelConfig, direction: 'next' | 'prev') => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config) return false;

  let newIndex = config.currentIndex;
  const maxIndex = config.tokenIds.length - 1;

  if (direction === 'next') {
    newIndex = (newIndex + 1) % config.tokenIds.length;
  } else if (direction === 'prev') {
    newIndex = (newIndex - 1 + config.tokenIds.length) % config.tokenIds.length;
  }

  if (newIndex !== config.currentIndex) {
    config.currentIndex = newIndex;
    return true;
  }
  return false;
};