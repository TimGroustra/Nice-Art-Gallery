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
const ETN_VIDEO_NFT_ADDRESS = "0x7F41080A13f5154Bcf9f72991AFEEd645b13B75C"; // Updated ERC-1155 Video NFT address

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

const shuffle = (array: any[]) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

const roomContracts: { [key: string]: string[] } = {
  'default': ALL_CONTRACT_ADDRESSES,
  '1': shuffle(ALL_CONTRACT_ADDRESSES),
  '2': shuffle(ALL_CONTRACT_ADDRESSES),
  '3': shuffle(ALL_CONTRACT_ADDRESSES),
};

const CONTRACT_NAMES_MAP: { [key: string]: string } = {
  "0x9d4E0280B3732fCEAeEeCD870613aB30bCDA7A31": "Planet ETN",
  "0x56B33D971AfC1d2CEA35f20599E8EF5094Ffd399": "MEGA OGs",
  "0x939548A645AD1C3164d82A168735DB1558c9EFDD": "Electroneum x Rarible",
  "0xAb7Ad6b7A272B52C752D5087fA0FE238cC9BFadF": "Baby Pandas",
  "0xD3Ec30829eb7DB12E96488c70EF715d96B2CCE42": "ETN Rock",
  "0xD7195E3c956Be88bA28dc0cbf65829dD7db6EA8a": "ElectroFox",
  "0xE76b450eE07CE833E10f9227F1Fbbc96e5f9514d": "HoneyBadgers",
  "0xe86fb488532e86d99574B9fed9D42ff4AC0FDE23": "Thirst & Thunder",
  "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4": "Verdant Kin",
  "0x3446c31703CA826F368B981E50971A00eA4C23be": "Limitless: Different Worlds",
  "0xe6db26D4F86108D2E9C21924dEf563fA393B8469": "Richard Ells on a Skateboard",
  [ETN_VIDEO_NFT_ADDRESS]: "Pope's Legendary Coffee",
  "0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1": "Club Watches",
  "0xc107C97710972e964d59000f610c07262638B508": "Non-Fungible Comrades",
  "0xcff0d88Ed5311bAB09178b6ec19A464100880984": "ElectroGems",
  "0x31cbb613D14cc85Cf3A8889007562E4B5cE9518b": "Electric Legends",
  "0xF91290684eb728f6715EFF0b50018105B6B31658": "Electric Eels",
  "0x1760321f42A9BE39b39c779D92373769d829ef48": "The Three Graces of the Sea",
};

let galleryConfig: PanelConfig = {};
const tokenMap: { [contractAddress: string]: number[] } = {};
const panelSequentialIndexMap: { [wallName: string]: number } = {};

export interface PanelSource {
  contract: string;
  tokenId: number;
}

/**
 * Fetches a single custom room configuration from the database.
 */
export interface CustomRoomData {
  id: string;
  name: string;
  description: string | null;
  creator_address: string;
  panels: PanelSource[]; // Updated to array of specific panels
  visual_effect: 'default' | 'disco' | 'cinematic';
  audio_url: string | null;
  start_time: string;
  end_time: string;
}

// Placeholder for Supabase client import (assuming it's available)
import { supabase } from '@/integrations/supabase/client';

export async function getCustomRoomConfig(roomId: string): Promise<CustomRoomData | null> {
  const { data, error } = await supabase
    .from('custom_rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (error) {
    console.error("Error fetching custom room config:", error);
    return null;
  }
  
  // Check if the room is currently active
  const now = new Date();
  const startTime = new Date(data.start_time);
  const endTime = new Date(data.end_time);

  if (now < startTime || now > endTime) {
    console.warn(`Room ${roomId} is currently inactive.`);
    return null;
  }

  return data as CustomRoomData;
}

// Helper function to get all 40 panel keys in order
function getAllPanelKeys(): string[] {
    const allPanelKeys: string[] = [];
    const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall'];
    const INNER_WALL_NAMES = ['north-inner-wall', 'south-inner-wall', 'east-inner-wall', 'west-inner-wall'];
    const CENTER_WALL_NAMES = ['north-center-wall', 'south-center-wall', 'east-center-wall', 'west-center-wall'];

    // Outer walls (20 panels)
    for (let i = 0; i < 5; i++) {
        for (const wallNameBase of WALL_NAMES) {
            allPanelKeys.push(`${wallNameBase}-${i}`);
        }
    }
    // Inner walls (16 panels)
    for (let i = 0; i < 2; i++) {
        for (const wallNameBase of INNER_WALL_NAMES) {
            allPanelKeys.push(`${wallNameBase}-inner-${i}`);
            allPanelKeys.push(`${wallNameBase}-outer-${i}`);
        }
    }
    // Center walls (4 panels)
    for (const wallNameBase of CENTER_WALL_NAMES) {
        allPanelKeys.push(`${wallNameBase}-0`);
    }
    return allPanelKeys;
}


/**
 * Initializes the gallery configuration based on a room ID.
 * If roomId is 'default' or 1, 2, 3, it uses the predefined collections.
 * If roomId is a UUID, it fetches the custom room data.
 */
export async function initializeGalleryConfig(roomId: string = 'default') {
  // Reset configuration for the new room
  galleryConfig = {};
  Object.keys(panelSequentialIndexMap).forEach(key => delete panelSequentialIndexMap[key]);
  let sequentialIndexCounter = 0;

  let contractsToUse: string[] = [];
  let customRoomData: CustomRoomData | null = null;
  const allPanelKeys = getAllPanelKeys();
  const NUM_PANELS = allPanelKeys.length; // 40

  if (roomContracts[roomId]) {
    // Predefined room (default, 1, 2, 3)
    contractsToUse = roomContracts[roomId];
    
    // --- Step 1: Determine total tokens and generate token IDs for predefined rooms ---
    const uniqueContracts = Array.from(new Set(contractsToUse)).filter(addr => addr !== "");

    for (const address of uniqueContracts) {
      if (address === ETN_VIDEO_NFT_ADDRESS) {
          tokenMap[address] = [1];
          continue;
      }
      try {
        const totalSupply = await fetchTotalSupply(address);
        const total = Math.min(totalSupply ?? 100, 100); 
        tokenMap[address] = Array.from({ length: total }, (_, i) => i + 1);
      } catch (error) {
        console.error(`Failed to initialize collection at ${address}:`, error);
        tokenMap[address] = [1];
      }
    }
    
    // --- Step 2: Generate Panel Configurations for predefined rooms ---
    for (let i = 0; i < NUM_PANELS; i++) {
        const panelKey = allPanelKeys[i];
        const contractAddress = contractsToUse[i % contractsToUse.length]; // Cycle through contracts
        panelSequentialIndexMap[panelKey] = i;
        
        const tokens = tokenMap[contractAddress];
        const tokenIndex = tokens && tokens.length > 0 ? i % tokens.length : 0;
        const tokenId = tokens ? tokens[tokenIndex] : 1;

        galleryConfig[panelKey] = {
            name: CONTRACT_NAMES_MAP[contractAddress] || 'Unknown Collection',
            contractAddress: contractAddress,
            // For predefined rooms, we still use the full token list for cycling
            tokenIds: tokens || [tokenId], 
            currentIndex: tokenIndex,
        };
    }

  } else {
    // Attempt to fetch custom room by UUID
    customRoomData = await getCustomRoomConfig(roomId);
    
    if (customRoomData) {
      // --- Custom Room Logic: Use specific panels ---
      const customPanels = customRoomData.panels;
      const numCustomPanels = customPanels.length;
      
      // 1. Map custom panels to the first N available slots
      for (let i = 0; i < NUM_PANELS; i++) {
        const panelKey = allPanelKeys[i];
        panelSequentialIndexMap[panelKey] = i;
        
        if (i < numCustomPanels) {
            const panelSource = customPanels[i];
            const contractAddress = panelSource.contract;
            const tokenId = panelSource.tokenId;
            
            galleryConfig[panelKey] = {
                name: CONTRACT_NAMES_MAP[contractAddress] || 'Custom NFT',
                contractAddress: contractAddress,
                // For custom rooms, we only display the single configured token, so tokenIds array is just [tokenId]
                tokenIds: [tokenId], 
                currentIndex: 0,
            };
        } else {
            // Fill remaining slots with blank panels
            galleryConfig[panelKey] = {
                name: "Blank Panel",
                contractAddress: "",
                tokenIds: [],
                currentIndex: 0,
            };
        }
      }
      
    } else {
      // Fallback to default if custom room not found or inactive
      console.warn(`Custom room ${roomId} not found or inactive. Falling back to default gallery.`);
      return initializeGalleryConfig('default');
    }
  }

  console.log(`Gallery configuration for room '${roomId}' fully initialized.`);
  return customRoomData; // Return custom room data if available
}

export const GALLERY_PANEL_CONFIG = galleryConfig;

export const getCurrentNftSource = (wallName: keyof PanelConfig) => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || config.contractAddress === "") return null;
  
  // For custom rooms, tokenIds.length is 1, so currentIndex is always 0.
  // For predefined rooms, we use currentIndex to cycle through the collection.
  const tokenId = config.tokenIds[config.currentIndex];
  
  return {
    contractAddress: config.contractAddress,
    tokenId: tokenId,
  };
};

export const updatePanelIndex = (wallName: keyof PanelConfig, direction: 'next' | 'prev') => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || config.tokenIds.length <= 1 || config.contractAddress === "") return false;
  
  // Only allow cycling if there is more than one token (i.e., not a custom single-token panel)
  let newIndex = config.currentIndex;
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