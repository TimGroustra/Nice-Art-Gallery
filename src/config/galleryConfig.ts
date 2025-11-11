import { fetchTotalSupply, fetchCollectionName } from '@/utils/nftFetcher';
// Removed import { showLoading, dismissToast, showError } from '@/utils/toast';

export interface NftCollection {
  name: string;
  contractAddress: string;
  tokenIds: number[]; // Array of token IDs available in this collection
  currentIndex: number; // Index of the currently displayed token in the tokenIds array
}

export interface PanelConfig {
  [wallName: string]: NftCollection; // Key is the wall identifier (e.g., 'north-wall-1')
}

// Collection addresses to be cycled through for the panels
const contractAddresses = [
  "0xcff0d88Ed5311bAB09178b6ec19A464100880984", // Electrogems
];

// Generate the gallery configuration dynamically
const generateGalleryConfig = (): PanelConfig => {
  const config: PanelConfig = {};
  let contractIndex = 0;

  const wallLayouts = [
    { prefix: 'north', count: 7 },
    { prefix: 'south', count: 7 },
    { prefix: 'east', count: 7 },
    { prefix: 'west', count: 7 },
    { prefix: 'north-inner', count: 4 },
    { prefix: 'south-inner', count: 4 },
    { prefix: 'east-inner', count: 4 },
    { prefix: 'west-inner', count: 4 },
    { prefix: 'north-innermost', count: 2 },
    { prefix: 'south-innermost', count: 2 },
    { prefix: 'east-innermost', count: 2 },
    { prefix: 'west-innermost', count: 2 },
  ];

  wallLayouts.forEach(layout => {
    for (let i = 1; i <= layout.count; i++) {
      const wallName = `${layout.prefix}-wall-${i}`;
      config[wallName] = {
        name: 'Loading...',
        contractAddress: contractAddresses[contractIndex % contractAddresses.length],
        tokenIds: [1], // Start with token 1 as placeholder
        currentIndex: 0,
      };
      contractIndex++;
    }
  });

  // Add central pillar walls
  for (let i = 1; i <= 4; i++) {
    const wallName = `center-pillar-${i}`;
    config[wallName] = {
      name: 'Loading...',
      contractAddress: contractAddresses[contractIndex % contractAddresses.length],
      tokenIds: [1],
      currentIndex: 0,
    };
    contractIndex++;
  }

  return config;
};


// Initial configuration structure (will be populated dynamically)
let galleryConfig: PanelConfig = generateGalleryConfig();

// Function to initialize the gallery configuration
export async function initializeGalleryConfig() {
  
  try {
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
        console.log(`[Gallery Config] Collection ${name} (${address}) initialized with ${totalSupply} tokens.`);
      } catch (error) {
        console.error(`[Gallery Config] Failed to initialize collection at ${address}:`, error);
        // Fallback to placeholder if fetching fails
        tokenMap[address] = [1];
        nameMap[address] = "Unknown Collection (Failed)";
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
    console.log(`[Gallery Config] Gallery configuration fully initialized.`);
  } catch (error) {
    console.error("[Gallery Config] Critical failure during initialization:", error);
  }
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