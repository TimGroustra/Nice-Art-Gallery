import { fetchTotalSupply, fetchCollectionName } from '@/utils/nftFetcher';

export interface NftCollection {
  name: string;
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

// The third collection address
const THIRD_COLLECTION_ADDRESS = "0x9d4E0280B3732fCEAeEeCD870613aB30bCDA7A31";

// The fourth collection address
const FOURTH_COLLECTION_ADDRESS = "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4";

// Initial configuration structure (will be populated dynamically)
let galleryConfig: PanelConfig = {
  // --- Inner Room Walls (10x10) ---
  'north-wall': {
    name: 'Loading...',
    contractAddress: PANTH_ART_ADDRESS,
    tokenIds: [1], // Start with token 1 as placeholder
    currentIndex: 0,
  },
  'south-wall': {
    name: 'Loading...',
    contractAddress: SECOND_COLLECTION_ADDRESS, 
    tokenIds: [1], 
    currentIndex: 0,
  },
  'east-wall': {
    name: 'Loading...',
    contractAddress: THIRD_COLLECTION_ADDRESS, 
    tokenIds: [1], 
    currentIndex: 0,
  },
  'west-wall': {
    name: 'Loading...',
    contractAddress: FOURTH_COLLECTION_ADDRESS, 
    tokenIds: [1], 
    currentIndex: 0,
  },
  
  // --- North Facing Panels (Z < 0) ---
  // 30x30 Walls (Z=-15)
  'wall-N-15-X-10': {
    name: 'Loading...',
    contractAddress: PANTH_ART_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  'wall-N-15-X--10': {
    name: 'Loading...',
    contractAddress: PANTH_ART_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  // 50x50 Walls (Z=-25)
  'wall-N-25-X-20': {
    name: 'Loading...',
    contractAddress: PANTH_ART_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  'wall-N-25-X--20': {
    name: 'Loading...',
    contractAddress: PANTH_ART_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  // 70x70 Wall (Z=-35)
  'wall-N-35-X-0': {
    name: 'Loading...',
    contractAddress: PANTH_ART_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },

  // --- South Facing Panels (Z > 0) ---
  // 30x30 Walls (Z=15)
  'wall-S-15-X-10': {
    name: 'Loading...',
    contractAddress: SECOND_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  'wall-S-15-X--10': {
    name: 'Loading...',
    contractAddress: SECOND_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  // 50x50 Walls (Z=25)
  'wall-S-25-X-20': {
    name: 'Loading...',
    contractAddress: SECOND_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  'wall-S-25-X--20': {
    name: 'Loading...',
    contractAddress: SECOND_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  // 70x70 Wall (Z=35)
  'wall-S-35-X-0': {
    name: 'Loading...',
    contractAddress: SECOND_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },

  // --- East Facing Panels (X > 0) ---
  // 30x30 Walls (X=15)
  'wall-E-15-Z-10': {
    name: 'Loading...',
    contractAddress: THIRD_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  'wall-E-15-Z--10': {
    name: 'Loading...',
    contractAddress: THIRD_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  // 50x50 Walls (X=25)
  'wall-E-25-Z-20': {
    name: 'Loading...',
    contractAddress: THIRD_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  'wall-E-25-Z--20': {
    name: 'Loading...',
    contractAddress: THIRD_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  // 70x70 Wall (X=35)
  'wall-E-35-Z-0': {
    name: 'Loading...',
    contractAddress: THIRD_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },

  // --- West Facing Panels (X < 0) ---
  // 30x30 Walls (X=-15)
  'wall-W-15-Z-10': {
    name: 'Loading...',
    contractAddress: FOURTH_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  'wall-W-15-Z--10': {
    name: 'Loading...',
    contractAddress: FOURTH_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  // 50x50 Walls (X=-25)
  'wall-W-25-Z-20': {
    name: 'Loading...',
    contractAddress: FOURTH_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  'wall-W-25-Z--20': {
    name: 'Loading...',
    contractAddress: FOURTH_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
  // 70x70 Wall (X=-35)
  'wall-W-35-Z-0': {
    name: 'Loading...',
    contractAddress: FOURTH_COLLECTION_ADDRESS,
    tokenIds: [1],
    currentIndex: 0,
  },
};

// Function to initialize the gallery configuration
export async function initializeGalleryConfig() {
  const uniqueContracts = Array.from(new Set(Object.values(galleryConfig).map(c => c.contractAddress)));

  const tokenMap: { [address: string]: number[] } = {};
  const nameMap: { [address: string]: string } = {};

  for (const address of uniqueContracts) {
    try {
      const totalSupply = await fetchTotalSupply(address);
      const name = await fetchCollectionName(address);
      // Assuming token IDs are 1-indexed (1 to totalSupply)
      tokenMap[address] = Array.from({ length: totalSupply }, (_, i) => i + 1);
      nameMap[address] = name;
      console.log(`Collection ${name} (${address}) initialized with ${totalSupply} tokens.`);
    } catch (error) {
      console.error(`Failed to initialize collection at ${address}:`, error);
      // Fallback to placeholder if fetching fails
      tokenMap[address] = [1];
      nameMap[address] = "Unknown Collection";
    }
  }

  // Update all panels using the fetched token lists and names
  for (const wallName in galleryConfig) {
    const config = galleryConfig[wallName];
    const tokens = tokenMap[config.contractAddress];
    const name = nameMap[config.contractAddress];
    
    if (tokens && tokens.length > 0) {
      config.tokenIds = tokens;
      config.currentIndex = 0; 
    }
    if (name) {
      config.name = name;
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