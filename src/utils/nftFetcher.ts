import { JsonRpcProvider, Contract } from "ethers";

// Ankr RPC endpoint for Electroneum
const RPC_URL = "https://rpc.ankr.com/electroneum";
const provider = new JsonRpcProvider(RPC_URL);

const erc721Abi = [
  "function tokenURI(uint256 tokenId) view returns (string)"
];

// Utility: normalize ipfs:// to https gateway
export function normalizeUrl(url: string): string {
  if (!url) return url;
  url = url.trim();
  if (url.startsWith('ipfs://')) {
    // Using a common public gateway
    return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  return url;
}

export interface NftMetadata {
  title: string;
  description: string;
  image: string;
  source: string; // Original metadata URL (resolved tokenURI)
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
    throw new Error(`Failed to fetch metadata from ${metadataUrl}: Status ${res.status}`);
  }
  
  const json = await res.json();

  let imageUrl = json.image || json.image_url || json.imageURI || json.gif;
  imageUrl = normalizeUrl(imageUrl);

  return {
    title: json.name || `Token #${tokenId}`,
    description: json.description || '(No description)',
    image: imageUrl || '',
    source: metadataUrl,
  };
}