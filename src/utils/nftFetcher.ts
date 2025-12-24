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
 * Helper to retry an async function a few times with backoff.
 */
async function retry<T>(fn: () => Promise<T>, retries = 5, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (retries <= 0) throw e;
    console.warn(`[NFT Fetcher] Retrying failed RPC call in ${delay}ms... Retries left: ${retries}`);
    await new Promise(r => setTimeout(r, delay));
    return retry(fn, retries - 1, delay * 2);
  }
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
  let contentType = "";

  if (contentUrl && !contentUrl.startsWith('data:')) {
    try {
      const head = await fetch(contentUrl, { method: "HEAD" });
      contentType = head.headers.get("content-type") ?? "";
    } catch (_) {}
  }
  
  if (!contentType && contentUrl) {
      if (contentUrl.match(/\.(mp4|webm|ogg)(\?|$)/i)) contentType = 'video/mp4';
      else if (contentUrl.match(/\.(gif)(\?|$)/i)) contentType = 'image/gif';
      else if (contentUrl.match(/\.(png|jpg|jpeg|webp)(\?|$)/i)) contentType = 'image/jpeg';
  }
  
  if (!contentType && animationUrl && animationUrl === contentUrl) contentType = 'video/unknown';
  if (!contentType && imageUrl && imageUrl === contentUrl) contentType = 'image/unknown';

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