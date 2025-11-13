import { fetchNftMetadata, NftMetadata, NftSource, NftAttribute } from './nftFetcher';
import { supabase } from '@/integrations/supabase/client';
import { ELECTROPUNKS_ADDRESS } from '@/config/galleryConfig';

// Define a key type for the in-memory cache
type NftCacheKey = string; // Format: 'contractAddress:tokenId'

// In-memory cache storage for the current session (to prevent redundant DB reads/writes)
const memoryCache = new Map<NftCacheKey, NftMetadata>();
const fetchPromises = new Map<NftCacheKey, Promise<NftMetadata>>();

function getCacheKey(contractAddress: string, tokenId: number): NftCacheKey {
  return `${contractAddress}:${tokenId}`;
}

/**
 * Fetches NFT metadata, utilizing a persistent Supabase cache, an in-memory cache, 
 * and deduplicating concurrent requests.
 * 
 * For ElectroPunks, it relies exclusively on the Supabase cache.
 */
export async function getCachedNftMetadata(contractAddress: string, tokenId: number): Promise<NftMetadata> {
  const key = getCacheKey(contractAddress, tokenId);
  const isElectroPunks = contractAddress === ELECTROPUNKS_ADDRESS;

  // 1. Check synchronous in-memory cache (fastest)
  if (memoryCache.has(key)) {
    return memoryCache.get(key)!;
  }

  // 2. Check for ongoing fetch promise (deduplication)
  if (fetchPromises.has(key)) {
    return fetchPromises.get(key)!;
  }

  // --- Define the main fetch operation ---
  const fetchOperation = async (): Promise<NftMetadata> => {
    
    let metadata: NftMetadata | null = null;

    // --- A. Primary Fetch Strategy: Check Persistent Supabase Cache ---
    const { data: cachedData, error: cacheError } = await supabase
      .from('gallery_nft_metadata')
      .select('*')
      .eq('contract_address', contractAddress)
      .eq('token_id', tokenId)
      .single();

    if (cachedData) {
      console.log(`[Cache] Hit for ${key} in Supabase.`);
      metadata = {
        title: cachedData.title || '',
        description: cachedData.description || '',
        image: cachedData.image || '',
        source: cachedData.source || '',
        attributes: cachedData.attributes as NftAttribute[] || [],
      };
    } else if (cacheError && cacheError.code !== 'PGRST116') { // PGRST116 = No rows found
        console.warn(`[Cache] Supabase read error for ${key}:`, cacheError.message);
    }
    
    // --- B. Fallback Strategy ---
    if (!metadata) {
        if (isElectroPunks) {
            // CRITICAL CHANGE: If ElectroPunks metadata is not in cache, we assume it's unavailable.
            console.warn(`[Cache] ElectroPunks: Cache miss for ${key}. Skipping external fetch due to known IPFS issues.`);
            throw new Error(`ElectroPunks token ${tokenId} metadata not found in cache.`);
        } else {
            // Default collections: Fallback to External Fetcher (Edge Function) if cache missed
            console.log(`[Cache] Miss for ${key}. Fetching externally...`);
            metadata = await fetchNftMetadata(contractAddress, tokenId);
            
            // Note: fetchNftMetadata (Edge Function) handles its own DB caching, so we only need memory cache here.
        }
    }

    // --- C. Cache result in memory ---
    if (metadata) {
        memoryCache.set(key, metadata);
    }

    return metadata!;
  };

  // 3. Execute fetch operation and manage promise map
  const fetchPromise = fetchOperation();
  fetchPromises.set(key, fetchPromise);

  try {
    const metadata = await fetchPromise;
    return metadata;
  } finally {
    // Remove promise regardless of success/failure
    fetchPromises.delete(key);
  }
}