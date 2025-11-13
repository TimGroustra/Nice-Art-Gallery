import { JsonRpcProvider, Contract } from "ethers";

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

// Removed fetchCollectionName as it is now hardcoded in galleryConfig.ts

export async function fetchNftMetadata(contractAddress: string, tokenId: number): Promise<NftMetadata> {
  if (!contractAddress || tokenId === undefined) {
    throw new Error("Contract address and token ID must be provided.");
  }

  const contract = new Contract(contractAddress, erc721And1155Abi, provider);
  
  let tokenUri: string | undefined;
  
  // 1. Try ERC-721 standard (tokenURI)
  try {
    tokenUri = await contract.tokenURI(tokenId);
    console.log(`[NFT Fetcher] Token URI (ERC-721) for ${tokenId}: ${tokenUri}`);
  } catch (e) {
    // 2. If ERC-721 fails, try ERC-1155 standard (uri)
    try {
      let uriTemplate = await contract.uri(tokenId);
      
      // ERC-1155 URI can be a template with {id}, a base URI, or a full URI.
      if (uriTemplate.includes('{id}')) {
        // Case A: Standard placeholder found, replace it with the hex ID.
        const hexId = tokenId.toString(16).padStart(64, '0');
        tokenUri = uriTemplate.replace('{id}', hexId);
      } else if (uriTemplate.endsWith('/')) {
        // Case B: Base URI found (e.g., "https://.../api/aliens/"), append token ID.
        tokenUri = `${uriTemplate}${tokenId}`;
      } else {
        // Case C: No placeholder and no trailing slash, assume it's the full URI already.
        // This handles cases like "Voyage" which might return ".../1.json" directly.
        tokenUri = uriTemplate;
      }
      
      console.log(`[NFT Fetcher] URI (ERC-1155) for ${tokenId}: ${tokenUri}`);
    } catch (e2) {
      console.error(`Failed to retrieve token URI/URI from contract for ${contractAddress}/${tokenId}.`, e2);
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


  return {
    title: json.name || `Token #${tokenId}`,
    description: json.description || '(No description)',
    image: imageUrl || '',
    source: metadataUrl,
    attributes: json.attributes || [],
  };
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