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

const GRACES_ADDRESS = "0x1760321f42A9BE39b39c779D92373769d829ef48";
const ELECTROGEMS_ADDRESS = "0xcff0d88Ed5311bAB09178b6ec19A464100880984";
const ETN_VIDEO_NFT_ADDRESS = "0xAcb0bd4EF927A2f4989c731eD6e2213326A02445"; // New ERC-1155 Video NFT

// --- CONTRACT ADDRESSES (20 outer + 16 inner + 4 center) ---
// The collections are now moved to the inner walls.
const ALL_CONTRACT_ADDRESSES = [
  // 20 panels for the 50x50 outer wall panels (Indices 0-19)
  GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, 
  GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS,
  GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS,
  GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS,

  // 20 collections for the inner walls (16 for 30x30, 4 for 10x10) (Indices 20-39)
  "0x9d4E0280B3732fCEAeEeCD870613aB30bCDA7A31", // 20 (Planet ETN)
  "0x56B33D971AfC1d2CEA35f20599E8EF5094Ffd399", // 21 (MEGA OGs)
  "0x31cbb613D14cc85Cf3A8889007562E4B5cE9518b", // 22 (Electric Legends - MOVED)
  "0x939548A645AD1C3164d82A168735DB1558c9EFDD", // 23 (Electroneum x Rarible)
  "0xAb7Ad6b7A272B52C752D5087fA0FE238cC9BFadF", // 24 (Baby Pandas)
  "0xD3Ec30829eb7DB12E96488c70EF715d96B2CCE42", // 25 (ETN Rock)
  "0xD7195E3c956Be88bA28dc0cbf65829dD7db6EA8a", // 26 (ElectroFox)
  "0xE76b450eE07CE833E10f9227F1Fbbc96e5f9514d", // 27 (HoneyBadgers)
  "0xe86fb488532e86d99574B9fed9D42ff4AC0FDE23", // 28 (Thirst & Thunder)
  "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4", // 29 (Verdant Kin)
  "0x3446c31703CA826F368B981E50971A00eA4C23be", // 30 (Limitless: Different Worlds)
  "0xe6db26D4F86108D2E9C21924dEf563fA393B8469", // 31 (Richard Ells on a Skateboard)
  ETN_VIDEO_NFT_ADDRESS, // 32 (ETN Video NFT - Replaced ElectroPunks)
  "0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1", // 33 (Club Watches)
  "0xc107C97710972e964d59000f610c07262638B508", // 34 (Non-Fungible Comrades)
  "0xF91290684eb728f6715EFF0b50018105B6B31658", // 35 (Electric Eels)
  ELECTROGEMS_ADDRESS, // 36 (ElectroGems)
  ELECTROGEMS_ADDRESS, // 37 (ElectroGems)
  ELECTROGEMS_ADDRESS, // 38 (ElectroGems)
  ELECTROGEMS_ADDRESS, // 39 (ElectroGems)
];

const CONTRACT_NAMES_MAP: { [key: string]: string } = {
  "0x9d4E0280B3732fCEAeEeCD870613aB30bCDA7A31": "Planet ETN",
  "0x56B33D971AfC1d2CEA35f20599E8EF5094Ffd399": "MEGA OGs",
  // Index 2 is blank
  "0x939548A645AD1C3164d82A168735DB1558c9EFDD": "Electroneum x Rarible",
  "0xAb7Ad6b7A272B52C752D5087fA0FE238cC9BFadF": "Baby Pandas",
  "0xD3Ec30829eb7DB12E96488c70EF715d96B2CCE42": "ETN Rock",
  "0xD7195E3c956Be88bA28dc0cbf65829dD7db6EA8a": "ElectroFox",
  "0xE76b450eE07CE833E10f9227F1Fbbc96e5f9514d": "HoneyBadgers",
  "0xe86fb488532e86d99574B9fed9D42ff4AC0FDE23": "Thirst & Thunder",
  "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4": "Verdant Kin",
  "0x3446c31703CA826F368B981E50971A00eA4C23be": "Limitless: Different Worlds",
  "0xe6db26D4F86108D2E9C21924dEf563fA393B8469": "Richard Ells on a Skateboard",
  [ETN_VIDEO_NFT_ADDRESS]: "ETN Video NFT", // New entry
  "0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1": "Club Watches",
  "0xc107C97710972e964d59000f610c07262638B508": "Non-Fungible Comrades",
  "0xcff0d88Ed5311bAB09178b6ec19A464100880984": "ElectroGems",
  // Index 16 is blank
  "0x31cbb613D14cc85Cf3A8889007562E4B5cE9518b": "Electric Legends",
  "0xF91290684eb728f6715EFF0b50018105B6B31658": "Electric Eels",
  "0x1760321f42A9BE39b39c779D92373769d829ef48": "The Three Graces of the Sea",
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
        const contractAddress = ALL_CONTRACT_ADDRESSES[k];

        galleryConfig[panelKey] = {
            name: CONTRACT_NAMES_MAP[contractAddress] || 'Unknown Collection',
            contractAddress: contractAddress,
            tokenIds: [1], // Start with token 1 as placeholder
            currentIndex: 0,
        };
    }
}

// Generate 16 panel configurations for inner 30x30 walls
const INNER_WALL_NAMES = ['north-inner-wall', 'south-inner-wall', 'east-inner-wall', 'west-inner-wall'];
const NUM_INNER_SEGMENTS_TO_USE = 2; // Segments at +/- 10

for (let i = 0; i < NUM_INNER_SEGMENTS_TO_USE; i++) { // 0, 1
    for (let j = 0; j < INNER_WALL_NAMES.length; j++) { // 0, 1, 2, 3
        const wallNameBase = INNER_WALL_NAMES[j];
        
        // Inner and Outer panels for each segment
        const panelKeyInner = `${wallNameBase}-inner-${i}`;
        const panelKeyOuter = `${wallNameBase}-outer-${i}`;

        // Calculate index k for the new contracts, starting from 20
        const baseK = 20 + (i * INNER_WALL_NAMES.length * 2) + (j * 2);
        const contractAddressInner = ALL_CONTRACT_ADDRESSES[baseK];
        const contractAddressOuter = ALL_CONTRACT_ADDRESSES[baseK + 1];

        galleryConfig[panelKeyInner] = {
            name: CONTRACT_NAMES_MAP[contractAddressInner] || 'Unknown Collection',
            contractAddress: contractAddressInner,
            tokenIds: [1],
            currentIndex: 0,
        };
        galleryConfig[panelKeyOuter] = {
            name: CONTRACT_NAMES_MAP[contractAddressOuter] || 'Unknown Collection',
            contractAddress: contractAddressOuter,
            tokenIds: [1],
            currentIndex: 0,
        };
    }
}

// Generate 4 panel configurations for the central 10x10 walls (outer-facing)
const CENTER_WALL_NAMES = ['north-center-wall', 'south-center-wall', 'east-center-wall', 'west-center-wall'];
for (let i = 0; i < CENTER_WALL_NAMES.length; i++) {
    const wallNameBase = CENTER_WALL_NAMES[i];
    const panelKey = `${wallNameBase}-0`; // Only one segment

    // Calculate index k for these contracts, starting from 36
    const k = 36 + i;
    const contractAddress = ALL_CONTRACT_ADDRESSES[k];

    galleryConfig[panelKey] = {
        name: CONTRACT_NAMES_MAP[contractAddress] || 'Unknown Collection',
        contractAddress: contractAddress,
        tokenIds: [1],
        currentIndex: 0,
    };
}

// Function to initialize the gallery configuration
export async function initializeGalleryConfig() {
  const uniqueContracts = Array.from(new Set(Object.values(galleryConfig).map(c => c.contractAddress))).filter(addr => addr !== "");

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
    
    // Handle blank panel case
    if (config.contractAddress === "") {
        config.name = "Blank Panel";
        config.tokenIds = [];
        config.currentIndex = 0;
        continue;
    }
    
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
  if (!config || config.contractAddress === "") return null;
  const tokenId = config.tokenIds[config.currentIndex];
  return {
    contractAddress: config.contractAddress,
    tokenId: tokenId,
  };
};

// Utility function to update the current index (used by NftGallery)
export const updatePanelIndex = (wallName: keyof PanelConfig, direction: 'next' | 'prev') => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || config.tokenIds.length === 0 || config.contractAddress === "") return false;

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