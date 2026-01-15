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

export interface FurnitureItem {
  id: string;
  model_url: string;
  position_x: number;
  position_y: number;
  position_z: number;
  rotation_y: number;
  target_width: number;
  floor_level: 'ground' | 'first';
}

export interface PanelConfig {
  [wallName: string]: NftCollection;
}

const ETN_VIDEO_NFT_ADDRESS = "0x7F41080A13f5154Bcf9f72991AFEEd645b13B75C";
const DEFAULT_WALL_COLOR = '#4A235A';
const DEFAULT_TEXT_COLOR = '#F4D03F';

const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall'];
const NUM_SEGMENTS_TO_USE = 5;

let galleryConfig: PanelConfig = {};
let furnitureConfig: FurnitureItem[] = [];

const createBlankPanel = (): NftCollection => ({
  name: 'Loading...',
  contractAddress: '',
  tokenIds: [],
  currentIndex: 0,
  show_collection: true,
  wall_color: DEFAULT_WALL_COLOR,
  text_color: DEFAULT_TEXT_COLOR,
});

for (let i = 0; i < NUM_SEGMENTS_TO_USE; i++) {
  for (let j = 0; j < WALL_NAMES.length; j++) {
    const wallNameBase = WALL_NAMES[j];
    galleryConfig[`${wallNameBase}-${i}-ground`] = createBlankPanel();
    galleryConfig[`${wallNameBase}-${i}-first`] = createBlankPanel();
  }
}

const INNER_WALL_NAMES = ['north-inner-wall', 'south-inner-wall', 'east-inner-wall', 'west-inner-wall'];
const NUM_INNER_SEGMENTS_TO_USE = 2;

for (let i = 0; i < NUM_INNER_SEGMENTS_TO_USE; i++) {
  for (let j = 0; j < INNER_WALL_NAMES.length; j++) {
    const wallNameBase = INNER_WALL_NAMES[j];
    galleryConfig[`${wallNameBase}-inner-${i}`] = createBlankPanel();
    galleryConfig[`${wallNameBase}-outer-${i}`] = createBlankPanel();
  }
}

const CENTER_WALL_NAMES = ['north-center-wall', 'south-center-wall', 'east-center-wall', 'west-center-wall'];
for (let i = 0; i < CENTER_WALL_NAMES.length; i++) {
  galleryConfig[`${CENTER_WALL_NAMES[i]}-0`] = createBlankPanel();
}

export async function initializeGalleryConfig() {
  const [panelRes, furnitureRes] = await Promise.all([
    supabase.from('gallery_config').select('*'),
    supabase.from('gallery_furniture').select('*')
  ]);

  if (panelRes.error) {
    console.error("Failed to fetch gallery config:", panelRes.error);
  } else {
    const dbConfigs = panelRes.data;
    const dbConfigMap = new Map<string, any>();
    dbConfigs.forEach(item => dbConfigMap.set(item.panel_key, item));

    const uniqueContracts = Array.from(new Set(dbConfigs.map(c => c.contract_address).filter((addr): addr is string => !!addr && addr.trim() !== '')));
    const tokenMap: { [contractAddress: string]: number[] } = {};

    for (const address of uniqueContracts) {
      if (address === ETN_VIDEO_NFT_ADDRESS) {
        tokenMap[address] = [1];
        continue;
      }
      try {
        const total = await fetchTotalSupply(address) || 5;
        tokenMap[address] = Array.from({ length: Math.max(1, total) }, (_, i) => i + 1);
      } catch {
        tokenMap[address] = [1, 2, 3, 4, 5];
      }
    }

    for (const panelKey in galleryConfig) {
      const configFromDb = dbConfigMap.get(panelKey);
      if (configFromDb?.contract_address) {
        const tokens = configFromDb.show_collection ? (tokenMap[configFromDb.contract_address] || [configFromDb.default_token_id || 1]) : [configFromDb.default_token_id || 1];
        const startIndex = Math.max(0, tokens.indexOf(configFromDb.default_token_id || 1));
        galleryConfig[panelKey] = {
          name: configFromDb.collection_name || 'Unnamed Collection',
          contractAddress: configFromDb.contract_address,
          tokenIds: tokens,
          currentIndex: startIndex,
          show_collection: configFromDb.show_collection ?? true,
          wall_color: configFromDb.wall_color || DEFAULT_WALL_COLOR,
          text_color: configFromDb.text_color || DEFAULT_TEXT_COLOR,
        };
      }
    }
  }

  if (furnitureRes.error) {
    console.error("Failed to fetch furniture:", furnitureRes.error);
  } else {
    furnitureConfig = furnitureRes.data as FurnitureItem[];
  }
}

export const GALLERY_PANEL_CONFIG = galleryConfig;
export const GALLERY_FURNITURE_CONFIG = () => furnitureConfig;

export const getCurrentNftSource = (wallName: keyof PanelConfig) => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || !config.contractAddress || config.tokenIds.length === 0) return null;
  return { contractAddress: config.contractAddress, tokenId: config.tokenIds[config.currentIndex] };
};

export const updatePanelIndex = (wallName: keyof PanelConfig, direction: 'next' | 'prev') => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || config.tokenIds.length === 0) return false;
  let newIndex = config.currentIndex;
  if (direction === 'next') newIndex = (newIndex + 1) % config.tokenIds.length;
  else newIndex = (newIndex - 1 + config.tokenIds.length) % config.tokenIds.length;
  if (newIndex !== config.currentIndex) {
    config.currentIndex = newIndex;
    return true;
  }
  return false;
};