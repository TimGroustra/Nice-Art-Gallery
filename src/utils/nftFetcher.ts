import { supabase } from '@/integrations/supabase/client';

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
    // Using a more reliable public gateway
    const normalized = url.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
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

  const { data, error } = await supabase.functions.invoke('fetch-nft-metadata', {
    body: { contractAddress, tokenId },
  });

  if (error) {
    console.error('Error invoking fetch-nft-metadata function:', error);
    throw new Error(error.message);
  }

  return data;
}

export async function fetchTotalSupply(contractAddress: string): Promise<number> {
  if (!contractAddress) {
    throw new Error("Contract address must be provided.");
  }
  
  const { data, error } = await supabase.functions.invoke('fetch-total-supply', {
    body: { contractAddress },
  });

  if (error) {
    console.error('Error invoking fetch-total-supply function:', error);
    throw new Error(error.message);
  }

  return data.totalSupply;
}