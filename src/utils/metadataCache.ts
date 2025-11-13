import { fetchNftMetadata, NftMetadata, NftAttribute } from './nftFetcher';

// Define a key type for the cache
type NftCacheKey = string; // Format: 'contractAddress:tokenId'

// Cache storage
const metadataCache = new Map<NftCacheKey, NftMetadata>();
const fetchPromises = new Map<NftCacheKey, Promise<NftMetadata>>();

function getCacheKey(contractAddress: string, tokenId: number): NftCacheKey {
  return `${contractAddress}:${tokenId}`;
}

/**
 * Fetches NFT metadata, utilizing a cache and deduplicating concurrent requests.
 */
export async function getCachedNftMetadata(contractAddress: string, tokenId: number): Promise<NftMetadata> {
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
  const fetchPromise = fetchNftMetadata(contractAddress, tokenId);
  fetchPromises.set(key, fetchPromise);

  try {
    const metadata = await fetchPromise;
    
    // Cache result upon success
    metadataCache.set(key, metadata);
    return metadata;
  } finally {
    // Remove promise regardless of success/failure to allow retries if needed, 
    // but keep successful results in metadataCache.
    fetchPromises.delete(key);
  }
}