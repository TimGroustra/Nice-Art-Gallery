import { JsonRpcProvider, Contract, ethers } from "ethers";

// Ankr RPC endpoint for Electroneum
const RPC_URL = "https://rpc.ankr.com/electroneum";
const provider = new JsonRpcProvider(RPC_URL);

const erc721And1155Abi = [
  "function name() view returns (string)",
  "function tokenURI(uint256 tokenId) view returns (string)", // ERC-721
  "function uri(uint256 _id) view returns (string)", // ERC-1155
  "function totalSupply() view returns (uint256)",
  "function supportsInterface(bytes4) view returns (bool)" // ERC-165
];

// Define NftSource interface
export interface NftSource {
  contractAddress: string;
  tokenId: number;
}

// --- IPFS and URL Utilities ---

const IPFS_GATEWAYS = [
  (p: string) => p.replace(/^ipfs:\/\/(ipfs\/)?/, "https://dweb.link/ipfs/"),
  (p: string) => p.replace(/^ipfs:\/\/(ipfs\/)?/, "https://cloudflare-ipfs.com/ipfs/"),
  (p: string) => p.replace(/^ipfs:\/\/(ipfs\/)?/, "https://ipfs.io/ipfs/")
];

export function normalizeUrl(url: string): string {
  if (!url) return url;
  url = url.trim();
  if (url.startsWith('ipfs://')) {
    // Try ordered gateways
    for (const g of IPFS_GATEWAYS) {
      const candidate = g(url);
      return candidate;
    }
  }
  return url;
}

function hex64(id: number | string): string {
  // returns 64-len lowercase hex (no 0x)
  const bn = ethers.BigNumber.from(id.toString());
  let hex = bn.toHexString().replace(/^0x/, "");
  hex = hex.padStart(64, "0").toLowerCase();
  return hex;
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

// --- Core Fetching Logic ---

async function parseMetadataObject(meta: any, baseUri?: string): Promise<Omit<NftMetadata, 'source'>> {
  const getField = (k: string) => meta[k] ?? meta.properties?.[k] ?? null;

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

  // choose content: prefer animation/video when present
  const contentUrl = animationUrl ?? imageUrl ?? '';
  let contentType = "";

  // attempt HEAD to detect type (non-blocking best-effort)
  if (contentUrl && !contentUrl.startsWith('data:')) {
    try {
      const head = await fetch(contentUrl, { method: "HEAD" });
      contentType = head.headers.get("content-type") ?? "";
    } catch (_) {
      // Ignore HEAD request failure
    }
  }
  
  // Fallback content type detection based on extension
  if (!contentType && contentUrl) {
      if (contentUrl.match(/\.(mp4|webm|ogg)(\?|$)/i)) contentType = 'video/mp4';
      else if (contentUrl.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/i)) contentType = 'image/jpeg';
  }


  return {
    title: meta.name || '(No Title)',
    description: meta.description || '(No description)',
    contentUrl: contentUrl,
    contentType: contentType,
    attributes: meta.attributes || [],
  };
}


export async function fetchNftMetadata(contractAddress: string, tokenId: number): Promise<NftMetadata> {
  if (!contractAddress || tokenId === undefined) {
    throw new Error("Contract address and token ID must be provided.");
  }

  const contract = new Contract(contractAddress, erc721And1155Abi, provider);
  
  let rawUri: string | null = null;
  let is1155 = false;
  
  // 1. Check for ERC-1155 support (best effort)
  try {
    // ERC-1155 interface ID: 0xd9b67a26
    is1155 = await contract.supportsInterface("0xd9b67a26"); 
  } catch (e) {
    // Ignore if supportsInterface fails
  }

  try {
    if (is1155) {
      rawUri = await contract.uri(tokenId);
      // Replace {id} per EIP-1155: lowercase hex, 64 chars (no 0x)
      if (rawUri && rawUri.includes("{id}")) {
        rawUri = rawUri.replace("{id}", hex64(tokenId));
      }
    } else {
      // Try ERC-721 tokenURI
      rawUri = await contract.tokenURI(tokenId);
    }
  } catch (err: any) {
    // Contract call failed (revert / invalid tokenId).
    console.warn(`Failed to retrieve token URI/URI from contract for ${contractAddress}/${tokenId}.`, err?.reason || err?.message || err);
    throw new Error("Failed to retrieve token URI from contract.");
  }

  if (!rawUri) {
    throw new Error("Token URI resolved to an empty URL.");
  }

  const metadataUrl = normalizeUrl(rawUri);
  
  // Handle data:application/json;base64,...
  if (metadataUrl.startsWith("data:application/json;base64,")) {
    const b64 = metadataUrl.split(",")[1];
    const jsonStr = atob(b64);
    const meta = JSON.parse(jsonStr);
    const parsed = await parseMetadataObject(meta, metadataUrl);
    return { ...parsed, source: metadataUrl };
  }

  // Try to fetch JSON metadata
  try {
    const res = await fetch(metadataUrl);
    if (!res.ok) {
      throw new Error(`HTTP Status ${res.status}`);
    }
    
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json") || metadataUrl.endsWith(".json")) {
      const meta = await res.json();
      const parsed = await parseMetadataObject(meta, metadataUrl);
      return { ...parsed, source: metadataUrl };
    }

    // If it's not JSON, treat the URI itself as the media content URL
    const parsed = await parseMetadataObject({ image: metadataUrl }, metadataUrl);
    return { ...parsed, source: metadataUrl };

  } catch (e) {
    console.error(`[NFT Fetcher] Failed to fetch metadata from ${metadataUrl}. Falling back to direct media guess.`, e);
    
    // Fallback: assume the URI is a direct media link
    const parsed = await parseMetadataObject({ image: metadataUrl }, metadataUrl);
    return { ...parsed, source: metadataUrl };
  }
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