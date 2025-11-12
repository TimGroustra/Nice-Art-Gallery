import { fetchTotalSupply, fetchCollectionName } from '@/utils/nftFetcher';

export interface NftCollection {
  name: string;
  contractAddress: string;
  tokenIds: number[]; // Array of token IDs available in this collection
  currentIndex: number; // Index of the currently displayed token in the tokenIds array
}

export interface PanelConfig {
  [wallName: string]: NftCollection; // Key is the wall identifier (e.g., 'north-wall-0')
}

// The Panth.art collection address
const PANTH_ART_ADDRESS = "0xe86fb488532e86d99574B9fed9D42ff4AC0FDE23";

// The second collection address
const SECOND_COLLECTION_ADDRESS = "0xcff0d88Ed5311bAB09178b6ec19A464100880984";

// The third collection address
const THIRD_COLLECTION_ADDRESS = "0x9d4E0280B3732fCEAeEeCD870613aB30bCDA7A31";

// The fourth collection address
const FOURTH_COLLECTION_ADDRESS = "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4";

const CONTRACT_ADDRESSES = [
  PANTH_ART_ADDRESS,
  SECOND_COLLECTION_ADDRESS,
  THIRD_COLLECTION_ADDRESS,
  FOURTH_COLLECTION_ADDRESS,
];

const OUTER_WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall'];
const OUTER_NUM_SEGMENTS = 7; // 70x70 walls

// Inner wall definitions based on NftGallery structure
const INNER_WALL_CONFIGS = [
    { prefix: 'inner-50', walls: OUTER_WALL_NAMES, indices: [0, 1, 3, 4] }, // 5 segments total, skipping index 2 (center walkway)
    { prefix: 'inner-30', walls: OUTER_WALL_NAMES, indices: [0, 2] }, // 3 segments total, skipping index 1 (center walkway)
    { prefix: 'inner-10', walls: OUTER_WALL_NAMES, indices: [0] }, // 1 segment total
];

// Initial configuration structure (will be populated dynamically)
let galleryConfig: PanelConfig = {};

let contractCounter = 0;

// 1. Generate Outer Wall Configurations (70x70)
for (let i = 0; i < OUTER_NUM_SEGMENTS; i++) {
    for (let j = 0; j < OUTER_WALL_NAMES.length; j++) {
        const wallNameBase = OUTER_WALL_NAMES[j];
        const panelKey = `${wallNameBase}-${i}`;
        
        const contractIndex = contractCounter % CONTRACT_ADDRESSES.length; 
        const contractAddress = CONTRACT_ADDRESSES[contractIndex];
        contractCounter++;

        galleryConfig[panelKey] = {
            name: 'Loading...',
            contractAddress: contractAddress,
            tokenIds: [1], // Start with token 1 as placeholder
            currentIndex: 0,
        };
    }
}

// 2. Generate Inner Wall Configurations (50x50, 30x30, 10x10)
for (const config of INNER_WALL_CONFIGS) {
    for (const wallNameBase of config.walls) {
        for (const i of config.indices) {
            // We need two panels per segment: one facing outward (corridor) and one facing inward (inner room)
            
            // Outer facing panel (e.g., inner-50-north-0-outer)
            const outerPanelKey = `${config.prefix}-${wallNameBase}-${i}-outer`;
            const contractIndexOuter = contractCounter % CONTRACT_ADDRESSES.length; 
            const contractAddressOuter = CONTRACT_ADDRESSES[contractIndexOuter];
            contractCounter++;

            galleryConfig[outerPanelKey] = {
                name: 'Loading...',
                contractAddress: contractAddressOuter,
                tokenIds: [1],
                currentIndex: 0,
            };

            // Inner facing panel (e.g., inner-50-north-0-inner)
            const innerPanelKey = `${config.prefix}-${wallNameBase}-${i}-inner`;
            const contractIndexInner = contractCounter % CONTRACT_ADDRESSES.length; 
            const contractAddressInner = CONTRACT_ADDRESSES[contractIndexInner];
            contractCounter++;

            galleryConfig[innerPanelKey] = {
                name: 'Loading...',
                contractAddress: contractAddressInner,
                tokenIds: [1],
                currentIndex: 0,
            };
        }
    }
}


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
      
      // Use a hash of the wallName to determine a starting index for variety
      let hash = 0;
      for (let i = 0; i < wallName.length; i++) {
        hash = wallName.charCodeAt(i) + ((hash << 5) - hash);
      }
      config.currentIndex = Math.abs(hash) % tokens.length; 
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