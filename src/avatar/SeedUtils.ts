// SeedUtils.ts
import { keccak256, toUtf8Bytes } from "ethers";
import { NFTRef } from "./AvatarState";

export function nftSeed(nft: NFTRef): number {
  // Generate a deterministic hash from the NFT reference
  const hash = keccak256(
    toUtf8Bytes(`${nft.chainId}:${nft.contract}:${nft.tokenId}`)
  );
  
  // Take the first 8 hex characters (4 bytes) and convert to integer
  return parseInt(hash.slice(2, 10), 16);
}

export function seededRandom(seed: number, offset = 0): number {
  // Simple pseudo-random number generator based on seed
  // Returns a number between 0 and 1
  return Math.abs(Math.sin(seed + offset)) % 1;
}