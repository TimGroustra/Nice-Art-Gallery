import { JsonRpcProvider, Contract, BigNumber } from "ethers";

// Ankr RPC endpoint for Electroneum
const RPC_URL = "https://rpc.ankr.com/electroneum";
const provider = new JsonRpcProvider(RPC_URL);

const erc721And1155Abi = [
  "function name() view returns (string)",
  "function tokenURI(uint256 tokenId) view returns (string)", // ERC-721
  "function uri(uint256 _id) view returns (string)", // ERC-1155
  "function totalSupply() view returns (uint256)",
  "function tokenByIndex(uint256 index) view returns (uint256)" // ERC-721 Enumerable
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
      // ERC-1155 URI often contains {id} placeholder, which needs to be replaced.
      let uriTemplate = await contract.uri(tokenId);
      
      // Replace {id} placeholder with the token ID in hex format (padded to 64 chars)
      // This is a a common convention for ERC-1155 metadata URIs.
      const hexId = BigNumber.from(tokenId).toHexString().substring(2).padStart(64, '0');
      tokenUri = uriTemplate.replace('{id}', hexId);
      
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

/**
 * Attempts to fetch the total supply. If successful, returns the number.
 * If unsuccessful (e.g., ERC-1155 without totalSupply), it falls back to a default limit (100).
 * NOTE: This assumes sequential token IDs (1 to N). For non-sequential IDs, event scanning is required.
 */
export async function fetchTotalSupply(contractAddress: string): Promise<number> {
  if (!contractAddress) {
    throw new Error("Contract address must be provided.");
  }
  
  const contract = new Contract(contractAddress, erc721And1155Abi, provider);
  
  try {
    const supply = await contract.totalSupply();
    const total = Number(supply);
    console.log(`[NFT Fetcher] Total Supply (Sequential Guess) for ${contractAddress}: ${total}`);
    return total;
  } catch (e) {
    // If totalSupply fails, we assume it's not implemented or not an ERC-721 enumerable contract.
    // We fall back to a fixed limit for display purposes.
    console.warn(`Failed to call totalSupply for ${contractAddress}. Falling back to 100 tokens.`);
    return 100; 
  }
}