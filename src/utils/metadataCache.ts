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
 * For ElectroPunks, it prioritizes external fetch (RPC/Edge Function) and uses Supabase cache as backup.
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
    let fetchError: Error | null = null;

    // --- A. Primary Fetch Strategy (External for ElectroPunks, Cache for others) ---
    if (isElectroPunks) {
      // Strategy 1: ElectroPunks - Try External Fetch first (RPC/Edge Function)
      console.log(`[Cache] ElectroPunks: Prioritizing external fetch for ${key}...`);
      try {
        metadata = await fetchNftMetadata(contractAddress, tokenId);
        console.log(`[Cache] ElectroPunks: External fetch successful.`);
      } catch (e) {
        fetchError = e as Error;
        console.warn(`[Cache] ElectroPunks: External fetch failed. Falling back to Supabase cache. Error: ${fetchError.message}`);
      }
    }

    if (!metadata) {
      // Strategy 2: Check Persistent Supabase Cache (Primary for others, Secondary for ElectroPunks)
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
    }
    
    // --- B. Final Fallback (External Fetch if not ElectroPunks, or if ElectroPunks cache failed) ---
    if (!metadata) {
        if (!isElectroPunks) {
            // Strategy 3: Default collections - Fallback to External Fetcher (Edge Function) if cache missed
            console.log(`[Cache] Miss for ${key}. Fetching externally...`);
            metadata = await fetchNftMetadata(contractAddress, tokenId);
        } else if (fetchError) {
            // ElectroPunks failed both external and cache checks. Re-throw the original external error.
            throw fetchError;
        } else {
            // ElectroPunks was fetched externally but returned null/empty data (shouldn't happen if fetchNftMetadata throws on error)
            // If we reach here, it means the external fetch was skipped or succeeded but returned no data, and cache missed.
            // Since we already tried external fetch for ElectroPunks, we assume failure if metadata is still null.
            throw new Error(`Failed to retrieve metadata for ElectroPunks token ${tokenId} from RPC or cache.`);
        }
    }

    // --- C. Cache result in Supabase and memory ---
    
    // Only attempt to cache if we successfully retrieved metadata externally (i.e., if metadata.source is the external URL)
    // Note: The Edge Function itself already handles DB caching, but if we fetched it here (Strategy 3), we need to ensure it's cached.
    // Since Strategy 3 calls fetchNftMetadata, and fetchNftMetadata calls the Edge Function, and the Edge Function handles DB caching, 
    // we only need to worry about the in-memory cache here.
    
    if (metadata) {
        // Cache result in memory for the current session
        memoryCache.set(key, metadata);
    }

    return metadata;
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