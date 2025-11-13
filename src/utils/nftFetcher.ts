import { JsonRpcProvider, Contract, ethers } from "ethers";

// Ankr RPC endpoint for Electroneum
const RPC_URL = "https://rpc.ankr.com/electroneum";
const provider = new JsonRpcProvider(RPC_URL);

const erc721And1155Abi = [
  "function name() view returns (string)",
  "function tokenURI(uint256 tokenId) view returns (string)", // ERC-721
  "function uri(uint256 _id) view returns (string)", // ERC-1155
  "function totalSupply() view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function tokenByIndex(uint256) view returns (uint256)"
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
      // This is a common convention for ERC-1155 metadata URIs.
      const hexId = tokenId.toString(16).padStart(64, '0');
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
 * Fetches all token IDs for a given ERC-721 contract address.
 * It first tries the enumerable extension (totalSupply + tokenByIndex).
 * If that fails, it falls back to scanning for Transfer events.
 */
export async function fetchTokenIds(contractAddress: string): Promise<number[]> {
  if (!contractAddress) {
    throw new Error("Contract address must be provided.");
  }
  const contract = new Contract(contractAddress, erc721And1155Abi, provider);

  // Strategy 1: Try enumerable ERC-721
  try {
    const supplyBigInt = await contract.totalSupply();
    const supply = Number(supplyBigInt);
    console.log(`[NFT Fetcher] Total supply for ${contractAddress}: ${supply}. Attempting enumeration...`);
    
    if (supply > 0 && supply < 10000) { // Cap at 10k for enumeration to avoid timeouts
      const tokenIds: number[] = [];
      const promises = [];
      for (let i = 0; i < supply; i++) {
        promises.push(contract.tokenByIndex(i));
      }
      const results = await Promise.all(promises);
      results.forEach(tokenIdBigInt => {
        tokenIds.push(Number(tokenIdBigInt));
      });
      
      if (tokenIds.length > 0) {
        console.log(`[NFT Fetcher] Successfully enumerated ${tokenIds.length} tokens for ${contractAddress}.`);
        return tokenIds.sort((a, b) => a - b);
      }
    }
    throw new Error("Not enumerable or supply is zero/too large.");
  } catch (e) {
    console.log(`[NFT Fetcher] Contract ${contractAddress} not enumerable. Falling back to event scan. Reason: ${(e as Error).message}`);
    
    // Strategy 2: Scan Transfer events
    const fromBlock = 0;
    const latestBlock = await provider.getBlockNumber();
    const chunkSize = 20000;
    const tokenIds = new Set<number>();

    for (let startBlock = fromBlock; startBlock <= latestBlock; startBlock += chunkSize) {
      const endBlock = Math.min(latestBlock, startBlock + chunkSize - 1);
      console.log(`[NFT Fetcher] Scanning blocks ${startBlock} to ${endBlock} for ${contractAddress}`);
      try {
        const logs = await provider.getLogs({
          address: contractAddress,
          fromBlock: startBlock,
          toBlock: endBlock,
          topics: [ethers.id("Transfer(address,address,uint256)")]
        });

        for (const log of logs) {
          if (log.topics.length === 4) { // Standard ERC-721 Transfer event
            const tokenId = Number(ethers.toBigInt(log.topics[3]));
            tokenIds.add(tokenId);
          }
        }
      } catch (logError) {
        console.error(`[NFT Fetcher] Error scanning logs for ${contractAddress} in blocks ${startBlock}-${endBlock}:`, logError);
      }
    }
    
    const finalTokenIds = Array.from(tokenIds);
    if (finalTokenIds.length > 0) {
      console.log(`[NFT Fetcher] Found ${finalTokenIds.length} unique tokens via event scan for ${contractAddress}.`);
      return finalTokenIds.sort((a, b) => a - b);
    }

    // Final fallback: if no events found, try using totalSupply to generate sequential IDs
    console.warn(`[NFT Fetcher] No tokens found via event scan for ${contractAddress}.`);
    try {
        const supplyBigInt = await contract.totalSupply();
        const supply = Number(supplyBigInt);
        if (supply > 0 && supply < 10000) {
            console.log(`[NFT Fetcher] Final fallback: generating ${supply} sequential token IDs for ${contractAddress}.`);
            return Array.from({ length: supply }, (_, i) => i + 1);
        }
    } catch (supplyError) {
        console.error(`[NFT Fetcher] Final fallback to totalSupply failed for ${contractAddress}.`, supplyError);
    }

    console.error(`[NFT Fetcher] Could not determine token list for ${contractAddress}. Returning empty array.`);
    return [];
  }
}