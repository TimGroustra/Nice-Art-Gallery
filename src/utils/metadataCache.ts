import { fetchNftMetadata, NftMetadata, NftAttribute } from './nftFetcher';

// Define a key type for the cache
type NftCacheKey = string; // Format: 'contractAddress:tokenId'

// Cache storage
const metadataCache = new Map<NftCacheKey, NftMetadata>();
const fetchPromises = new Map<NftCacheKey, Promise<NftMetadata | null>>(); // Promise now resolves to NftMetadata or null

function getCacheKey(contractAddress: string, tokenId: number): NftCacheKey {
  return `${contractAddress}:${tokenId}`;
}

/**
 * Fetches NFT metadata, utilizing a cache and deduplicating concurrent requests.
 * Returns NftMetadata on success, or null on failure (e.g., invalid token ID, network error).
 */
export async function getCachedNftMetadata(contractAddress: string, tokenId: number): Promise<NftMetadata | null> {
  const key = getCacheKey(contractAddress, tokenId);

  // 1. Check synchronous cache
  if (metadataCache.has(key)) {
    return metadataCache.get(key)!;
  }

  // 2. Check for ongoing fetch promise (deduplication)
  if (fetchPromises.has(key)) {
    return fetchPromises.get(key)!;
  }

  // 3. Start new fetch
  const fetchPromise = (async () => {
    const result = await fetchNftMetadata(contractAddress, tokenId);
    
    if (result.ok) {
      // Cache result upon success
      metadataCache.set(key, result.metadata);
      return result.metadata;
    } else {
      // Access reason and error only when result.ok is false
      console.warn(`[Metadata Cache] Failed to fetch metadata for ${key}. Reason: ${result.reason}`, result.error);
      return null;
    }
  })();
  
  fetchPromises.set(key, fetchPromise);

  try {
    const metadata = await fetchPromise;
    return metadata;
  } finally {
    // Remove promise regardless of success/failure to allow retries if needed, 
    // but keep successful results in metadataCache.
    fetchPromises.delete(key);
  }
}