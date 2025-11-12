import { fetchTotalSupply, fetchCollectionName } from '@/utils/nftFetcher';

export interface NftCollection {
  name: string;
  contractAddress: string;
  tokenIds: number[]; // Array of token IDs available in this collection
  currentIndex: number; // Index of the currently displayed token in the tokenIds array
}

export interface PanelConfig {
  [wallName: string]: NftCollection; // Key is the wall identifier (e.g., 'north-wall-1')
}

// The primary collection address used for all panels
const PRIMARY_COLLECTION_ADDRESS = "0xcff0d88Ed5311bAB09178b6ec19A464100880984";

// --- Wall Configuration Template ---
// This function creates a default configuration for a new wall panel.
// Use this template when adding new walls, specifying the contractAddress.
const createWallTemplate = (contractAddress: string): NftCollection => ({
  name: 'Loading...',
  contractAddress: contractAddress,
  tokenIds: [1], // Start with token 1 as placeholder
  currentIndex: 0,
});
// -----------------------------------

// Function to generate the initial configuration for 7 segments per wall
const generateInitialConfig = (): PanelConfig => {
    const config: PanelConfig = {};
    const directions = ['north', 'south', 'east', 'west'];
    const numSegments = 7;

    for (const direction of directions) {
        for (let i = 1; i <= numSegments; i++) {
            const wallName = `${direction}-wall-${i}`;
            config[wallName] = createWallTemplate(PRIMARY_COLLECTION_ADDRESS);
        }
    }
    return config;
};

// Initial configuration structure (will be populated dynamically)
let galleryConfig: PanelConfig = generateInitialConfig();

// Function to initialize the gallery configuration
export async function initializeGalleryConfig() {
  // Collect unique contract addresses from the current configuration
  const uniqueContracts = Array.from(new Set(
    Object.values(galleryConfig).map(config => config.contractAddress)
  ));

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
    const address = config.contractAddress;
    const tokens = tokenMap[address];
    const name = nameMap[address];
    
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