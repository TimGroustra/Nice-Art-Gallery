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

// The ElectroGems collection address
const ELECTGEMS_ADDRESS = "0xe86fb488532e86d99574B9fed9D42ff4AC0FDE23";

// The Thirst & Thunder collection address
const THIRST_AND_THUNDER_ADDRESS = "0xcff0d88Ed5311bAB09178b6ec19A464100880984";

// Initial configuration structure (will be populated dynamically)
let galleryConfig: PanelConfig = {
  'north-wall': {
    name: 'Loading...',
    contractAddress: ELECTGEMS_ADDRESS,
    tokenIds: [1], // Start with token 1 as placeholder
    currentIndex: 0,
  },
  'south-wall': {
    name: 'Loading...',
    contractAddress: THIRST_AND_THUNDER_ADDRESS, // Assigned the new collection
    tokenIds: [1], // Start with token 1 as placeholder
    currentIndex: 0,
  },
  'east-wall': {
    name: 'Loading...',
    contractAddress: ELECTGEMS_ADDRESS, 
    tokenIds: [1], // Start with token 1 as placeholder
    currentIndex: 0,
  },
  'west-wall': {
    name: 'Loading...',
    contractAddress: ELECTGEMS_ADDRESS, 
    tokenIds: [1], // Start with token 1 as placeholder
    currentIndex: 0,
  },
};

// Function to initialize the gallery configuration
export async function initializeGalleryConfig() {
  // Get unique contract addresses from the initial config
  const uniqueAddresses = [...new Set(Object.values(galleryConfig).map(c => c.contractAddress))];

  const collectionDataCache: { [address: string]: { name: string; tokens: number[] } } = {};

  // Use Promise.all to fetch data for all unique collections concurrently
  await Promise.all(uniqueAddresses.map(async (address) => {
    try {
      const [name, totalSupply] = await Promise.all([
        fetchCollectionName(address),
        fetchTotalSupply(address)
      ]);
      
      const tokens = Array.from({ length: totalSupply }, (_, i) => i + 1);
      collectionDataCache[address] = { name, tokens };
      console.log(`Collection ${name} (${address}) initialized with ${totalSupply} tokens.`);
    } catch (error) {
      console.error(`Failed to initialize collection at ${address}:`, error);
      collectionDataCache[address] = { name: "Unnamed Collection", tokens: [1] };
    }
  }));

  // Update all panels using the fetched data from the cache
  for (const wallName in galleryConfig) {
    const config = galleryConfig[wallName];
    const data = collectionDataCache[config.contractAddress];
    
    if (data) {
      config.name = data.name;
      config.tokenIds = data.tokens;
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