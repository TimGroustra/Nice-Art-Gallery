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

const CONTRACT_ADDRESSES = [
  PANTH_ART_ADDRESS,
  SECOND_COLLECTION_ADDRESS,
  THIRD_COLLECTION_ADDRESS,
  FOURTH_COLLECTION_ADDRESS,
];

let contractIndex = 0;
const getNextContractAddress = () => {
  const address = CONTRACT_ADDRESSES[contractIndex % CONTRACT_ADDRESSES.length];
  contractIndex++;
  return address;
};

// Function to generate panel configurations based on wall positions
function generatePanelConfigs(): PanelConfig {
  const config: PanelConfig = {};
  
  // 1. Inner Room (10x10) - Existing 4 panels
  config['north-wall'] = { name: 'Loading...', contractAddress: getNextContractAddress(), tokenIds: [1], currentIndex: 0 };
  config['south-wall'] = { name: 'Loading...', contractAddress: getNextContractAddress(), tokenIds: [1], currentIndex: 0 };
  config['east-wall'] = { name: 'Loading...', contractAddress: getNextContractAddress(), tokenIds: [1], currentIndex: 0 };
  config['west-wall'] = { name: 'Loading...', contractAddress: getNextContractAddress(), tokenIds: [1], currentIndex: 0 };

  // 2. Outer Walls (30x30, 50x50, 70x70)
  const wallLayers = [
    // 30x30 walls (coord 15) - Panels centered at X/Z = +/- 10
    { coord: 15, segments: [-10, 10] }, 
    // 50x50 walls (coord 25) - Panels centered at X/Z = +/- 15
    { coord: 25, segments: [-15, 15] }, 
    // 70x70 walls (coord 35) - Panels centered every 10 units
    { coord: 35, segments: [-30, -20, -10, 0, 10, 20, 30] }, 
  ];

  wallLayers.forEach(({ coord, segments }) => {
    // North/South walls (Z = +/- coord, X varies)
    segments.forEach(x => {
      // North wall (Z = -coord)
      const northKey = `wall-N-${coord}-X${x}`;
      config[northKey] = { name: 'Loading...', contractAddress: getNextContractAddress(), tokenIds: [1], currentIndex: 0 };
      
      // South wall (Z = +coord)
      const southKey = `wall-S-${coord}-X${x}`;
      config[southKey] = { name: 'Loading...', contractAddress: getNextContractAddress(), tokenIds: [1], currentIndex: 0 };
    });

    // East/West walls (X = +/- coord, Z varies)
    segments.forEach(z => {
      // East wall (X = +coord)
      const eastKey = `wall-E-${coord}-Z${z}`;
      config[eastKey] = { name: 'Loading...', contractAddress: getNextContractAddress(), tokenIds: [1], currentIndex: 0 };
      
      // West wall (X = -coord)
      const westKey = `wall-W-${coord}-Z${z}`;
      config[westKey] = { name: 'Loading...', contractAddress: getNextContractAddress(), tokenIds: [1], currentIndex: 0 };
    });
  });
  
  return config;
}

// Initialize galleryConfig using the generator
export const GALLERY_PANEL_CONFIG: PanelConfig = generatePanelConfigs();


// Function to initialize the gallery configuration
export async function initializeGalleryConfig() {
  // Reset contract index for consistent initialization logging/fetching
  contractIndex = 0; 
  
  // Collect unique contract addresses from the generated config
  const uniqueContracts = Array.from(new Set(Object.values(GALLERY_PANEL_CONFIG).map(c => c.contractAddress)));

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
  for (const wallName in GALLERY_PANEL_CONFIG) {
    const config = GALLERY_PANEL_CONFIG[wallName];
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