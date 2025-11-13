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
 * Fetches NFT metadata, utilizing a persistent Supabase cache, an in-memory cache, 
 * and deduplicating concurrent requests.
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

  // 3. Define the main fetch operation (Supabase -> External)
  const fetchOperation = async (): Promise<NftMetadata> => {
    // 3a. Check Persistent Supabase Cache
    const { data: cachedDataArray, error: cacheError } = await supabase
      .from('gallery_nft_metadata')
      .select('*')
      .eq('contract_address', contractAddress)
      .eq('token_id', tokenId)
      .limit(1); // Limit to 1 row

    const cachedData = cachedDataArray?.[0];

    if (cachedData) {
      console.log(`[Cache] Hit for ${key} in Supabase.`);
      const metadata: NftMetadata = {
        title: cachedData.title || '',
        description: cachedData.description || '',
        image: cachedData.image || '',
        source: cachedData.source || '',
        attributes: cachedData.attributes as NftAttribute[] || [],
      };
      memoryCache.set(key, metadata);
      return metadata;
    }

    if (cacheError) {
        console.warn(`[Cache] Supabase read error for ${key}:`, cacheError.message);
    }

    // 3b. Fallback to External Fetcher (Edge Function)
    console.log(`[Cache] Miss for ${key}. Fetching externally...`);
    const metadata = await fetchNftMetadata(contractAddress, tokenId);

    // 3c. Cache result in Supabase for future users
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

    // Cache result in memory for the current session
    memoryCache.set(key, metadata);
    return metadata;
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