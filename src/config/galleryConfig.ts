import { fetchTotalSupply } from '@/utils/nftFetcher';

export interface NftCollection {
  name: string;
  contractAddress: string;
  tokenIds: number[]; // Array of token IDs available in this collection
  currentIndex: number; // Index of the currently displayed token in the tokenIds array
}

export interface PanelConfig {
  [wallName: string]: NftCollection; // Key is the wall identifier (e.g., 'north-wall-0')
}

// --- CONTRACT ADDRESSES (20 collections for 50x50 walls, segments 0-4) ---
const CONTRACT_ADDRESSES_20 = [
  "0x9d4E0280B3732fCEAeEeCD870613aB30bCDA7A31", // 0
  "0x56B33D971AfC1d2CEA35f20599E8EF5094Ffd399", // 1
  "0x8C9a0D62f194d7595E7e68373b0678E109aA3CD3", // 2
  "0x939548A645AD1C3164d82A168735DB1558c9EFDD", // 3
  "0xAb7Ad6b7A272B52C752D5087fA0FE238cC9BFadF", // 4
  "0xD3Ec30829eb7DB12E96488c70EF715d96B2CCE42", // 5
  "0xD7195E3c956Be88bA28dc0cbf65829dD7db6EA8a", // 6
  "0xE76b450eE07CE833E10f9227F1Fbbc96e5f9514d", // 7
  "0xe86fb488532e86d99574B9fed9D42ff4AC0FDE23", // 8
  "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4", // 9
  "0x3446c31703CA826F368B981E50971A00eA4C23be", // 10
  "0xe6db26D4F86108D2E9C21924dEf563fA393B8469", // 11
  "0x0dD500d9eDEF4d0c4B0c50fa0C4faccB711FDA43", // 12
  "0xAcb0bd4EF927A2f4989c731eD6e2213326A02445", // 13
  "0xae67aB41E3fe5a459A8602dCFe21684C6caB5703", // 14
  "0x7782d0Af7642F0aE8bB40eFe36F83deE45DE9d55", // 15
  "0xc2DCd3A8cdAFb396DC9FCB606Ace530d1A106a1c", // 16
  "0x748723AF17899E3C2C1cA682be2733Bca87FDDc8", // 17
  "0xF91290684eb728f6715EFF0b50018105B6B31658", // 18
  "0xD5bBD743A47cD60e23FDA16Abf56F3aaA813Fe47", // 19
];

const CONTRACT_NAMES_MAP: { [key: string]: string } = {
  "0x9d4E0280B3732fCEAeEeCD870613aB30bCDA7A31": "Planet ETN",
  "0x56B33D971AfC1d2CEA35f20599E8EF5094Ffd399": "MEGA OGs",
  "0x8C9a0D62f194d7595E7e68373b0678E109aA3CD3": "Electro Bulls",
  "0x939548A645AD1C3164d82A168735DB1558c9EFDD": "Electroneum x Rarible",
  "0xAb7Ad6b7A272B52C752D5087fA0FE238cC9BFadF": "Baby Pandas",
  "0xD3Ec30829eb7DB12E96488c70EF715d96B2CCE42": "ETN Rock",
  "0xD7195E3c956Be88bA28dc0cbf65829dD7db6EA8a": "ElectroFox",
  "0xE76b450eE07CE833E10f9227F1Fbbc96e5f9514d": "HoneyBadgers",
  "0xe86fb488532e86d99574B9fed9D42ff4AC0FDE23": "Thirst & Thunder",
  "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4": "Verdant Kin",
  "0x3446c31703CA826F368B981E50971A00eA4C23be": "Limitless: Different Worlds",
  "0xe6db26D4F86108D2E9C21924dEf563fA393B8469": "Richard Ells on a Skateboard",
  "0x0dD500d9eDEF4d0c4B0c50fa0C4faccB711FDA43": "ElectroPunks",
  "0xAcb0bd4EF927A2f4989c731eD6e2213326A02445": "Voyage",
  "0xae67aB41E3fe5a459A8602dCFe21684C6caB5703": "New App Celebration",
  "0x7782d0Af7642F0aE8bB40eFe36F83deE45DE9d55": "Alien Transmission",
  "0xc2DCd3A8cdAFb396DC9FCB606Ace530d1A106a1c": "Electroneum 2.0",
  "0x748723AF17899E3C2C1cA682be2733Bca87FDDc8": "Blue Catto",
  "0xF91290684eb728f6715EFF0b50018105B6B31658": "Electric Eels",
  "0xD5bBD743A47cD60e23FDA16Abf56F3aaA813Fe47": "Thunder Swords",
};

const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall'];
// We only care about segments 0 through 4 (5 segments total)
const NUM_SEGMENTS_TO_USE = 5; 

// Initial configuration structure (will be populated dynamically)
let galleryConfig: PanelConfig = {};

// Generate 20 panel configurations (4 walls * 5 segments)
for (let i = 0; i < NUM_SEGMENTS_TO_USE; i++) {
    for (let j = 0; j < WALL_NAMES.length; j++) {
        const wallNameBase = WALL_NAMES[j];
        const panelKey = `${wallNameBase}-${i}`;
        
        // Map sequentially using index k = (j * 5) + i
        const k = (j * 5) + i;
        const contractAddress = CONTRACT_ADDRESSES_20[k];

        galleryConfig[panelKey] = {
            name: CONTRACT_NAMES_MAP[contractAddress] || 'Unknown Collection',
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

  for (const address of uniqueContracts) {
    try {
      const totalSupply = await fetchTotalSupply(address);
      // Collection name is now retrieved from the hardcoded map
      const name = CONTRACT_NAMES_MAP[address] || "Unknown Collection";
      
      // Assuming token IDs are 1-indexed (1 to totalSupply)
      tokenMap[address] = Array.from({ length: totalSupply }, (_, i) => i + 1);
      console.log(`Collection ${name} (${address}) initialized with ${totalSupply} tokens.`);
    } catch (error) {
      console.error(`Failed to initialize collection at ${address}:`, error);
      // Fallback to placeholder if fetching fails
      tokenMap[address] = [1];
    }
  }

  // Update all panels using the fetched token lists
  for (const wallName in galleryConfig) {
    const config = galleryConfig[wallName];
    const tokens = tokenMap[config.contractAddress];
    
    if (tokens && tokens.length > 0) {
      config.tokenIds = tokens;
      // Determine segment index from wallName (e.g., 'north-wall-3' -> 3)
      const segmentIndexMatch = wallName.match(/-(\d+)$/);
      const segmentIndex = segmentIndexMatch ? parseInt(segmentIndexMatch[1], 10) : 0;
      
      // Start index is segment index modulo total tokens available
      config.currentIndex = segmentIndex % tokens.length; 
    }
    // Name is already set during initial galleryConfig population
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