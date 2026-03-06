import { fetchNftMetadata, NftMetadata, NftAttribute } from './nftFetcher';

// Define a key type for the cache
type NftCacheKey = string; // Format: 'contractAddress:tokenId'

// Cache storage
const metadataCache = new Map<NftCacheKey, NftMetadata>();
const fetchPromises = new Map<NftCacheKey, Promise<NftMetadata | null>>();

function getCacheKey(contractAddress: string, tokenId: number): NftCacheKey {
  return `${contractAddress.toLowerCase()}:${tokenId}`;
}

/**
 * Primes the cache with a list of metadata objects (e.g. from a bulk server fetch).
 */
export function primeMetadataCache(items: any[]) {
  items.forEach(item => {
    const key = getCacheKey(item.contract_address, item.token_id);
    metadataCache.set(key, {
      title: item.title,
      description: item.description,
      contentUrl: item.image, // Map DB 'image' to 'contentUrl'
      contentType: item.image?.match(/\.(mp4|webm|ogg|mov)$/i) ? 'video/mp4' : 'image/jpeg',
      source: item.source,
      attributes: item.attributes || []
    });
  });
}

/**
 * Fetches NFT metadata, utilizing a cache and deduplicating concurrent requests.
 */
export async function getCachedNftMetadata(contractAddress: string, tokenId: number): Promise<NftMetadata | null> {
  const key = getCacheKey(contractAddress, tokenId);

  if (metadataCache.has(key)) {
    return metadataCache.get(key)!;
  }

  if (fetchPromises.has(key)) {
    return fetchPromises.get(key)!;
  }

  const fetchPromise = (async () => {
    const result = await fetchNftMetadata(contractAddress, tokenId);
    
    if (result.ok) {
      metadataCache.set(key, result.metadata);
      return result.metadata;
    } else {
      return null;
    }
  })();
  
  fetchPromises.set(key, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    fetchPromises.delete(key);
  }
}