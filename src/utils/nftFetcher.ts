import { supabase } from '@/integrations/supabase/client';

// List of reliable IPFS gateways (order matters: prefer the most reliable)
const IPFS_GATEWAYS = [
  "https://cloudflare-ipfs.com/ipfs/",
  "https://dweb.link/ipfs/",
  "https://nftstorage.link/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/" // Moved to last due to reported flakiness
];

// Small helper: HEAD check with timeout
async function headOk(url: string, timeout = 4500): Promise<boolean> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    // Use fetch with HEAD method to quickly check availability
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
 * Tries multiple IPFS gateways sequentially until a working URL is found.
 * @param uri The original URI (can be ipfs:// or http(s)://)
 * @returns A resolved, working HTTP(S) URL, or null if all attempts fail.
 */
export async function resolveIpfsWithFallback(uri: string): Promise<string | null> {
  if (!uri) return null;
  
  const headTimeout = 4500;

  // 1. If it's already http(s) try it first
  if (/^https?:\/\//i.test(uri)) {
    if (await headOk(uri, headTimeout)) return uri;
  }

  // 2. Try all defined gateways
  for (const gw of IPFS_GATEWAYS) {
    const candidate = toGatewayUrl(uri, gw);
    // We only need one successful HEAD check here; the actual loading/validation happens in NftGallery.tsx
    if (await headOk(candidate, headTimeout)) {
      console.log(`[NFT Fetcher] Resolved IPFS URI via gateway: ${gw}`);
      return candidate;
    }
  }
  
  // 3. Nothing worked
  return null;
}

/**
 * Fetches the resource, validates Content-Type, creates a Blob URL, and loads it into an Image element,
 * ensuring decoding is attempted before resolving.
 * This is the robust client-side loader to prevent Chrome security errors.
 * @param url The resolved HTTPS URL.
 * @returns A promise that resolves to a ready HTMLImageElement.
 */
export async function fetchAndDecodeImage(url: string): Promise<HTMLImageElement> {
  // 1. Fetch resource and check content-type + size
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`HTTP status ${res.status}`);
  
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("image/") && !ct.startsWith("video/")) {
    throw new Error("Content-Type mismatch: " + ct);
  }
  
  // For images, we use Blob URL to isolate the resource from the original origin/security context
  if (ct.startsWith("image/")) {
    const blob = await res.blob();
    if (blob.size < 50) throw new Error("Image too small / truncated");
    const blobUrl = URL.createObjectURL(blob);
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = async () => {
        try {
          // Attempt to decode the image before creating the texture
          if ('decode' in img) {
            await img.decode();
          }
        } catch (e) {
          // Decoding failed, but we still resolve the image element
          console.warn("Image decode failed, proceeding anyway:", e);
        }
        
        if (!img.naturalWidth && !img.naturalHeight) {
          URL.revokeObjectURL(blobUrl);
          return reject(new Error("Image loaded but has no pixel data."));
        }
        
        URL.revokeObjectURL(blobUrl); // Revoke immediately after successful load/decode
        resolve(img);
      };
      
      img.onerror = (e) => {
        URL.revokeObjectURL(blobUrl);
        reject(new Error("Image load error: " + url));
      };
      
      img.src = blobUrl;
    });
  }
  
  // For videos, we return a dummy image element or throw, as video handling is different
  // In our case, NftGallery handles video elements directly using the URL.
  if (ct.startsWith("video/")) {
      // We don't need to load the video into an Image element, just return a dummy
      // The caller (NftGallery) must handle video textures separately.
      throw new Error("Resource is a video, not an image. Use the URL directly.");
  }
  
  throw new Error("Unsupported content type.");
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