import { fetchTotalSupply } from '@/utils/nftFetcher';
import { supabase } from '@/integrations/supabase/client';
import { PANEL_KEYS } from './panelKeys';

export interface NftCollection {
  name: string;
  contractAddress: string;
  tokenIds: number[]; // Array of token IDs available in this collection
  currentIndex: number; // Index of the currently displayed token in the tokenIds array
}

export interface PanelConfig {
  [wallName: string]: NftCollection;
}

// This will be populated dynamically from the database
let galleryConfig: PanelConfig = {};

// Map to cache fetched token IDs for each unique contract address
const tokenMap: { [contractAddress: string]: number[] } = {};

// Function to initialize the gallery configuration by fetching from Supabase
export async function initializeGalleryConfig() {
  console.log("Initializing and verifying gallery configuration...");

  // 1. Fetch existing config from Supabase to check for missing keys
  const { data: existingConfig, error: fetchError } = await supabase
    .from('gallery_config')
    .select('panel_key');

  if (fetchError) {
    console.error("FATAL: Could not fetch existing gallery configuration.", fetchError);
    galleryConfig = {};
    return;
  }

  // 2. Identify missing keys by comparing against the canonical list
  const existingKeys = new Set(existingConfig.map(item => item.panel_key));
  const missingKeys = PANEL_KEYS.filter(key => !existingKeys.has(key));

  // 3. If there are missing keys, insert them with default values
  if (missingKeys.length > 0) {
    console.log(`Found ${missingKeys.length} missing panel configurations. Creating them now...`);
    const newRows = missingKeys.map(key => ({
      panel_key: key,
      collection_name: 'Blank Panel',
      contract_address: '',
      default_token_id: 1,
    }));

    const { error: insertError } = await supabase.from('gallery_config').insert(newRows);

    if (insertError) {
      console.error("Failed to insert missing panel configurations.", insertError);
    } else {
      console.log("Successfully created missing panel configurations.");
    }
  }

  // 4. Fetch the complete, final configuration from the database
  console.log("Fetching final gallery configuration from database...");
  const { data: dbConfig, error } = await supabase
    .from('gallery_config')
    .select('panel_key, collection_name, contract_address, default_token_id');

  if (error) {
    console.error("FATAL: Could not load gallery configuration from Supabase.", error);
    galleryConfig = {};
    return;
  }

  // Temporarily build the new config
  const newConfig: PanelConfig = {};
  for (const item of dbConfig) {
    newConfig[item.panel_key] = {
      name: item.collection_name || 'Unnamed Collection',
      contractAddress: item.contract_address || '',
      tokenIds: [item.default_token_id || 1], // Placeholder
      currentIndex: 0,
    };
  }

  // Get unique contract addresses to fetch total supply efficiently
  const uniqueContracts = Array.from(new Set(dbConfig.map(c => c.contract_address))).filter(addr => !!addr);

  for (const address of uniqueContracts) {
    try {
      const totalSupply = await fetchTotalSupply(address);
      if (totalSupply !== null) {
        tokenMap[address] = Array.from({ length: totalSupply }, (_, i) => i + 1);
      } else {
        tokenMap[address] = [];
      }
    } catch (err) {
      console.error(`Failed to initialize collection at ${address}:`, err);
      tokenMap[address] = [];
    }
  }

  // Finalize the config with correct tokenIds and currentIndex
  for (const item of dbConfig) {
    const panel = newConfig[item.panel_key];
    if (panel.contractAddress) {
      const tokens = tokenMap[panel.contractAddress];
      if (tokens && tokens.length > 0) {
        panel.tokenIds = tokens;
        const defaultTokenIndex = tokens.indexOf(item.default_token_id);
        panel.currentIndex = defaultTokenIndex !== -1 ? defaultTokenIndex : 0;
      } else {
        panel.tokenIds = [item.default_token_id || 1];
        panel.currentIndex = 0;
      }
    } else {
        panel.name = "Blank Panel";
        panel.tokenIds = [];
        panel.currentIndex = 0;
    }
  }
  
  galleryConfig = newConfig;
  console.log("Gallery configuration fully initialized.");
}

// Export the configuration object reference
export const GALLERY_PANEL_CONFIG = galleryConfig;

// Utility function to get the current NFT source for a wall
export const getCurrentNftSource = (wallName: keyof PanelConfig) => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || !config.contractAddress || config.tokenIds.length === 0) return null;
  const tokenId = config.tokenIds[config.currentIndex];
  return {
    contractAddress: config.contractAddress,
    tokenId: tokenId,
  };
};

// Utility function to update the current index (used by NftGallery)
export const updatePanelIndex = (wallName: keyof PanelConfig, direction: 'next' | 'prev') => {
  const config = GALLERY_PANEL_CONFIG[wallName];
  if (!config || config.tokenIds.length <= 1) return false;

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