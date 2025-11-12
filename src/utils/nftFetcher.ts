import { JsonRpcProvider, Contract } from "ethers";

// Ankr RPC endpoint for Electroneum
const RPC_URL = "https://rpc.ankr.com/electroneum";
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
    const name = await contract.name();
    console.log(`[NFT Fetcher] Fetched collection name for ${contractAddress}: ${name}`);
    return name;
  } catch (e) {
    console.error(`Failed to call name() for ${contractAddress}:`, e);
    return "Unknown Collection";
  }
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export async function fetchNftMetadata(contractAddress: string, tokenId: number): Promise<NftMetadata> {
  if (!contractAddress || tokenId === undefined) {
    throw new Error("Contract address and token ID must be provided.");
  }

  const contract = new Contract(contractAddress, erc721Abi, provider);
  
  let tokenUri: string;
  try {
    // Call tokenURI(tokenId)
    tokenUri = await contract.tokenURI(tokenId);
    console.log(`[NFT Fetcher] Token URI for ${tokenId}: ${tokenUri}`);
  } catch (e) {
    console.error(`Failed to call tokenURI for ${contractAddress}/${tokenId}:`, e);
    throw new Error("Failed to retrieve token URI from contract.");
  }

  const metadataUrl = normalizeUrl(tokenUri);
  
  if (!metadataUrl) {
    throw new Error("Token URI resolved to an empty URL.");
  }

  let res: Response;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      res = await fetch(metadataUrl);
      if (res.ok) {
        const json = await res.json();

        let imageUrl = json.image || json.image_url || json.imageURI || json.gif;
        imageUrl = normalizeUrl(imageUrl);
        
        console.log(`[NFT Fetcher] Final Image URL for ${tokenId} (Attempt ${attempt}): ${imageUrl}`);

        return {
          title: json.name || `Token #${tokenId}`,
          description: json.description || '(No description)',
          image: imageUrl || '',
          source: metadataUrl,
          attributes: json.attributes || [],
        };
      } else {
        throw new Error(`HTTP Status ${res.status}`);
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.warn(`[NFT Fetcher] Attempt ${attempt} failed for ${metadataUrl}: ${lastError.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      }
    }
  }

  console.error(`[NFT Fetcher] Failed to fetch metadata after ${MAX_RETRIES} attempts from ${metadataUrl}. Last error: ${lastError?.message}`);
  throw new Error(`Failed to fetch metadata after ${MAX_RETRIES} attempts.`);
}

export async function fetchTotalSupply(contractAddress: string): Promise<number> {
  if (!contractAddress) {
    throw new Error("Contract address must be provided.");
  }
  
  const contract = new Contract(contractAddress, erc721Abi, provider);
  
  try {
    const supply = await contract.totalSupply();
    const total = Number(supply);
    console.log(`[NFT Fetcher] Total Supply for ${contractAddress}: ${total}`);
    return total;
  } catch (e) {
    console.error(`Failed to call totalSupply for ${contractAddress}:`, e);
    // Fallback to a reasonable default if the call fails
    return 100; 
  }
}