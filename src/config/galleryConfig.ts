import { fetchTotalSupply, fetchCollectionName } from '@/utils/nftFetcher';
import { getCachedNftMetadata } from '@/utils/metadataCache'; // Import caching utility

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
const NUM_SEGMENTS = 7;

// Initial configuration structure (will be populated dynamically)
let galleryConfig: PanelConfig = {};

// Generate 28 panel configurations, cycling through the 4 contract addresses
for (let i = 0; i < NUM_SEGMENTS; i++) {
    for (let j = 0; j < WALL_NAMES.length; j++) {
        const wallNameBase = WALL_NAMES[j];
        const panelKey = `${wallNameBase}-${i}`;
        // Cycle through the 4 contracts (0, 1, 2, 3, 0, 1, 2, 3, ...)
        // Using (i + j) ensures adjacent panels on the same wall use different contracts if possible.
        const contractIndex = (i + j) % CONTRACT_ADDRESSES.length; 
        const contractAddress = CONTRACT_ADDRESSES[contractIndex];

        galleryConfig[panelKey] = {
            name: 'Loading...',
            contractAddress: contractAddress,
            tokenIds: [1], // Start with token 1 as placeholder
            currentIndex: 0,
        };
    }
}

// Function to initialize the gallery configuration
export async function initializeGalleryConfig() {
  const uniqueContracts = Array.from(new Set(Object.values(galleryConfig).map(c => c.contractAddress)));

  const tokenMap: { [address: string]: number[] } = {};
  const nameMap: { [address: string]: string } = {};
  const prefetchPromises: Promise<any>[] = [];

  for (const address of uniqueContracts) {
    try {
      const totalSupply = await fetchTotalSupply(address);
      const name = await fetchCollectionName(address);
      
      // Assuming token IDs are 1-indexed (1 to totalSupply). 
      // fetchTotalSupply falls back to 100 if the call fails.
      const tokens = Array.from({ length: totalSupply }, (_, i) => i + 1);
      tokenMap[address] = tokens;
      nameMap[address] = name;
      console.log(`Collection ${name} (${address}) initialized with ${totalSupply} tokens.`);

      // --- Pre-fetch and cache metadata for all tokens in this collection ---
      tokens.forEach(tokenId => {
        // We don't await here, just collect the promises
        prefetchPromises.push(getCachedNftMetadata(address, tokenId).catch(e => {
          console.error(`Failed to pre-cache metadata for ${address}/${tokenId}:`, e);
          // Allow promise to fail without stopping the main initialization flow
        }));
      });
      // --------------------------------------------------------------------------

    } catch (error) {
      console.error(`Failed to initialize collection at ${address}:`, error);
      // Fallback to placeholder if fetching fails
      tokenMap[address] = [1];
      nameMap[address] = "Unknown Collection";
    }
  }

  // Wait for all metadata pre-fetching to complete (or fail)
  console.log(`Waiting for ${prefetchPromises.length} NFT metadata fetches to complete...`);
  await Promise.allSettled(prefetchPromises);
  console.log(`All initial NFT metadata fetches attempted.`);


  // Update all panels using the fetched token lists and names
  for (const wallName in galleryConfig) {
    const config = galleryConfig[wallName];
    const tokens = tokenMap[config.contractAddress];
    const name = nameMap[config.contractAddress];
    
    if (tokens && tokens.length > 0) {
      config.tokenIds = tokens;
      // Determine segment index from wallName (e.g., 'north-wall-3' -> 3)
      const segmentIndexMatch = wallName.match(/-(\d+)$/);
      const segmentIndex = segmentIndexMatch ? parseInt(segmentIndexMatch[1], 10) : 0;
      
      // Start index is segment index modulo total tokens available
      config.currentIndex = segmentIndex % tokens.length; 
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