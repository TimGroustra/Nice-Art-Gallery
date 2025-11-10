import { fetchTotalSupply } from '@/utils/nftFetcher';

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

// The second collection address
const SECOND_COLLECTION_ADDRESS = "0xcff0d88Ed5311bAB09178b6ec19A464100880984";

// Initial configuration structure (will be populated dynamically)
let galleryConfig: PanelConfig = {
  'north-wall-left': {
    contractAddress: PANTH_ART_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  'north-wall-center': {
    contractAddress: SECOND_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  'north-wall-right': {
    contractAddress: PANTH_ART_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  'south-wall-left': {
    contractAddress: SECOND_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  'south-wall-center': {
    contractAddress: PANTH_ART_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  'south-wall-right': {
    contractAddress: SECOND_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
};

// Function to initialize the gallery configuration
export async function initializeGalleryConfig() {
  const collectionsToFetch = [
    { address: PANTH_ART_ADDRESS, name: 'Panth.art' },
    { address: SECOND_COLLECTION_ADDRESS, name: 'Second Collection' },
  ];

  const tokenMap: { [address: string]: number[] } = {};

  for (const { address, name } of collectionsToFetch) {
    try {
      const totalSupply = await fetchTotalSupply(address);
      // Assuming token IDs are 1-indexed (1 to totalSupply)
      tokenMap[address] = Array.from({ length: totalSupply }, (_, i) => i + 1);
      console.log(`Collection ${name} initialized with ${totalSupply} tokens.`);
    } catch (error) {
      console.error(`Failed to initialize collection ${name}:`, error);
      // Fallback to placeholder if fetching fails
      tokenMap[address] = [1];
    }
  }

  // Update all panels using the fetched token lists
  for (const wallName in galleryConfig) {
    const config = galleryConfig[wallName];
    const tokens = tokenMap[config.contractAddress];
    
    if (tokens && tokens.length > 0) {
      config.tokenIds = tokens;
      // Ensure currentIndex is valid (it should be 0 initially)
      config.currentIndex = 0; 
    }
  }
  console.log(`Gallery configuration fully initialized.`);
}

// Export the configuration object reference
export const GALLERY_PANEL_CONFIG = galleryConfig;


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
  if (!config || config.tokenIds.length === 0) return false;

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