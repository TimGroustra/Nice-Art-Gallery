import { fetchTotalSupply } from '@/utils/nftFetcher';
import { supabase } from '@/integrations/supabase/client';

export interface NftCollection {
  name: string;
  contractAddress: string;
  tokenIds: number[]; // Array of token IDs available in this collection
  currentIndex: number; // Index of the currently displayed token in the tokenIds array
  isLocked?: boolean;
  lockedByAddress?: string;
}

export interface PanelConfig {
  [wallName: string]: NftCollection; // Key is the wall identifier (e.g., 'north-wall-0')
}

const GRACES_ADDRESS = "0x1760321f42A9BE39b39c779D92373769d829ef48";
const ELECTROGEMS_ADDRESS = "0xcff0d88Ed5311bAB09178b6ec19A464100880984";
const ETN_VIDEO_NFT_ADDRESS = "0x7F41080A13f5154Bcf9f72991AFEEd645b13B75C"; // Updated ERC-1155 Video NFT address

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
  [ETN_VIDEO_NFT_ADDRESS]: "Pope's Legendary Coffee", // Updated entry
  "0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1": "Club Watches",
  "0xc107C97710972e964d59000f610c07262638B508": "Non-Fungible Comrades",
  "0xcff0d88Ed5311bAB09178b6ec19A464100880984": "ElectroGems",
  // Index 16 is blank
  "0x31cbb613D14cc85Cf3A8889007562E4B5cE9518b": "Electric Legends",
  "0xF91290684eb728f6715EFF0b50018105B6B31658": "Electric Eels",
  "0x1760321f42A9BE39b39c779D92373769d829ef48": "The Three Graces of the Sea",
};

const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall'];
const NUM_SEGMENTS_TO_USE = 5; 

let galleryConfig: PanelConfig = {};
const tokenMap: { [contractAddress: string]: number[] } = {};
const panelSequentialIndexMap: { [wallName: string]: number } = {};

const generateInitialConfig = () => {
  galleryConfig = {};
  let sequentialIndexCounter = 0;

  for (let i = 0; i < NUM_SEGMENTS_TO_USE; i++) {
      for (let j = 0; j < WALL_NAMES.length; j++) {
          const wallNameBase = WALL_NAMES[j];
          const panelKey = `${wallNameBase}-${i}`;
          const k = sequentialIndexCounter++;
          const contractAddress = ALL_CONTRACT_ADDRESSES[k];
          panelSequentialIndexMap[panelKey] = k;
          galleryConfig[panelKey] = {
              name: CONTRACT_NAMES_MAP[contractAddress] || 'Unknown Collection',
              contractAddress: contractAddress,
              tokenIds: [1],
              currentIndex: 0,
          };
      }
  }

  const INNER_WALL_NAMES = ['north-inner-wall', 'south-inner-wall', 'east-inner-wall', 'west-inner-wall'];
  const NUM_INNER_SEGMENTS_TO_USE = 2;
  for (let i = 0; i < NUM_INNER_SEGMENTS_TO_USE; i++) {
      for (let j = 0; j < INNER_WALL_NAMES.length; j++) {
          const wallNameBase = INNER_WALL_NAMES[j];
          const panelKeyInner = `${wallNameBase}-inner-${i}`;
          const panelKeyOuter = `${wallNameBase}-outer-${i}`;
          const kInner = sequentialIndexCounter++;
          const kOuter = sequentialIndexCounter++;
          const contractAddressInner = ALL_CONTRACT_ADDRESSES[kInner];
          const contractAddressOuter = ALL_CONTRACT_ADDRESSES[kOuter];
          panelSequentialIndexMap[panelKeyInner] = kInner;
          panelSequentialIndexMap[panelKeyOuter] = kOuter;
          galleryConfig[panelKeyInner] = { name: CONTRACT_NAMES_MAP[contractAddressInner] || 'Unknown Collection', contractAddress: contractAddressInner, tokenIds: [1], currentIndex: 0 };
          galleryConfig[panelKeyOuter] = { name: CONTRACT_NAMES_MAP[contractAddressOuter] || 'Unknown Collection', contractAddress: contractAddressOuter, tokenIds: [1], currentIndex: 0 };
      }
  }

  const CENTER_WALL_NAMES = ['north-center-wall', 'south-center-wall', 'east-center-wall', 'west-center-wall'];
  for (let i = 0; i < CENTER_WALL_NAMES.length; i++) {
      const wallNameBase = CENTER_WALL_NAMES[i];
      const panelKey = `${wallNameBase}-0`;
      const k = sequentialIndexCounter++;
      const contractAddress = ALL_CONTRACT_ADDRESSES[k];
      panelSequentialIndexMap[panelKey] = k;
      galleryConfig[panelKey] = { name: CONTRACT_NAMES_MAP[contractAddress] || 'Unknown Collection', contractAddress: contractAddress, tokenIds: [1], currentIndex: 0 };
  }
}

export async function initializeGalleryConfig() {
  generateInitialConfig();

  const { data: locks, error } = await supabase.from('panel_locks').select('*');
  const lockMap = new Map();
  if (error) {
    console.error("Error fetching panel locks:", error);
  } else {
    const now = new Date();
    locks
      .filter(lock => new Date(lock.locked_until) > now)
      .forEach(lock => lockMap.set(lock.panel_id, lock));
  }

  for (const wallName in galleryConfig) {
    const config = galleryConfig[wallName];
    const lock = lockMap.get(wallName);
    if (lock) {
      config.name = `Locked by ${lock.locked_by_address.slice(0, 6)}...`;
      config.contractAddress = lock.contract_address;
      config.tokenIds = [parseInt(lock.token_id, 10)];
      config.currentIndex = 0;
      config.isLocked = true;
      config.lockedByAddress = lock.locked_by_address;
    }
  }

  const uniqueContractsToFetch = Array.from(
    new Set(
      Object.values(galleryConfig)
        .filter(c => !c.isLocked && c.contractAddress !== "")
        .map(c => c.contractAddress)
    )
  );

  for (const address of uniqueContractsToFetch) {
    if (tokenMap[address]) continue;
    if (address === ETN_VIDEO_NFT_ADDRESS) {
        tokenMap[address] = [1];
        continue;
    }
    try {
      const totalSupply = await fetchTotalSupply(address);
      const total = totalSupply ?? 100;
      tokenMap[address] = Array.from({ length: total }, (_, i) => i + 1);
    } catch (e) {
      console.error(`Failed to initialize collection at ${address}:`, e);
      tokenMap[address] = [1];
    }
  }

  for (const wallName in galleryConfig) {
    const config = galleryConfig[wallName];
    if (config.isLocked) continue;

    if (config.contractAddress === "") {
        config.name = "Blank Panel";
        config.tokenIds = [];
        config.currentIndex = 0;
        continue;
    }
    
    const tokens = tokenMap[config.contractAddress];
    if (tokens && tokens.length > 0) {
      config.tokenIds = tokens;
      const k = panelSequentialIndexMap[wallName];
      config.currentIndex = k % tokens.length;
    }
  }
  console.log(`Gallery configuration fully initialized.`);
}

export const GALLERY_PANEL_CONFIG = galleryConfig;

export const getCurrentNftSource = (wallName: keyof PanelConfig) => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || config.contractAddress === "") return null;
  const tokenId = config.tokenIds[config.currentIndex];
  return {
    contractAddress: config.contractAddress,
    tokenId: tokenId,
  };
};

export const updatePanelIndex = (wallName: keyof PanelConfig, direction: 'next' | 'prev') => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || config.isLocked || config.tokenIds.length <= 1 || config.contractAddress === "") return false;

  let newIndex = config.currentIndex;
  if (direction === 'next') {
    newIndex = (newIndex + 1) % config.tokenIds.length;
  } else {
    newIndex = (newIndex - 1 + config.tokenIds.length) % config.tokenIds.length;
  }

  if (newIndex !== config.currentIndex) {
    config.currentIndex = newIndex;
    return true;
  }
  return false;
};