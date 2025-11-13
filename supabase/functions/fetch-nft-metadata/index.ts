import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { ethers } from "https://esm.sh/ethers@6.7.0";

const RPC_URL = "https://rpc.ankr.com/electroneum";
const provider = new ethers.JsonRpcProvider(RPC_URL);

const erc721And1155Abi = [
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function uri(uint256 _id) view returns (string)",
];

// Utility: normalize ipfs:// to https gateway
function normalizeUrl(url: string): string {
  if (!url) return url;
  url = url.trim();
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  return url;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { contractAddress, tokenId } = await req.json();
    console.log(`[Function] Fetching metadata for ${contractAddress}/${tokenId}`);
    
    if (!contractAddress || tokenId === undefined) {
      throw new Error("Contract address and token ID must be provided.");
    }

    const contract = new ethers.Contract(contractAddress, erc721And1155Abi, provider);
    
    let tokenUri: string | undefined;
    
    try {
      console.log(`[Function] Attempting tokenURI (ERC-721) for ${tokenId}`);
      tokenUri = await contract.tokenURI(tokenId);
      console.log(`[Function] tokenURI result: ${tokenUri}`);
    } catch (e) {
      console.warn(`[Function] tokenURI failed. Trying uri (ERC-1155). Error: ${e instanceof Error ? e.message : String(e)}`);
      try {
        let uriTemplate = await contract.uri(tokenId);
        const hexId = tokenId.toString(16).padStart(64, '0');
        tokenUri = uriTemplate.replace('{id}', hexId);
        console.log(`[Function] uri result: ${tokenUri}`);
      } catch (e2) {
        console.error(`[Function] Failed to retrieve token URI/URI from contract for ${contractAddress}/${tokenId}. Contract interaction failed.`, e2);
        // Re-throw a specific error related to contract interaction failure
        throw new Error("Contract interaction failed: Could not retrieve token URI.");
      }
    }

    const metadataUrl = normalizeUrl(tokenUri!);
    console.log(`[Function] Normalized metadata URL: ${metadataUrl}`);
    
    if (!metadataUrl) {
      throw new Error("Token URI resolved to an empty URL.");
    }

    // --- Fetch Metadata from URL ---
    let res;
    try {
        res = await fetch(metadataUrl);
    } catch (fetchError) {
        console.error(`[Function] Failed to fetch metadata from URL ${metadataUrl}:`, fetchError);
        throw new Error(`Network error fetching metadata from URL.`);
    }
    
    if (!res.ok) {
      throw new Error(`Failed to fetch metadata from ${metadataUrl}: Status ${res.status}`);
    }
    
    const json = await res.json();

    let imageUrl = json.image || json.image_url || json.imageURI || json.gif;
    imageUrl = normalizeUrl(imageUrl);

    const metadata = {
      title: json.name || `Token #${tokenId}`,
      description: json.description || '(No description)',
      image: imageUrl || '',
      source: metadataUrl,
      attributes: json.attributes || [],
    };

    return new Response(JSON.stringify(metadata), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    // Catch specific errors and return a 500 response with the error message
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred in the Edge Function.";
    console.error("[Function] Global error caught:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})