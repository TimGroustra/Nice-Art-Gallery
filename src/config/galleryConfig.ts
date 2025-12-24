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

// Safety limit: never request more than this many token IDs per contract.
// This prevents fetching IDs that don’t exist and reduces RPC load.
const MAX_TOKENS_PER_COLLECTION = 10; // Adjust as needed

// This part creates the structure of the gallery with all panel keys.
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

// Generate configurations for outer walls (ground & first floor)
for (let i = 0; i < NUM_SEGMENTS_TO_USE; i++) {
  for (let j = 0; j < WALL_NAMES.length; j++) {
    const wallNameBase = WALL_NAMES[j];

    const panelKeyGround = `${wallNameBase}-${i}-ground`;
    galleryConfig[panelKeyGround] = createBlankPanel();

    const panelKeyFirst = `${wallNameBase}-${i}-first`;
    galleryConfig[panelKeyFirst] = createBlankPanel();
  }
}

// Generate configurations for inner cross walls
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

// Central 10x10 walls (optional – kept for completeness)
const CENTER_WALL_NAMES = ['north-center-wall', 'south-center-wall', 'east-center-wall', 'west-center-wall'];
for (let i = 0; i < CENTER_WALL_NAMES.length; i++) {
  const wallNameBase = CENTER_WALL_NAMES[i];
  const panelKey = `${wallNameBase}-0`;
  galleryConfig[panelKey] = createBlankPanel();
}

// -----------------------------------------------------------------------------
// Initialization – fetch config from Supabase, then calculate safe token lists.
// -----------------------------------------------------------------------------
export async function initializeGalleryConfig() {
  const { data: dbConfigs, error } = await supabase.from('gallery_config').select('*');

  if (error) {
    console.error("Failed to fetch gallery config from Supabase:", error);
    // Populate everything with a simple error placeholder.
    for (const wallName in galleryConfig) {
      galleryConfig[wallName] = {
        name: 'Error Loading',
        contractAddress: '',
        tokenIds: [],
        currentIndex: 0,
        show_collection: true,
        wall_color: DEFAULT_WALL_COLOR,
        text_color: DEFAULT_TEXT_COLOR,
      };
    }
    return;
  }

  // Map DB rows by panel_key for quick lookup.
  const dbConfigMap = new Map<string, any>();
  dbConfigs.forEach(item => dbConfigMap.set(item.panel_key, item));

  // Determine the unique contracts we need to query.
  const uniqueContracts = Array.from(
    new Set(
      dbConfigs
        .map(c => c.contract_address)
        .filter((addr): addr is string => !!addr && addr.trim() !== '')
    )
  );

  // Build a token map (contract -> array of token IDs) using safe limits.
  const tokenMap: { [contractAddress: string]: number[] } = {};
  for (const address of uniqueContracts) {
    if (address === ETN_VIDEO_NFT_ADDRESS) {
      tokenMap[address] = [1];
      continue;
    }

    // Try to get totalSupply; fall back to a safe default.
    const SAFE_DEFAULT_SUPPLY = 5;
    let total = SAFE_DEFAULT_SUPPLY;

    try {
      const totalSupply = await fetchTotalSupply(address);
      if (totalSupply && totalSupply > 0) {
        total = Math.max(1, totalSupply);
      }
    } catch (e) {
      console.warn(`Failed to get total supply for ${address}. Using safe default (${SAFE_DEFAULT_SUPPLY}).`, e);
    }

    // Cap the total to our safety ceiling.
    const cappedTotal = Math.min(total, MAX_TOKENS_PER_COLLECTION);

    // Generate token IDs 1..cappedTotal.
    tokenMap[address] = Array.from({ length: cappedTotal }, (_, i) => i + 1);
  }

  // Fill in the galleryConfig with data from Supabase.
  for (const panelKey in galleryConfig) {
    const configFromDb = dbConfigMap.get(panelKey);

    if (configFromDb && configFromDb.contract_address) {
      const contractAddress = configFromDb.contract_address;
      const defaultTokenId = configFromDb.default_token_id || 1;
      const showCollection = configFromDb.show_collection ?? true;

      // Determine the token IDs to expose.
      let tokens: number[];
      if (showCollection) {
        // Use the safe, capped list for the contract.
        tokens = tokenMap[contractAddress] || [defaultTokenId];
      } else {
        // Only the default token (still validated against the capped list).
        const available = tokenMap[contractAddress] || [];
        tokens = available.includes(defaultTokenId) ? [defaultTokenId] : (available.length ? [available[0]] : [defaultTokenId]);
      }

      // Ensure we have at least one token.
      if (tokens.length === 0) tokens = [defaultTokenId];

      // Start at the index of the default token if it exists in the list.
      const startIndex = tokens.indexOf(defaultTokenId);
      const safeStartIndex = startIndex >= 0 ? startIndex : 0;

      galleryConfig[panelKey] = {
        name: configFromDb.collection_name || 'Unnamed Collection',
        contractAddress,
        tokenIds: tokens,
        currentIndex: safeStartIndex,
        show_collection: showCollection,
        wall_color: configFromDb.wall_color || DEFAULT_WALL_COLOR,
        text_color: configFromDb.text_color || DEFAULT_TEXT_COLOR,
      };
    } else {
      // No DB config – keep a blank panel.
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

  console.log(`Gallery configuration initialized with safe token limits (max ${MAX_TOKENS_PER_COLLECTION} per contract).`);
}

export const GALLERY_PANEL_CONFIG = galleryConfig;

export const getCurrentNftSource = (wallName: keyof PanelConfig) => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || !config.contractAddress || config.tokenIds.length === 0) return null;
  const tokenId = config.tokenIds[config.currentIndex];
  return {
    contractAddress: config.contractAddress,
    tokenId,
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