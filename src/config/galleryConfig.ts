import { fetchTotalSupply, fetchCollectionMetadata } from '@/utils/nftFetcher';

export interface NftCollection {
  contractAddress: string;
  tokenIds: number[]; // Array of token IDs available in this collection
  currentIndex: number; // Index of the currently displayed token in the tokenIds array
  collectionName?: string;
  collectionDescription?: string;
  totalSupply?: number;
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
  'north-wall': {
    contractAddress: PANTH_ART_ADDRESS,
    tokenIds: [1], // Start with token 1 as placeholder
    currentIndex: 0,
  },
  'south-wall': {
    contractAddress: SECOND_COLLECTION_ADDRESS, // Assigned the new collection
    tokenIds: [1], // Start with token 1 as placeholder
    currentIndex: 0,
  },
  'east-wall': {
    contractAddress: PANTH_ART_ADDRESS, 
    tokenIds: [1], // Start with token 1 as placeholder
    currentIndex: 0,
  },
  'west-wall': {
    contractAddress: PANTH_ART_ADDRESS, 
    tokenIds: [1], // Start with token 1 as placeholder
    currentIndex: 0,
  },
};

// Function to initialize the gallery configuration
export async function initializeGalleryConfig() {
  const collectionDataCache = new Map<string, { name: string; description: string; supply: number; tokens: number[] }>();
  const uniqueContractAddresses = [...new Set(Object.values(GALLERY_PANEL_CONFIG).map(c => c.contractAddress))];

  for (const address of uniqueContractAddresses) {
    try {
      const [metadata, supply] = await Promise.all([
        fetchCollectionMetadata(address),
        fetchTotalSupply(address)
      ]);
      const tokens = Array.from({ length: supply }, (_, i) => i + 1);
      collectionDataCache.set(address, {
        name: metadata.name,
        description: metadata.description,
        supply: supply,
        tokens: tokens,
      });
      console.log(`Collection ${metadata.name} initialized with ${supply} tokens.`);
    } catch (error) {
      console.error(`Failed to initialize collection at ${address}:`, error);
      collectionDataCache.set(address, {
        name: `Collection ${address.slice(0, 6)}...`,
        description: 'Could not load collection details.',
        supply: 1,
        tokens: [1],
      });
    }
  }

  for (const wallName in GALLERY_PANEL_CONFIG) {
    const config = GALLERY_PANEL_CONFIG[wallName];
    const data = collectionDataCache.get(config.contractAddress);
    
    if (data) {
      config.tokenIds = data.tokens;
      config.currentIndex = 0;
      config.collectionName = data.name;
      config.collectionDescription = data.description;
      config.totalSupply = data.supply;
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