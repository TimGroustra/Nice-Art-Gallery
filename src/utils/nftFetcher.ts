import { JsonRpcProvider, Contract } from "ethers";
import { supabase } from "@/integrations/supabase/client"; // Correctly import the initialized client

// Ankr RPC endpoint for Electroneum (only used for totalSupply)
const RPC_URL = "https://rpc.ankr.com/electroneum";
const provider = new JsonRpcProvider(RPC_URL);
// Removed: const supabase = createClient();

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

// Utility: normalize ipfs:// to https gateway (kept for consistency, though Edge Function handles it)
export function normalizeUrl(url: string): string {
  if (!url) return url;
  url = url.trim();
  
  if (url.startsWith('ipfs://')) {
    // Handle both ipfs:// and ipfs://ipfs/ formats
    const path = url.replace(/^ipfs:\/\/(ipfs\/)?/, '');
    const normalized = `https://ipfs.io/ipfs/${path}`;
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
 * Fetches NFT metadata, prioritizing Supabase cache, then calling the Edge Function 
 * to fetch from the blockchain/IPFS and cache the result.
 */
export async function fetchNftMetadata(contractAddress: string, tokenId: number): Promise<NftMetadata> {
  if (!contractAddress || tokenId === undefined) {
    throw new Error("Contract address and token ID must be provided.");
  }

  // 1. Check Supabase Cache
  const { data: cachedData, error: selectError } = await supabase
    .from('gallery_nft_metadata')
    .select('*')
    .eq('contract_address', contractAddress)
    .eq('token_id', tokenId)
    .single();

  if (selectError && selectError.code !== 'PGRST116') { // PGRST116 is "No rows found"
    console.error("Error checking Supabase cache:", selectError);
    // Continue to Edge Function if there's a database error other than 'not found'
  }

  if (cachedData) {
    console.log(`[NFT Fetcher] Cache hit for ${contractAddress}/${tokenId}.`);
    return {
      title: cachedData.title || `Token #${tokenId}`,
      description: cachedData.description || '(No description)',
      image: cachedData.image || '',
      source: cachedData.source || 'Supabase Cache',
      attributes: cachedData.attributes || [],
    };
  }

  // 2. Cache Miss: Call Edge Function to fetch and cache
  console.log(`[NFT Fetcher] Cache miss for ${contractAddress}/${tokenId}. Calling Edge Function.`);
  
  // NOTE: We must use the full hardcoded URL path for Edge Functions
  const EDGE_FUNCTION_URL = `https://yvigiirlsdbhmmcqvznk.supabase.co/functions/v1/fetch-and-cache-nft-metadata`;

  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabase.auth.session()?.access_token || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2aWdpaXJsc2RiaG1tY3F2em5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwODg4ODYsImV4cCI6MjA2NzY2NDg4Nn0.o2YAwA8zeQL9lB0WD3vlBJFRZafcjypxlYDwwCQx_U0"}`,
    },
    body: JSON.stringify({ contractAddress, tokenId }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[NFT Fetcher] Edge Function failed: ${response.status} - ${errorText}`);
    throw new Error(`Failed to fetch metadata via Edge Function: ${response.statusText}`);
  }

  const metadata = await response.json();
  
  // The Edge Function handles caching, so we just return the result.
  return metadata as NftMetadata;
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