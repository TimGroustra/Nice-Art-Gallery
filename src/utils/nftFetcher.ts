import { JsonRpcProvider, Contract } from "ethers";
import { supabase } from "@/integrations/supabase/client";

// Ankr RPC endpoint for Electroneum
const RPC_URL = "https://rpc.ankr.com/electroneum";
const provider = new JsonRpcProvider(RPC_URL);

const erc721And1155Abi = [
  "function name() view returns (string)",
  "function tokenURI(uint256 tokenId) view returns (string)", // ERC-721
  "function uri(uint256 _id) view returns (string)", // ERC-1155
  "function totalSupply() view returns (uint256)"
];

// Define NftSource interface
export interface NftSource {
  contractAddress: string;
  tokenId: number;
}

// Utility: normalize ipfs:// to https gateway
export function normalizeUrl(url: string): string {
  if (!url) return url;
  url = url.trim();
  if (url.startsWith('ipfs://')) {
    // Using a common public gateway
    const normalized = url.replace('ipfs://', 'https://ipfs.io/ipfs/');
    console.log(`[NFT Fetcher] Normalized IPFS URL: ${normalized}`);
    return normalized;
  }
  return url;
}

export interface NftAttribute {
  trait_type: string;
  value: string | number;
}

export interface NftMetadata {
  title: string;
  description: string;
  image: string;
  source: string; // Original metadata URL (resolved tokenURI/uri)
  attributes?: NftAttribute[];
}

/**
 * Fetches NFT metadata, prioritizing the Supabase cache.
 * Falls back to direct contract/metadata fetch if not found in cache.
 */
export async function fetchNftMetadata(contractAddress: string, tokenId: number): Promise<NftMetadata> {
  if (!contractAddress || tokenId === undefined) {
    throw new Error("Contract address and token ID must be provided.");
  }

  // 1. Check Supabase Cache
  try {
    const { data, error } = await supabase
      .from('gallery_nft_metadata')
      .select('title, description, image, source, attributes')
      .eq('contract_address', contractAddress)
      .eq('token_id', tokenId)
      .single();

    if (data) {
      console.log(`[NFT Fetcher] Cache hit for ${contractAddress}/${tokenId}.`);
      return {
        title: data.title || `Token #${tokenId}`,
        description: data.description || '(No description)',
        image: data.image || '',
        source: data.source || '',
        attributes: data.attributes as NftAttribute[] || [],
      };
    }
    if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found"
      console.warn(`[NFT Fetcher] Supabase cache query error (non-404):`, error);
    }
  } catch (e) {
    console.error("[NFT Fetcher] Error checking Supabase cache:", e);
    // Continue to fallback if cache check fails
  }

  // 2. Fallback: Direct Contract Fetch (Slow Path)
  console.log(`[NFT Fetcher] Cache miss for ${contractAddress}/${tokenId}. Falling back to slow fetch.`);
  
  const contract = new Contract(contractAddress, erc721And1155Abi, provider);
  
  let tokenUri: string | undefined;
  
  // Try ERC-721 standard (tokenURI)
  try {
    tokenUri = await contract.tokenURI(tokenId);
    console.log(`[NFT Fetcher] ERC-721 tokenURI success for ${contractAddress}/${tokenId}.`);
  } catch (e) {
    console.warn(`[NFT Fetcher] ERC-721 tokenURI failed for ${contractAddress}/${tokenId}. Trying ERC-1155 uri. Error:`, e);
    // If ERC-721 fails, try ERC-1155 standard (uri)
    try {
      let uriTemplate = await contract.uri(tokenId);
      
      if (uriTemplate.includes('{id}')) {
        const hexId = tokenId.toString(16).padStart(64, '0');
        tokenUri = uriTemplate.replace('{id}', hexId);
      } else if (uriTemplate.endsWith('/')) {
        tokenUri = `${uriTemplate}${tokenId}`;
      } else {
        tokenUri = uriTemplate;
      }
      console.log(`[NFT Fetcher] ERC-1155 uri success for ${contractAddress}/${tokenId}.`);
    } catch (e2) {
      console.error(`[NFT Fetcher] Failed to retrieve token URI/URI from contract for ${contractAddress}/${tokenId}.`, e2);
      throw new Error("Failed to retrieve token URI from contract.");
    }
  }

  const metadataUrl = normalizeUrl(tokenUri!);
  
  if (!metadataUrl) {
    throw new Error("Token URI resolved to an empty URL.");
  }

  const res = await fetch(metadataUrl);
  if (!res.ok) {
    console.error(`[NFT Fetcher] Failed to fetch metadata from ${metadataUrl}: Status ${res.status}`);
    throw new Error(`Failed to fetch metadata from ${metadataUrl}: Status ${res.status}`);
  }
  
  const json = await res.json();

  let imageUrl = json.image || json.image_url || json.imageURI || json.gif;
  imageUrl = normalizeUrl(imageUrl);
  
  console.log(`[NFT Fetcher] Final Image URL for ${tokenId}: ${imageUrl}`);

  const metadata: NftMetadata = {
    title: json.name || `Token #${tokenId}`,
    description: json.description || '(No description)',
    image: imageUrl || '',
    source: metadataUrl,
    attributes: json.attributes || [],
  };
  
  // Optional: If we successfully fetched via the slow path, we could try to cache it here too, 
  // but for simplicity and to rely on the dedicated Edge Function, we skip client-side caching.

  return metadata;
}

export async function fetchTotalSupply(contractAddress: string): Promise<number> {
  if (!contractAddress) {
    throw new Error("Contract address must be provided.");
  }
  
  const contract = new Contract(contractAddress, erc721And1155Abi, provider);
  
  try {
    const supply = await contract.totalSupply();
    const total = Number(supply);
    console.log(`[NFT Fetcher] Total Supply for ${contractAddress}: ${total}`);
    return total;
  } catch (e) {
    console.error(`Failed to call totalSupply for ${contractAddress}:`, e);
    // Fallback to a reasonable default if the call fails (e.g., for ERC-1155 which often lacks totalSupply)
    return 100; 
  }
}