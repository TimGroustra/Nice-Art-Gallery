import { supabase } from '@/integrations/supabase/client';
import { primeMetadataCache } from '@/utils/metadataCache';

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

const DEFAULT_WALL_COLOR = '#4A235A';
const DEFAULT_TEXT_COLOR = '#F4D03F';

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

// Initialize structure
for (let i = 0; i < NUM_SEGMENTS_TO_USE; i++) {
  for (let j = 0; j < WALL_NAMES.length; j++) {
    galleryConfig[`${WALL_NAMES[j]}-${i}-ground`] = createBlankPanel();
    galleryConfig[`${WALL_NAMES[j]}-${i}-first`] = createBlankPanel();
  }
}

const INNER_WALL_NAMES = ['north-inner-wall', 'south-inner-wall', 'east-inner-wall', 'west-inner-wall'];
for (let i = 0; i < 2; i++) {
  for (let j = 0; j < INNER_WALL_NAMES.length; j++) {
    galleryConfig[`${INNER_WALL_NAMES[j]}-inner-${i}`] = createBlankPanel();
    galleryConfig[`${INNER_WALL_NAMES[j]}-outer-${i}`] = createBlankPanel();
  }
}

for (let i = 0; i < 4; i++) {
  galleryConfig[`${['north', 'south', 'east', 'west'][i]}-center-wall-0`] = createBlankPanel();
}

/**
 * Initializes the gallery configuration by calling a single Edge Function 
 * that returns all configs, metadata, and supplies in one go.
 */
export async function initializeGalleryConfig() {
  try {
    const { data, error } = await supabase.functions.invoke('get-gallery-data');

    if (error) throw error;

    const { configs, metadata, supplies } = data as { 
      configs: any[], 
      metadata: any[], 
      supplies: Record<string, number> 
    };

    // 1. Prime the metadata cache so panels load instantly
    primeMetadataCache(metadata);

    // 2. Map configs to the gallery structure
    const dbConfigMap = new Map(configs.map(c => [c.panel_key, c]));

    for (const panelKey in galleryConfig) {
      const dbCfg = dbConfigMap.get(panelKey);

      if (dbCfg && dbCfg.contract_address) {
        const addr = dbCfg.contract_address.toLowerCase();
        const supply = supplies[dbCfg.contract_address] || 1;
        const defaultId = dbCfg.default_token_id || 1;
        
        // Build token list
        const tokens = dbCfg.show_collection 
          ? Array.from({ length: Math.min(supply, 100) }, (_, i) => i + 1)
          : [defaultId];

        const startIndex = Math.max(0, tokens.indexOf(defaultId));

        galleryConfig[panelKey] = {
          name: dbCfg.collection_name || 'Unnamed Collection',
          contractAddress: dbCfg.contract_address,
          tokenIds: tokens,
          currentIndex: startIndex,
          show_collection: !!dbCfg.show_collection,
          wall_color: dbCfg.wall_color || DEFAULT_WALL_COLOR,
          text_color: dbCfg.text_color || DEFAULT_TEXT_COLOR,
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

    console.log(`[Gallery Config] Initialized with ${metadata.length} cached metadata entries.`);
  } catch (e) {
    console.error("[Gallery Config] Failed to initialize via Edge Function:", e);
  }
}

export const GALLERY_PANEL_CONFIG = galleryConfig;

export const getCurrentNftSource = (wallName: keyof PanelConfig) => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || !config.contractAddress || config.tokenIds.length === 0) return null;
  return {
    contractAddress: config.contractAddress,
    tokenId: config.tokenIds[config.currentIndex],
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