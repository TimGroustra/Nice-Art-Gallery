import { fetchNftMetadata, NftMetadata, NftSource, NftAttribute } from './nftFetcher';
import { supabase } from '@/integrations/supabase/client';

// Define a key type for the in-memory cache
type NftCacheKey = string; // Format: 'contractAddress:tokenId'

// In-memory cache storage for the current session (to prevent redundant DB reads/writes)
const memoryCache = new Map<NftCacheKey, NftMetadata>();
const fetchPromises = new Map<NftCacheKey, Promise<NftMetadata>>();

function getCacheKey(contractAddress: string, tokenId: number): NftCacheKey {
  return `${contractAddress}:${tokenId}`;
}

/**
 * Fetches NFT metadata, prioritizing on-demand fetching and using Supabase as a fallback cache.
 * It also utilizes an in-memory cache and deduplicates concurrent requests.
 */
export async function getCachedNftMetadata(contractAddress: string, tokenId: number): Promise<NftMetadata> {
  const key = getCacheKey(contractAddress, tokenId);

  // 1. Check synchronous in-memory cache (fastest)
  if (memoryCache.has(key)) {
    return memoryCache.get(key)!;
  }

  // 2. Check for ongoing fetch promise (deduplication)
  if (fetchPromises.has(key)) {
    return fetchPromises.get(key)!;
  }

  // 3. Define the main fetch operation (External -> Supabase Fallback)
  const fetchOperation = async (): Promise<NftMetadata> => {
    try {
      // 3a. Try fetching externally first (on-demand)
      console.log(`[Cache] Attempting to fetch externally for ${key}...`);
      const metadata = await fetchNftMetadata(contractAddress, tokenId);

      // 3b. If successful, cache in Supabase for future fallbacks and in memory for current session
      console.log(`[Cache] External fetch successful for ${key}. Caching...`);
      const { error: insertError } = await supabase
        .from('gallery_nft_metadata')
        .upsert({
          contract_address: contractAddress,
          token_id: tokenId,
          title: metadata.title,
          description: metadata.description,
          image: metadata.image,
          source: metadata.source,
          attributes: metadata.attributes,
        }, { onConflict: 'contract_address, token_id' });

      if (insertError) {
        console.error(`[Cache] Failed to save metadata to Supabase for ${key}:`, insertError.message);
      } else {
        console.log(`[Cache] Successfully saved metadata for ${key} to Supabase.`);
      }

      memoryCache.set(key, metadata);
      return metadata;

    } catch (externalError) {
      // 3c. If external fetch fails, fallback to Supabase cache
      console.warn(`[Cache] External fetch failed for ${key}: ${externalError.message}. Falling back to Supabase cache.`);
      
      const { data: cachedDataArray, error: cacheError } = await supabase
        .from('gallery_nft_metadata')
        .select('*')
        .eq('contract_address', contractAddress)
        .eq('token_id', tokenId)
        .limit(1);

      if (cacheError) {
        console.error(`[Cache] Supabase fallback read error for ${key}:`, cacheError.message);
        // If both external and Supabase fail, re-throw the original error
        throw externalError;
      }

      const cachedData = cachedDataArray?.[0];

      if (cachedData) {
        console.log(`[Cache] Hit for ${key} in Supabase on fallback.`);
        const metadata: NftMetadata = {
          title: cachedData.title || '',
          description: cachedData.description || '',
          image: cachedData.image || '',
          source: cachedData.source || '',
          attributes: cachedData.attributes as NftAttribute[] || [],
        };
        // Cache in memory for the current session
        memoryCache.set(key, metadata);
        return metadata;
      }

      // 4. If both fail, re-throw the original error from the external fetch
      console.error(`[Cache] Supabase fallback miss for ${key}. No data available.`);
      throw externalError;
    }
  };

  // 4. Execute fetch operation and manage promise map
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