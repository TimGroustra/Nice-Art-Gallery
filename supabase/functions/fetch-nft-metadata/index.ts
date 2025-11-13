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
    if (!contractAddress || tokenId === undefined) {
      throw new Error("Contract address and token ID must be provided.");
    }

    const contract = new ethers.Contract(contractAddress, erc721And1155Abi, provider);
    
    let tokenUri: string | undefined;
    
    try {
      // Try ERC-721 standard
      tokenUri = await contract.tokenURI(tokenId);
    } catch (e) {
      try {
        // Try ERC-1155 standard
        let uriTemplate = await contract.uri(tokenId);
        const hexId = tokenId.toString(16).padStart(64, '0');
        tokenUri = uriTemplate.replace('{id}', hexId);
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
      // Log the failure status and URL for debugging
      console.error(`Failed to fetch metadata from ${metadataUrl}: Status ${res.status}`);
      throw new Error(`Failed to fetch metadata from external source: Status ${res.status}`);
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
    // Ensure error response includes CORS headers and logs the error
    console.error("Edge Function execution error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})