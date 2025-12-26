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
  contentUrl: string;
  contentType: string;
  source: string;
  attributes?: NftAttribute[];
}

export type NftMetadataResult = {
  ok: true;
  metadata: NftMetadata;
} | {
  ok: false;
  reason: string;
  error?: string;
};

/**
 * Helper to retry an async function with exponential backoff and jitter.
 */
async function retry<T>(fn: () => Promise<T>, retries = 5, initialDelay = 1000): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (e: any) {
      attempt++;
      if (attempt >= retries) throw e;
      
      // Check for specific error codes like 429 (Too Many Requests)
      const isRateLimit = e?.status === 429 || String(e).includes("429") || String(e).includes("too many requests");
      
      // Calculate delay: initialDelay * 2^attempt + random jitter
      const backoff = initialDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 1000;
      const delay = (isRateLimit ? backoff * 2 : backoff) + jitter;
      
      console.warn(`[NFT Fetcher] Attempt ${attempt} failed. Retrying in ${Math.round(delay)}ms...`, e.message || e);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error("Retry exhausted");
}

async function parseMetadataObject(meta: any, baseUri?: string): Promise<Omit<NftMetadata, 'source'>> {
  const getField = (k: string) => meta[k] ?? meta.properties?.[k] ?? null;

  let animation = meta.animation_url ?? meta.animationURL ?? getField("animation_url") ?? null;
  let image = meta.image ?? meta.image_url ?? meta.imageURL ?? null;

  function resolveUrl(u?: string) {
    if (!u) return null;
    if (u.startsWith("http") || u.startsWith("ipfs://") || u.startsWith("data:")) return normalizeUrl(u);
    if (baseUri) {
      return baseUri.replace(/\/?$/, "/") + u.replace(/^\//, "");
    }
    return u;
  }

  const animationUrl = resolveUrl(animation);
  const imageUrl = resolveUrl(image);
  const contentUrl = animationUrl ?? imageUrl ?? '';
  let contentType = "image/unknown"; // Default fallback

  // 1. Extension-based guess (fastest, no CORS issues)
  if (contentUrl) {
    const urlLower = contentUrl.toLowerCase().split('?')[0].split('#')[0];
    if (urlLower.match(/\.(mp4|webm|ogg|mov)$/)) contentType = 'video/mp4';
    else if (urlLower.match(/\.(gif)$/)) contentType = 'image/gif';
    else if (urlLower.match(/\.(png|jpg|jpeg|webp|svg)$/)) contentType = 'image/jpeg';
  }

  // 2. Server-side HEAD check (more accurate, but prone to CORS failures)
  if (contentUrl && contentUrl.startsWith('http') && contentType.includes('unknown')) {
    try {
      const head = await fetch(contentUrl, { method: "HEAD" });
      const type = head.headers.get("content-type");
      if (type) contentType = type;
    } catch (_) {
      // If HEAD fails (CORS), we stick with the extension guess or general fallback
      if (animationUrl && animationUrl === contentUrl) contentType = 'video/unknown';
    }
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

  try {
    const contract = new Contract(contractAddress, [...ERC165, ...ERC721, ...ERC1155], provider);
    
    // 1. Check for ERC-165 support with retry
    const supportRes = await retry(() => safeCall(contract, "supportsInterface", ["0xd9b67a26"]));
    const is1155 = supportRes.ok && !!supportRes.value;

    // 2. Retrieve URI with retry
    let uriRes;
    if (is1155) {
      uriRes = await retry(() => safeCall(contract, "uri", [tokenId]));
    } else {
      uriRes = await retry(() => safeCall(contract, "tokenURI", [tokenId]));
    }

    if (!uriRes.ok) {
      console.warn(`fetchNftMetadata: failed for ${contractAddress}/${tokenId}:`, uriRes.error);
      return { ok: false, reason: "uri_failed", error: uriRes.error };
    }

    let rawUri = uriRes.value as string;
    if (!rawUri) return { ok: false, reason: "empty_uri" };

    if (is1155 && rawUri.includes("{id}")) {
      rawUri = rawUri.replace("{id}", hex64(tokenId));
    }

    const metadataUrl = normalizeUrl(rawUri);
    let meta: any = null;
    let contentType: string = "";

    // 3. Fetch or parse metadata
    if (metadataUrl.startsWith("data:application/json;base64,")) {
      const b64 = metadataUrl.split(",")[1];
      const jsonStr = atob(b64);
      meta = JSON.parse(jsonStr);
    } else {
      const res = await retry(() => fetch(metadataUrl));
      if (res.ok) {
        contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json") || metadataUrl.endsWith(".json")) {
          meta = await res.json();
        }
      }
    }
    
    if (meta) {
      const parsed = await parseMetadataObject(meta, metadataUrl);
      return { ok: true, metadata: { ...parsed, source: metadataUrl } };
    } else {
      const parsed = await parseMetadataObject({ image: metadataUrl }, metadataUrl);
      return { ok: true, metadata: { ...parsed, source: metadataUrl } };
    }

  } catch (e: any) {
    console.error(`[NFT Fetcher] Error fetching ${contractAddress}/${tokenId}:`, e);
    return { ok: false, reason: "exception", error: e.message || String(e) };
  }
}

export async function fetchTotalSupply(contractAddress: string): Promise<number | null> {
  if (!contractAddress) return null;
  try {
    const contract = new Contract(contractAddress, TS_ABI, provider);
    const res = await retry(() => safeCall(contract, "totalSupply", []), 2);
    if (res.ok) return Number(res.value);
    return null;
  } catch (e) {
    return null;
  }
}