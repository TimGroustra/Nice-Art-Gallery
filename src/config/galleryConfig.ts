import { fetchTotalSupply } from '@/utils/nftFetcher';
import { supabase } from '@/integrations/supabase/client';

export interface NftCollection {
  name: string;
  contractAddress: string;
  tokenIds: number[];
  currentIndex: number;
}

export interface PanelConfig {
  [wallName: string]: NftCollection;
}

// --- Default Static Configuration ---
const GRACES_ADDRESS = "0x1760321f42A9BE39b39c779D92373769d829ef48";
const ELECTROGEMS_ADDRESS = "0xcff0d88Ed5311bAB09178b6ec19A464100880984";
const ETN_VIDEO_NFT_ADDRESS = "0x7F41080A13f5154Bcf9f72991AFEEd645b13B75C";

const ALL_CONTRACT_ADDRESSES = [
  GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, 
  GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS,
  GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS,
  GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS, GRACES_ADDRESS,
  "0x9d4E0280B3732fCEAeEeCD870613aB30bCDA7A31", "0x56B33D971AfC1d2CEA35f20599E8EF5094Ffd399",
  "0x31cbb613D14cc85Cf3A8889007562E4B5cE9518b", "0x939548A645AD1C3164d82A168735DB1558c9EFDD",
  "0xAb7Ad6b7A272B52C752D5087fA0FE238cC9BFadF", "0xD3Ec30829eb7DB12E96488c70EF715d96B2CCE42",
  "0xD7195E3c956Be88bA28dc0cbf65829dD7db6EA8a", "0xE76b450eE07CE833E10f9227F1Fbbc96e5f9514d",
  "0xe86fb488532e86d99574B9fed9D42ff4AC0FDE23", "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4",
  "0x3446c31703CA826F368B981E50971A00eA4C23be", "0xe6db26D4F86108D2E9C21924dEf563fA393B8469",
  ETN_VIDEO_NFT_ADDRESS, "0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1",
  "0xc107C97710972e964d59000f610c07262638B508", "0xF91290684eb728f6715EFF0b50018105B6B31658",
  ELECTROGEMS_ADDRESS, ELECTROGEMS_ADDRESS, ELECTROGEMS_ADDRESS, ELECTROGEMS_ADDRESS,
];

const CONTRACT_NAMES_MAP: { [key: string]: string } = {
  "0x9d4E0280B3732fCEAeEeCD870613aB30bCDA7A31": "Planet ETN", "0x56B33D971AfC1d2CEA35f20599E8EF5094Ffd399": "MEGA OGs",
  "0x939548A645AD1C3164d82A168735DB1558c9EFDD": "Electroneum x Rarible", "0xAb7Ad6b7A272B52C752D5087fA0FE238cC9BFadF": "Baby Pandas",
  "0xD3Ec30829eb7DB12E96488c70EF715d96B2CCE42": "ETN Rock", "0xD7195E3c956Be88bA28dc0cbf65829dD7db6EA8a": "ElectroFox",
  "0xE76b450eE07CE833E10f9227F1Fbbc96e5f9514d": "HoneyBadgers", "0xe86fb488532e86d99574B9fed9D42ff4AC0FDE23": "Thirst & Thunder",
  "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4": "Verdant Kin", "0x3446c31703CA826F368B981E50971A00eA4C23be": "Limitless: Different Worlds",
  "0xe6db26D4F86108D2E9C21924dEf563fA393B8469": "Richard Ells on a Skateboard", [ETN_VIDEO_NFT_ADDRESS]: "Pope's Legendary Coffee",
  "0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1": "Club Watches", "0xc107C97710972e964d59000f610c07262638B508": "Non-Fungible Comrades",
  "0xcff0d88Ed5311bAB09178b6ec19A464100880984": "ElectroGems", "0x31cbb613D14cc85Cf3A8889007562E4B5cE9518b": "Electric Legends",
  "0xF91290684eb728f6715EFF0b50018105B6B31658": "Electric Eels", "0x1760321f42A9BE39b39c779D92373769d829ef48": "The Three Graces of the Sea",
};

let galleryConfig: PanelConfig = {};
const tokenMap: { [contractAddress: string]: number[] } = {};
const panelSequentialIndexMap: { [wallName: string]: number } = {};

const generateDefaultConfig = () => {
    let config: PanelConfig = {};
    let sequentialIndexCounter = 0;
    const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall'];
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < WALL_NAMES.length; j++) {
            const panelKey = `${WALL_NAMES[j]}-${i}`;
            const k = sequentialIndexCounter++;
            const contractAddress = ALL_CONTRACT_ADDRESSES[k];
            panelSequentialIndexMap[panelKey] = k;
            config[panelKey] = { name: CONTRACT_NAMES_MAP[contractAddress] || 'Unknown', contractAddress, tokenIds: [1], currentIndex: 0 };
        }
    }
    const INNER_WALL_NAMES = ['north-inner-wall', 'south-inner-wall', 'east-inner-wall', 'west-inner-wall'];
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < INNER_WALL_NAMES.length; j++) {
            ['inner', 'outer'].forEach(type => {
                const panelKey = `${INNER_WALL_NAMES[j]}-${type}-${i}`;
                const k = sequentialIndexCounter++;
                const contractAddress = ALL_CONTRACT_ADDRESSES[k];
                panelSequentialIndexMap[panelKey] = k;
                config[panelKey] = { name: CONTRACT_NAMES_MAP[contractAddress] || 'Unknown', contractAddress, tokenIds: [1], currentIndex: 0 };
            });
        }
    }
    const CENTER_WALL_NAMES = ['north-center-wall', 'south-center-wall', 'east-center-wall', 'west-center-wall'];
    for (let i = 0; i < CENTER_WALL_NAMES.length; i++) {
        const panelKey = `${CENTER_WALL_NAMES[i]}-0`;
        const k = sequentialIndexCounter++;
        const contractAddress = ALL_CONTRACT_ADDRESSES[k];
        panelSequentialIndexMap[panelKey] = k;
        config[panelKey] = { name: CONTRACT_NAMES_MAP[contractAddress] || 'Unknown', contractAddress, tokenIds: [1], currentIndex: 0 };
    }
    return config;
};

export async function initializeGalleryConfig() {
  galleryConfig = generateDefaultConfig();

  // Fetch active panel locks from Supabase
  const { data: locks, error } = await supabase
    .from('panel_locks')
    .select('*')
    .gt('locked_until', new Date().toISOString());

  if (error) {
    console.error("Error fetching panel locks:", error);
  } else if (locks) {
    // Override default config with locked panels
    for (const lock of locks) {
      if (galleryConfig[lock.panel_id]) {
        galleryConfig[lock.panel_id] = {
          name: `Locked by User`, // Name will be fetched with metadata
          contractAddress: lock.contract_address,
          tokenIds: [parseInt(lock.token_id, 10)], // Only one token ID
          currentIndex: 0,
        };
      }
    }
  }

  const uniqueContracts = Array.from(new Set(Object.values(galleryConfig).map(c => c.contractAddress))).filter(addr => addr !== "");
  for (const address of uniqueContracts) {
    if (address === ETN_VIDEO_NFT_ADDRESS) {
        tokenMap[address] = [1];
        continue;
    }
    try {
      const totalSupply = await fetchTotalSupply(address);
      const total = totalSupply ?? 100;
      tokenMap[address] = Array.from({ length: total }, (_, i) => i + 1);
    } catch (error) {
      console.error(`Failed to initialize collection at ${address}:`, error);
      tokenMap[address] = [1];
    }
  }

  for (const wallName in galleryConfig) {
    const config = galleryConfig[wallName];
    if (config.contractAddress === "") {
        config.name = "Blank Panel";
        config.tokenIds = [];
        continue;
    }
    const tokens = tokenMap[config.contractAddress];
    if (tokens && tokens.length > 0 && config.tokenIds.length > 1) { // Only override if it's not a locked panel
      config.tokenIds = tokens;
      const k = panelSequentialIndexMap[wallName];
      config.currentIndex = k % tokens.length;
    }
  }
}

export const GALLERY_PANEL_CONFIG = galleryConfig;

export const getCurrentNftSource = (wallName: keyof PanelConfig) => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || config.contractAddress === "") return null;
  const tokenId = config.tokenIds[config.currentIndex];
  return { contractAddress: config.contractAddress, tokenId };
};

export const updatePanelIndex = (wallName: keyof PanelConfig, direction: 'next' | 'prev') => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || config.tokenIds.length <= 1) return false; // Do not cycle if locked or single token
  let newIndex = config.currentIndex;
  if (direction === 'next') newIndex = (newIndex + 1) % config.tokenIds.length;
  else newIndex = (newIndex - 1 + config.tokenIds.length) % config.tokenIds.length;
  if (newIndex !== config.currentIndex) {
    config.currentIndex = newIndex;
    return true;
  }
  return false;
};