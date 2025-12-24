import { fetchTotalSupply } from '@/utils/nftFetcher';
import { supabase } from '@/integrations/supabase/client';

export interface NftCollection {
  name: string;
  contractAddress: string;
  tokenIds: number[];
  currentIndex: number;
  show_collection: boolean;
  wall_color: string | null;
  text_color: string | null;
}

export interface PanelConfig {
  [wallName: string]: NftCollection;
}

const ETN_VIDEO_NFT_ADDRESS = "0x7F41080A13f5154Bcf9f72991AFEEd645b13B75C";

// Default colors for the new theme (Deep Purple and Bright Yellow)
const DEFAULT_WALL_COLOR = '#4A235A'; 
const DEFAULT_TEXT_COLOR = '#F4D03F'; 

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
  wall_color: DEFAULT_WALL_COLOR,
  text_color: DEFAULT_TEXT_COLOR,
});

// Generate 40 panel configurations for the outer 50x50 walls (Ground and First Floor)
for (let i = 0; i < NUM_SEGMENTS_TO_USE; i++) {
  for (let j = 0; j < WALL_NAMES.length; j++) {
    const wallNameBase = WALL_NAMES[j];
    
    // Ground floor panel key
    const panelKeyGround = `${wallNameBase}-${i}-ground`;
    galleryConfig[panelKeyGround] = createBlankPanel();
    
    // First floor panel key
    const panelKeyFirst = `${wallNameBase}-${i}-first`;
    galleryConfig[panelKeyFirst] = createBlankPanel();
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
      galleryConfig[wallName] = { 
        name: 'Error Loading', 
        contractAddress: '', 
        tokenIds: [], 
        currentIndex: 0, 
        show_collection: true, 
        wall_color: DEFAULT_WALL_COLOR, 
        text_color: DEFAULT_TEXT_COLOR 
      };
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
  for (const address of uniqueContracts) {
    if (address === ETN_VIDEO_NFT_ADDRESS) {
      tokenMap[address] = [1];
      continue;
    }
    
    // Use a much safer default if fetching total supply fails (e.g., 1 to 5)
    const SAFE_DEFAULT_SUPPLY = 5;
    let total = SAFE_DEFAULT_SUPPLY;
    
    try {
      const totalSupply = await fetchTotalSupply(address);
      total = totalSupply ?? SAFE_DEFAULT_SUPPLY;
    } catch (e) {
      console.warn(`Failed to get total supply for ${address}. Defaulting to ${SAFE_DEFAULT_SUPPLY} tokens.`, e);
    }
    
    // Ensure total is at least 1
    total = Math.max(1, total);
    
    // Generate token IDs from 1 up to the determined total
    tokenMap[address] = Array.from({ length: total }, (_, i) => i + 1);
  }

  for (const panelKey in galleryConfig) {
    const configFromDb = dbConfigMap.get(panelKey);

    if (configFromDb && configFromDb.contract_address) {
      const contractAddress = configFromDb.contract_address;
      const defaultTokenId = configFromDb.default_token_id || 1;
      const showCollection = configFromDb.show_collection ?? true;

      let tokens: number[];
      
      // Determine the list of tokens to display
      if (showCollection) {
        // Use the full list of tokens we determined earlier
        tokens = tokenMap[contractAddress] || [defaultTokenId];
      } else {
        // Only show the default token ID
        tokens = [defaultTokenId];
      }
      
      // Filter out any tokens that are outside the determined total supply range
      const validTokens = tokens.filter(tokenId => {
          const maxToken = tokenMap[contractAddress] ? Math.max(...tokenMap[contractAddress]) : defaultTokenId;
          return tokenId >= 1 && tokenId <= maxToken;
      });
      
      // Ensure the default token is included if it's valid
      if (validTokens.length === 0 && defaultTokenId >= 1 && defaultTokenId <= (tokenMap[contractAddress] ? Math.max(...tokenMap[contractAddress]) : defaultTokenId)) {
          validTokens.push(defaultTokenId);
      }
      
      const tokensToUse = validTokens.length > 0 ? validTokens : [defaultTokenId];

      const startIndex = Math.max(0, tokensToUse.indexOf(defaultTokenId));

      galleryConfig[panelKey] = {
        name: configFromDb.collection_name || 'Unnamed Collection',
        contractAddress: contractAddress,
        tokenIds: tokensToUse,
        currentIndex: startIndex,
        show_collection: showCollection,
        // Apply defaults if DB values are null
        wall_color: configFromDb.wall_color || DEFAULT_WALL_COLOR,
        text_color: configFromDb.text_color || DEFAULT_TEXT_COLOR,
      };
    } else {
      galleryConfig[panelKey] = {
        name: 'Blank Panel',
        contractAddress: '',
        tokenIds: [],
        currentIndex: 0,
        show_collection: true,
        wall_color: DEFAULT_WALL_COLOR,
        text_color: DEFAULT_TEXT_COLOR,
      };
    }
  }
  console.log(`Gallery configuration fully initialized from Supabase.`);
}

export const GALLERY_PANEL_CONFIG = galleryConfig;

export const getCurrentNftSource = (wallName: keyof PanelConfig) => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || !config.contractAddress || config.tokenIds.length === 0) return null;
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