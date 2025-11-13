import { JsonRpcProvider, Contract, ethers } from "ethers";
import { safeCall } from "./ethersSafe";
import { normalizeUrl, hex64 } from "./urlUtils";

// Ankr RPC endpoint for Electroneum
const RPC_URL = "https://rpc.ankr.com/electroneum";
const provider = new JsonRpcProvider(RPC_URL);

// ABIs for safe calls
const ERC165 = ["function supportsInterface(bytes4) view returns (bool)"];
const ERC721 = ["function tokenURI(uint256) view returns (string)"];
const ERC1155 = ["function uri(uint256) view returns (string)"];
const TS_ABI = ["function totalSupply() view returns (uint256)"];

// Define NftSource interface
export interface NftSource {
  contractAddress: string;
  tokenId: number;
}

// --- Metadata Types ---

export interface NftAttribute {
  trait_type: string;
  value: string | number;
}

export interface NftMetadata {
  title: string;
  description: string;
  contentUrl: string; // The final URL for the media (image or video)
  contentType: string; // Detected content type (e.g., 'image/jpeg', 'video/mp4')
  source: string; // Original metadata URL (resolved tokenURI/uri)
  attributes?: NftAttribute[];
}

// --- Structured Result Types ---

export type NftMetadataResult = {
  ok: true;
  metadata: NftMetadata;
} | {
  ok: false;
  reason: string;
  error?: string;
};


// --- Core Fetching Logic ---

async function parseMetadataObject(meta: any, baseUri?: string): Promise<Omit<NftMetadata, 'source'>> {
  const getField = (k: string) => meta[k] ?? meta.properties?.[k] ?? null;

  // Prioritize animation_url for content, fallback to image
  let animation = meta.animation_url ?? meta.animationURL ?? getField("animation_url") ?? null;
  let image = meta.image ?? meta.image_url ?? meta.imageURL ?? null;

  function resolveUrl(u?: string) {
    if (!u) return null;
    if (u.startsWith("http") || u.startsWith("ipfs://") || u.startsWith("data:")) return normalizeUrl(u);
    // relative path: join with baseUri if provided
    if (baseUri) {
      // naive join
      return baseUri.replace(/\/?$/, "/") + u.replace(/^\//, "");
    }
    return u;
  }

  const animationUrl = resolveUrl(animation);
  const imageUrl = resolveUrl(image);

  // Choose content: prefer animation/video when present
  const contentUrl = animationUrl ?? imageUrl ?? '';
  let contentType = "";

  // 1. Attempt HEAD request to detect type (non-blocking best-effort)
  if (contentUrl && !contentUrl.startsWith('data:')) {
    try {
      const head = await fetch(contentUrl, { method: "HEAD" });
      contentType = head.headers.get("content-type") ?? "";
    } catch (_) {
      // Ignore HEAD request failure
    }
  }
  
  // 2. Fallback content type detection based on extension
  if (!contentType && contentUrl) {
      if (contentUrl.match(/\.(mp4|webm|ogg)(\?|$)/i)) contentType = 'video/mp4';
      else if (contentUrl.match(/\.(gif)(\?|$)/i)) contentType = 'image/gif'; // Explicitly detect GIF
      else if (contentUrl.match(/\.(png|jpg|jpeg|webp)(\?|$)/i)) contentType = 'image/jpeg';
  }
  
  // 3. If animation URL was used but no type detected, assume video
  if (!contentType && animationUrl && animationUrl === contentUrl) {
      contentType = 'video/unknown';
  }
  // 4. If image URL was used but no type detected, assume image
  if (!contentType && imageUrl && imageUrl === contentUrl) {
      contentType = 'image/unknown';
  }


  return {
    title: meta.name || '(No Title)',
    description: meta.description || '(No description)',
    contentUrl: contentUrl,
    contentType: contentType,
    attributes: meta.attributes || [],
  };
}


export async function fetchNftMetadata(contractAddress: string, tokenId: number): Promise<NftMetadataResult> {
  if (!contractAddress || tokenId === undefined) {
    return { ok: false, reason: "invalid_input" };
  }

  // Construct contract with minimal combined ABI
  const contract = new Contract(contractAddress, [...ERC165, ...ERC721, ...ERC1155], provider);
  
  // 1. Check for ERC-1155 support (best effort)
  const supportRes = await safeCall(contract, "supportsInterface", ["0xd9b67a26"]);
  const is1155 = supportRes.ok && !!supportRes.value;

  // 2. Retrieve URI
  let uriRes;
  if (is1155) {
    uriRes = await safeCall(contract, "uri", [tokenId]);
    if (!uriRes.ok) {
      console.warn(`fetchNftMetadata: uri() failed for ${contractAddress}/${tokenId}:`, uriRes.error);
      return { ok: false, reason: "uri_failed", error: uriRes.error };
    }
  } else {
    uriRes = await safeCall(contract, "tokenURI", [tokenId]);
    if (!uriRes.ok) {
      console.warn(`fetchNftMetadata: tokenURI() failed for ${contractAddress}/${tokenId}:`, uriRes.error);
      return { ok: false, reason: "tokenURI_failed", error: uriRes.error };
    }
  }

  let rawUri = uriRes.value as string;
  if (!rawUri) return { ok: false, reason: "empty_uri" };

  if (is1155 && rawUri.includes("{id}")) {
    rawUri = rawUri.replace("{id}", hex64(tokenId));
  }

  const metadataUrl = normalizeUrl(rawUri);
  
  let meta: any = null;
  let contentUrl: string = metadataUrl;
  let contentType: string = "";

  // 3. Fetch or parse metadata
  try {
    // Handle data:application/json;base64,...
    if (metadataUrl.startsWith("data:application/json;base64,")) {
      const b64 = metadataUrl.split(",")[1];
      const jsonStr = atob(b64);
      meta = JSON.parse(jsonStr);
    } else {
      // Try to fetch JSON metadata
      const res = await fetch(metadataUrl);
      if (!res.ok) {
        // If non-JSON (e.g., .mp4) we should treat it as direct media
        contentType = res.headers.get("content-type") || "";
        // contentUrl is already metadataUrl
      } else {
        contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json") || metadataUrl.endsWith(".json")) {
          meta = await res.json();
        } else {
          // Fallback: treat as direct media (image/video/gif)
          // contentUrl is already metadataUrl
        }
      }
    }
    
    if (meta) {
      const parsed = await parseMetadataObject(meta, metadataUrl);
      const finalMetadata: NftMetadata = { ...parsed, source: metadataUrl };
      return { ok: true, metadata: finalMetadata };
    } else {
      // If we didn't get JSON metadata, we treat the URI as the content URL
      const parsed = await parseMetadataObject({ image: metadataUrl }, metadataUrl);
      const finalMetadata: NftMetadata = { ...parsed, source: metadataUrl };
      return { ok: true, metadata: finalMetadata };
    }

  } catch (e) {
    console.error(`[NFT Fetcher] Error processing metadata from ${metadataUrl}.`, e);
    // Fallback: assume the URI is a direct media link
    const parsed = await parseMetadataObject({ image: metadataUrl }, metadataUrl);
    const finalMetadata: NftMetadata = { ...parsed, source: metadataUrl };
    return { ok: true, metadata: finalMetadata };
  }
}

export async function fetchTotalSupply(contractAddress: string): Promise<number | null> {
  if (!contractAddress) {
    return null;
  }
  
  const contract = new Contract(contractAddress, TS_ABI, provider);
  
  // Try totalSupply
  const res = await safeCall(contract, "totalSupply", []);
  
  if (res.ok) {
    try {
      // Use BigNumber conversion if available, otherwise direct Number conversion
      const n = (res.value as ethers.BigNumber).toNumber?.() ?? Number(res.value);
      console.log(`[NFT Fetcher] Total Supply for ${contractAddress}: ${n}`);
      return n;
    } catch (e) {
      console.warn(`[NFT Fetcher] Failed to convert totalSupply result for ${contractAddress}.`, e);
      return null;
    }
  } else {
    console.warn(`[NFT Fetcher] Failed to call totalSupply for ${contractAddress}:`, res.error);
    // Fallback to null if the call fails (common for non-enumerable ERC-721 or ERC-1155)
    return null;
  }
}