import { fetchTotalSupply } from '@/utils/nftFetcher';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { supabase } from '@/integrations/supabase/client';

export interface NftCollection {
  name: string;
  contractAddress: string;
  tokenIds: number[];
  currentIndex: number;
  show_collection: boolean;
}

export interface PanelConfig {
  [wallName: string]: NftCollection;
}

const ETN_VIDEO_NFT_ADDRESS = "0x7F41080A13f5154Bcf9f72991AFEEd645b13B75C";

// This part creates the structure of the gallery with all panel keys.
// We'll initialize them as blank, and they will be populated from the database.
const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall'];
const NUM_SEGMENTS_TO_USE = 5;

let galleryConfig: PanelConfig = {};

const createBlankPanel = (): NftCollection => ({
  name: 'Loading...',
  contractAddress: '',
  tokenIds: [],
  currentIndex: 0,
  show_collection: true,
});

// Generate 20 panel configurations for the outer 50x50 walls
for (let i = 0; i < NUM_SEGMENTS_TO_USE; i++) {
  for (let j = 0; j < WALL_NAMES.length; j++) {
    const wallNameBase = WALL_NAMES[j];
    const panelKey = `${wallNameBase}-${i}`;
    galleryConfig[panelKey] = createBlankPanel();
  }
}

// Generate 16 panel configurations for inner 30x30 walls
const INNER_WALL_NAMES = ['north-inner-wall', 'south-inner-wall', 'east-inner-wall', 'west-inner-wall'];
const NUM_INNER_SEGMENTS_TO_USE = 2;

for (let i = 0; i < NUM_INNER_SEGMENTS_TO_USE; i++) {
  for (let j = 0; j < INNER_WALL_NAMES.length; j++) {
    const wallNameBase = INNER_WALL_NAMES[j];
    const panelKeyInner = `${wallNameBase}-inner-${i}`;
    const panelKeyOuter = `${wallNameBase}-outer-${i}`;
    galleryConfig[panelKeyInner] = createBlankPanel();
    galleryConfig[panelKeyOuter] = createBlankPanel();
  }
}

// Generate 4 panel configurations for the central 10x10 walls
const CENTER_WALL_NAMES = ['north-center-wall', 'south-center-wall', 'east-center-wall', 'west-center-wall'];
for (let i = 0; i < CENTER_WALL_NAMES.length; i++) {
  const wallNameBase = CENTER_WALL_NAMES[i];
  const panelKey = `${wallNameBase}-0`;
  galleryConfig[panelKey] = createBlankPanel();
}

// Function to initialize the gallery configuration from Supabase
export async function initializeGalleryConfig() {
  const { data: dbConfigs, error } = await supabase.from('gallery_config').select('*');

  if (error) {
    console.error("Failed to fetch gallery config from Supabase:", error);
    for (const wallName in galleryConfig) {
      galleryConfig[wallName] = { name: 'Error Loading', contractAddress: '', tokenIds: [], currentIndex: 0, show_collection: true };
    }
    return;
  }

  const dbConfigMap = new Map<string, any>();
  dbConfigs.forEach(item => dbConfigMap.set(item.panel_key, item));

  const uniqueContracts = Array.from(
    new Set(
      dbConfigs
        .map(c => c.contract_address)
        .filter((addr): addr is string => !!addr && addr.trim() !== '')
    )
  );

  const tokenMap: { [contractAddress: string]: number[] } = {};
  const collectionNameMap: { [contractAddress: string]: string } = {};

  for (const address of uniqueContracts) {
    // Fetch collection name from token 1 metadata
    try {
      const metadata = await getCachedNftMetadata(address, 1);
      let collectionName = metadata?.title || 'Unnamed Collection';
      // Strip token-specific parts like " #123" or "Fragment 1" from the end of the title
      if (collectionName) {
        collectionName = collectionName.replace(/\s+(#|fragment|token)?\s*\d+$/i, '').trim();
      }
      collectionNameMap[address] = collectionName;
    } catch (e) {
      console.error(`Failed to get collection name for ${address}`, e);
      collectionNameMap[address] = 'Unnamed Collection';
    }

    // Fetch total supply
    if (address === ETN_VIDEO_NFT_ADDRESS) {
      tokenMap[address] = [1];
      continue;
    }
    try {
      const totalSupply = await fetchTotalSupply(address);
      const total = totalSupply ?? 100;
      tokenMap[address] = Array.from({ length: total }, (_, i) => i + 1);
    } catch (e) {
      console.error(`Failed to get total supply for ${address}`, e);
      tokenMap[address] = [1];
    }
  }

  for (const panelKey in galleryConfig) {
    const configFromDb = dbConfigMap.get(panelKey);

    if (configFromDb && configFromDb.contract_address) {
      const contractAddress = configFromDb.contract_address;
      const defaultTokenId = configFromDb.default_token_id || 1;
      const showCollection = configFromDb.show_collection ?? true;

      let tokens: number[];
      if (showCollection) {
        tokens = tokenMap[contractAddress] || [defaultTokenId];
      } else {
        tokens = [defaultTokenId];
      }
      
      const startIndex = Math.max(0, tokens.indexOf(defaultTokenId));

      galleryConfig[panelKey] = {
        name: collectionNameMap[contractAddress] || 'Unnamed Collection',
        contractAddress: contractAddress,
        tokenIds: tokens,
        currentIndex: startIndex,
        show_collection: showCollection,
      };
    } else {
      galleryConfig[panelKey] = {
        name: 'Blank Panel',
        contractAddress: '',
        tokenIds: [],
        currentIndex: 0,
        show_collection: true,
      };
    }
  }
  console.log(`Gallery configuration fully initialized from Supabase.`);
}

export const GALLERY_PANEL_CONFIG = galleryConfig;

export const getCurrentNftSource = (wallName: keyof PanelConfig) => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || !config.contractAddress) return null;
  const tokenId = config.tokenIds[config.currentIndex];
  return {
    contractAddress: config.contractAddress,
    tokenId: tokenId,
  };
};

export const updatePanelIndex = (wallName: keyof PanelConfig, direction: 'next' | 'prev') => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || config.tokenIds.length === 0) return false;

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