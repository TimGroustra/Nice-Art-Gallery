import { fetchTotalSupply } from '@/utils/nftFetcher';
import { supabase } from '@/integrations/supabase/client';
import { GalleryLayout, Wall } from '@/scene/unrealUnityLayout'; // Import Wall type

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

// --- Dynamic Panel Key Extraction ---
const ALL_PANEL_KEYS = GalleryLayout.walls
    .filter((wall: Wall) => wall.hasPanel)
    .map((wall: Wall) => wall.key);

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

// Initialize galleryConfig with all dynamic keys
ALL_PANEL_KEYS.forEach(panelKey => {
    galleryConfig[panelKey] = createBlankPanel();
});

// Function to initialize the gallery configuration from Supabase
export async function initializeGalleryConfig() {
  const { data: dbConfigs, error } = await supabase.from('gallery_config').select('*');

  if (error) {
    console.error("Failed to fetch gallery config from Supabase:", error);
    // If error, ensure all panels are initialized with error state
    for (const wallName of ALL_PANEL_KEYS) {
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
    try {
      const totalSupply = await fetchTotalSupply(address);
      const total = totalSupply ?? 100;
      tokenMap[address] = Array.from({ length: total }, (_, i) => i + 1);
    } catch (e) {
      console.error(`Failed to get total supply for ${address}`, e);
      tokenMap[address] = [1];
    }
  }

  for (const panelKey of ALL_PANEL_KEYS) {
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
        name: configFromDb.collection_name || 'Unnamed Collection',
        contractAddress: contractAddress,
        tokenIds: tokens,
        currentIndex: startIndex,
        show_collection: showCollection,
        // Apply defaults if DB values are null
        wall_color: configFromDb.wall_color || DEFAULT_WALL_COLOR,
        text_color: configFromDb.text_color || DEFAULT_TEXT_COLOR,
      };
    } else {
      galleryConfig[panelKey] = createBlankPanel();
    }
  }
  console.log(`Gallery configuration fully initialized from Supabase. Total panels: ${ALL_PANEL_KEYS.length}`);
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