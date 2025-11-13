import { supabase } from '@/integrations/supabase/client';

// List of reliable IPFS gateways (order matters: prefer the most reliable)
const IPFS_GATEWAYS = [
  "https://cloudflare-ipfs.com/ipfs/",
  "https://dweb.link/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://nftstorage.link/ipfs/"
];

// Small helper: HEAD check with timeout
async function headOk(url: string, timeout = 4500): Promise<boolean> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { method: "HEAD", mode: "cors", signal: controller.signal });
    clearTimeout(id);
    return res.ok;
  } catch (err) {
    clearTimeout(id);
    return false;
  }
}

// Build gateway URL from ipfs:// or direct path
function toGatewayUrl(uri: string, gatewayBase: string): string {
  if (!uri) return uri;
  uri = uri.trim();
  if (uri.startsWith("ipfs://")) return gatewayBase + uri.slice(7);
  // If already an http(s) url, prefer it
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
  // else assume it's a CID/path
  return gatewayBase + uri;
}

/**
 * Tries multiple IPFS gateways sequentially with retries and exponential backoff
 * until a working URL is found. Returns the original URL if it's already HTTP(S) and works.
 * @param uri The original URI (can be ipfs:// or http(s)://)
 * @returns A resolved, working HTTP(S) URL, or null if all attempts fail.
 */
export async function resolveIpfsWithFallback(uri: string): Promise<string | null> {
  if (!uri) return null;
  
  const triesPerGateway = 2;
  const headTimeout = 4500;
  const backoffBase = 300;

  // 1. If it's already http(s) try it first
  if (/^https?:\/\//i.test(uri)) {
    if (await headOk(uri, headTimeout)) return uri;
  }

  // 2. Try all defined gateways
  for (const gw of IPFS_GATEWAYS) {
    const candidate = toGatewayUrl(uri, gw);
    for (let attempt = 0; attempt < triesPerGateway; attempt++) {
      if (await headOk(candidate, headTimeout)) {
        console.log(`[NFT Fetcher] Resolved IPFS URI via gateway: ${gw}`);
        return candidate;
      }
      // Exponential backoff
      await new Promise(r => setTimeout(r, backoffBase * Math.pow(2, attempt)));
    }
  }
  
  // 3. Nothing worked
  return null;
}


// Define NftSource interface
export interface NftSource {
  contractAddress: string;
  tokenId: number;
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
 * Normalizes a URL (primarily used for logging/display purposes now, 
 * but the main resolution logic is in resolveIpfsWithFallback).
 * @deprecated Use resolveIpfsWithFallback for loading assets.
 */
export function normalizeUrl(url: string): string {
  if (!url) return url;
  url = url.trim();
  if (url.startsWith('ipfs://')) {
    // Use a common public gateway for simple display/logging if needed
    return url.replace('ipfs://', 'https://cloudflare-ipfs.com/ipfs/');
  }
  return url;
}


export async function fetchNftMetadata(contractAddress: string, tokenId: number): Promise<NftMetadata> {
  if (!contractAddress || tokenId === undefined) {
    throw new Error("Contract address and token ID must be provided.");
  }

  const { data, error } = await supabase.functions.invoke('fetch-nft-metadata', {
    body: { contractAddress, tokenId },
  });

  if (error) {
    console.error('Error invoking fetch-nft-metadata function:', error);
    throw new Error(error.message);
  }

  return data;
}

export async function fetchTotalSupply(contractAddress: string): Promise<number> {
  if (!contractAddress) {
    throw new Error("Contract address must be provided.");
  }
  
  const { data, error } = await supabase.functions.invoke('fetch-total-supply', {
    body: { contractAddress },
  });

  if (error) {
    console.error('Error invoking fetch-total-supply function:', error);
    throw new Error(error.message);
  }

  return data.totalSupply;
}