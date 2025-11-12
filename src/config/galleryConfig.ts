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

const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall'];
const NUM_SEGMENTS_70 = 7; // Outer 70x70 walls

// Inner room segment definitions
const INNER_SEGMENTS_50 = [-20, -10, 10, 20]; // 4 segments, skipping 0
const INNER_SEGMENTS_30 = [-10, 10]; // 2 segments, skipping 0

// Initial configuration structure (will be populated dynamically)
let galleryConfig: PanelConfig = {};

let contractIndexCounter = 0;

// 1. Outer 70x70 Walls (7 segments each, 28 total panels, all facing inward)
for (let i = 0; i < NUM_SEGMENTS_70; i++) {
    for (let j = 0; j < WALL_NAMES.length; j++) {
        const wallNameBase = WALL_NAMES[j];
        const panelKey = `${wallNameBase}-${i}`;
        
        const contractAddress = CONTRACT_ADDRESSES[contractIndexCounter % CONTRACT_ADDRESSES.length];
        contractIndexCounter++;

        galleryConfig[panelKey] = {
            name: 'Loading...',
            contractAddress: contractAddress,
            tokenIds: [1], 
            currentIndex: 0,
        };
    }
}

// 2. 50x50 Inner Walls (4 segments each, 8 panels per wall, 32 total panels, facing both ways)
for (const segmentCenter of INNER_SEGMENTS_50) {
    for (let j = 0; j < WALL_NAMES.length; j++) {
        const wallNameBase = WALL_NAMES[j];
        
        // Outer side (facing 70x70 corridor)
        const panelKeyOuter = `inner-50-${wallNameBase}-${segmentCenter}-outer`;
        const contractAddressOuter = CONTRACT_ADDRESSES[contractIndexCounter % CONTRACT_ADDRESSES.length];
        contractIndexCounter++;
        galleryConfig[panelKeyOuter] = {
            name: 'Loading...',
            contractAddress: contractAddressOuter,
            tokenIds: [1], 
            currentIndex: 0,
        };

        // Inner side (facing 30x30 corridor)
        const panelKeyInner = `inner-50-${wallNameBase}-${segmentCenter}-inner`;
        const contractAddressInner = CONTRACT_ADDRESSES[contractIndexCounter % CONTRACT_ADDRESSES.length];
        contractIndexCounter++;
        galleryConfig[panelKeyInner] = {
            name: 'Loading...',
            contractAddress: contractAddressInner,
            tokenIds: [1], 
            currentIndex: 0,
        };
    }
}

// 3. 30x30 Inner Inner Walls (2 segments each, 4 panels per wall, 16 total panels, facing both ways)
for (const segmentCenter of INNER_SEGMENTS_30) {
    for (let j = 0; j < WALL_NAMES.length; j++) {
        const wallNameBase = WALL_NAMES[j];
        
        // Outer side (facing 50x50 corridor)
        const panelKeyOuter = `inner-30-${wallNameBase}-${segmentCenter}-outer`;
        const contractAddressOuter = CONTRACT_ADDRESSES[contractIndexCounter % CONTRACT_ADDRESSES.length];
        contractIndexCounter++;
        galleryConfig[panelKeyOuter] = {
            name: 'Loading...',
            contractAddress: contractAddressOuter,
            tokenIds: [1], 
            currentIndex: 0,
        };

        // Inner side (facing 10x10 room)
        const panelKeyInner = `inner-30-${wallNameBase}-${segmentCenter}-inner`;
        const contractAddressInner = CONTRACT_ADDRESSES[contractIndexCounter % CONTRACT_ADDRESSES.length];
        contractIndexCounter++;
        galleryConfig[panelKeyInner] = {
            name: 'Loading...',
            contractAddress: contractAddressInner,
            tokenIds: [1], 
            currentIndex: 0,
        };
    }
}

// 4. 10x10 Innermost Walls (No panels)

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
      
      // Determine segment index for initial token selection
      // This logic is complex now, let's simplify initial index selection based on a hash or just sequential assignment
      
      // Simple sequential assignment based on the index of the wallName in the sorted keys
      const sortedKeys = Object.keys(galleryConfig).sort();
      const wallIndex = sortedKeys.indexOf(wallName);
      
      config.currentIndex = wallIndex % tokens.length; 
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