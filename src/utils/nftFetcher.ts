import { JsonRpcProvider, Contract } from "ethers";

// Public RPC endpoint for Ethereum Mainnet
const RPC_URL = "https://cloudflare-eth.com";
const provider = new JsonRpcProvider(RPC_URL);

const erc721Abi = [
  "function name() view returns (string)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function totalSupply() view returns (uint256)"
];

// Define NftSource interface
export interface NftSource {
  contractAddress: string;
  tokenId: number;
}

// Utility function for retrying async operations
async function retry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) {
        throw error; // Throw if last attempt failed
      }
      console.warn(`Attempt ${i + 1} failed. Retrying in ${delay}ms...`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  // This line should technically be unreachable
  throw new Error("Retry mechanism failed unexpectedly.");
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
  source: string; // Original metadata URL (resolved tokenURI)
  attributes?: NftAttribute[];
}

export async function fetchCollectionName(contractAddress: string): Promise<string> {
  if (!contractAddress) {
    throw new Error("Contract address must be provided.");
  }
  const contract = new Contract(contractAddress, erc721Abi, provider);
  try {
    const name = await retry(() => contract.name(), 3, 500);
    console.log(`[NFT Fetcher] Fetched collection name for ${contractAddress}: ${name}`);
    return name;
  } catch (e) {
    console.error(`Failed to call name() for ${contractAddress}:`, e);
    return "Unknown Collection";
  }
}

export async function fetchNftMetadata(contractAddress: string, tokenId: number): Promise<NftMetadata> {
  if (!contractAddress || tokenId === undefined) {
    throw new Error("Contract address and token ID must be provided.");
  }

  const contract = new Contract(contractAddress, erc721Abi, provider);
  
  let tokenUri: string;
  try {
    // 1. Retry fetching tokenURI
    tokenUri = await retry(() => contract.tokenURI(tokenId), 3, 500);
    console.log(`[NFT Fetcher] Token URI for ${tokenId}: ${tokenUri}`);
  } catch (e) {
    console.error(`Failed to retrieve token URI for ${contractAddress}/${tokenId}:`, e);
    throw new Error("Failed to retrieve token URI from contract.");
  }

  const metadataUrl = normalizeUrl(tokenUri);
  
  if (!metadataUrl) {
    throw new Error("Token URI resolved to an empty URL.");
  }

  let json: any;
  try {
    // 2. Retry fetching metadata JSON
    const res = await retry(async () => {
      const response = await fetch(metadataUrl);
      if (!response.ok) {
        // Throwing here ensures retry catches HTTP errors too
        throw new Error(`HTTP error status: ${response.status}`);
      }
      return response;
    }, 3, 1000);
    
    json = await res.json();
  } catch (e) {
    console.error(`[NFT Fetcher] Failed to fetch metadata from ${metadataUrl}:`, e);
    throw new Error(`Failed to fetch metadata from ${metadataUrl}.`);
  }

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
  
  const contract = new Contract(contractAddress, erc721Abi, provider);
  
  try {
    const supply = await retry(() => contract.totalSupply(), 3, 500);
    const total = Number(supply);
    console.log(`[NFT Fetcher] Total Supply for ${contractAddress}: ${total}`);
    return total;
  } catch (e) {
    console.error(`Failed to call totalSupply for ${contractAddress}:`, e);
    // Fallback to a reasonable default if the call fails
    return 100; 
  }
}