// NFTResolver.ts
import { JsonRpcProvider, Contract, ethers } from "ethers";
import { NFTRef } from "./AvatarState";
import { nftSeed } from "./SeedUtils";
import { safeCall } from "@/utils/ethersSafe";
import { normalizeUrl, hex64 } from "@/utils/urlUtils";

// Ankr RPC endpoint for Electroneum (same as nftFetcher)
const RPC_URL = "https://rpc.ankr.com/electroneum";
const provider = new JsonRpcProvider(RPC_URL);

// ABIs for safe calls
const ERC165 = ["function supportsInterface(bytes4) view returns (bool)"];
const ERC721 = ["function tokenURI(uint256) view returns (string)"];
const ERC1155 = ["function uri(uint256) view returns (string)"];

export interface ResolvedNFT {
  imageUrl: string;
  seed: number;
}

/**
 * Fetches the image URL for an NFT by resolving its token URI.
 * This function avoids parsing complex metadata traits, focusing only on the media link.
 */
async function fetchNFTImage(nft: NFTRef): Promise<string> {
  const { contract: contractAddress, tokenId } = nft;
  
  const contract = new Contract(contractAddress, [...ERC165, ...ERC721, ...ERC1155], provider);
  
  // 1. Check for ERC-165 support (best effort)
  const supportRes = await safeCall(contract, "supportsInterface", ["0xd9b67a26"]);
  const is1155 = supportRes.ok && !!supportRes.value;

  // 2. Retrieve URI
  let uriRes;
  if (is1155) {
    uriRes = await safeCall(contract, "uri", [tokenId]);
  } else {
    uriRes = await safeCall(contract, "tokenURI", [tokenId]);
  }

  if (!uriRes.ok || !uriRes.value) {
    console.warn(`NFTResolver: Failed to get URI for ${contractAddress}/${tokenId}`);
    return "/placeholder.svg"; // Fallback image
  }

  let rawUri = uriRes.value as string;
  if (is1155 && rawUri.includes("{id}")) {
    rawUri = rawUri.replace("{id}", hex64(tokenId));
  }

  const metadataUrl = normalizeUrl(rawUri);
  
  // 3. Fetch or parse metadata to find the image/animation URL
  try {
    // Handle data:application/json;base64,...
    if (metadataUrl.startsWith("data:application/json;base64,")) {
      const b64 = metadataUrl.split(",")[1];
      const jsonStr = atob(b64);
      const meta = JSON.parse(jsonStr);
      return normalizeUrl(meta.image || meta.image_url || meta.animation_url || metadataUrl);
    } 
    
    // Try to fetch JSON metadata
    const res = await fetch(metadataUrl);
    if (!res.ok) {
      // If fetch fails or returns non-200, assume URI is direct media link
      return metadataUrl;
    } 
    
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json") || metadataUrl.endsWith(".json")) {
      const meta = await res.json();
      // Prioritize image, then animation_url, then fallback to metadataUrl
      return normalizeUrl(meta.image || meta.image_url || meta.animation_url || metadataUrl);
    } else {
      // Fallback: treat as direct media
      return metadataUrl;
    }

  } catch (e) {
    console.error(`[NFT Resolver] Error processing metadata from ${metadataUrl}.`, e);
    // Final fallback: assume the URI is a direct media link
    return metadataUrl;
  }
}


export async function resolveNFT(nft: NFTRef): Promise<ResolvedNFT> {
  const imageUrl = await fetchNFTImage(nft);
  return {
    imageUrl,
    seed: nftSeed(nft)
  };
}