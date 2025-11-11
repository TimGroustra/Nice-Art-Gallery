import { fetchTotalSupply, fetchCollectionName } from '@/utils/nftFetcher';

export interface NftCollection {
  name: string;
  contractAddress: string;
  tokenIds: number[]; // Array of token IDs available in this collection
  currentIndex: number; // Index of the currently displayed token in the tokenIds array
}

export interface PanelConfig {
  [wallName: string]: NftCollection; // Key is the panel identifier (e.g., 'panel-1')
}

// The four collection addresses to cycle through for the 49 panels
const COLLECTION_ADDRESSES = [
  "0xe86fb488532e86d99574B9fed9D42ff4AC0FDE23", // Panth.art
  "0xcff0d88Ed5311bAB09178b6ec19A464100880984",
  "0x9d4E0280B3732fCEAeEeCD870613aB30bCDA7A31",
  "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4",
];

// Dynamically generate the configuration for 49 panels
const generateGalleryConfig = (): PanelConfig => {
  const config: PanelConfig = {};
  for (let i = 1; i <= 49; i++) {
    const panelId = `panel-${i}`;
    config[panelId] = {
      name: 'Loading...',
      // Cycle through the available contract addresses
      contractAddress: COLLECTION_ADDRESSES[(i - 1) % COLLECTION_ADDRESSES.length],
      tokenIds: [1], // Start with token 1 as a placeholder
      currentIndex: 0,
    };
  }
  return config;
};

// Initial configuration structure is now generated
let galleryConfig: PanelConfig = generateGalleryConfig();

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
  console.log(`Gallery configuration fully initialized for ${Object.keys(galleryConfig).length} panels.`);
}

// Export the configuration object reference
export const GALLERY_PANEL_CONFIG = galleryConfig;


// Utility function to get the current NFT source for a panel
export const getCurrentNftSource = (panelName: keyof PanelConfig) => {
  const config = GALLERY_PANEL_CONFIG[panelName];
  if (!config) return null;
  const tokenId = config.tokenIds[config.currentIndex];
  return {
    contractAddress: config.contractAddress,
    tokenId: tokenId,
  };
};

// Utility function to update the current index (used by NftGallery)
export const updatePanelIndex = (panelName: keyof PanelConfig, direction: 'next' | 'prev') => {
  const config = GALLERY_PANEL_CONFIG[panelName];
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