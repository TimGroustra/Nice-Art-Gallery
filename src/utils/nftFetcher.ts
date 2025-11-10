import { JsonRpcProvider, Contract } from "ethers";

// Ankr RPC endpoint for Electroneum
const RPC_URL = "https://rpc.ankr.com/electroneum";
const provider = new JsonRpcProvider(RPC_URL);

const erc721Abi = [
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function contractURI() view returns (string)"
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

export interface NftMetadata {
  title: string;
  description: string;
  image: string;
  source: string; // Original metadata URL (resolved tokenURI)
}

export interface CollectionMetadata {
  name: string;
  description: string;
}

export async function fetchCollectionMetadata(contractAddress: string): Promise<CollectionMetadata> {
  if (!contractAddress) {
    throw new Error("Contract address must be provided.");
  }
  const contract = new Contract(contractAddress, erc721Abi, provider);
  
  let collectionName = `Collection: ${contractAddress.slice(0, 6)}...`;
  let collectionDescription = "No description available for this collection.";

  try {
    collectionName = await contract.name();
  } catch (e) {
    console.warn(`Failed to fetch collection name for ${contractAddress}`, e);
  }

  try {
    const contractUri = await contract.contractURI();
    const metadataUrl = normalizeUrl(contractUri);
    if (metadataUrl) {
      const res = await fetch(metadataUrl);
      if (res.ok) {
        const json = await res.json();
        collectionDescription = json.description || collectionDescription;
        collectionName = json.name || collectionName;
      } else {
        console.warn(`Failed to fetch contract URI metadata from ${metadataUrl}: Status ${res.status}`);
      }
    }
  } catch (e) {
    // It's common for contracts to not implement contractURI, so this is a warning not an error.
    console.warn(`Could not retrieve or parse contractURI for ${contractAddress}:`, e);
  }

  return {
    name: collectionName,
    description: collectionDescription,
  };
}

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
  };
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