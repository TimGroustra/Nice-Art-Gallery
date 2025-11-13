import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ethers } from "https://esm.sh/ethers@6.15.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Utility: normalize ipfs:// to https gateway
function normalizeUrl(url: string): string {
  if (!url) return url;
  url = url.trim();
  
  if (url.startsWith('ipfs://')) {
    const path = url.replace(/^ipfs:\/\/(ipfs\/)?/, '');
    // Using a reliable public gateway
    const normalized = `https://ipfs.io/ipfs/${path}`;
    console.log(`[Edge] Normalized IPFS URL: ${normalized}`);
    return normalized;
  }
  return url;
}

const erc721And1155Abi = [
  "function tokenURI(uint256 tokenId) view returns (string)", // ERC-721
  "function uri(uint256 _id) view returns (string)", // ERC-1155
];

// Hardcoded Electropunks address for specific handling
const ELECTROPUNKS_ADDRESS = "0x0dD500d9eDEF4d0c4B0c50fa0C4faccB711FDA43";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contractAddress, tokenId } = await req.json();

    if (!contractAddress || tokenId === undefined) {
      return new Response(JSON.stringify({ error: "Missing contractAddress or tokenId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Setup Supabase and Ethers
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // Use service role key for secure database write
      {
        auth: {
          persistSession: false,
        },
      }
    );
    
    // Ankr RPC endpoint for Electroneum
    const RPC_URL = "https://rpc.ankr.com/electroneum";
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(contractAddress, erc721And1155Abi, provider);

    let tokenUri: string | undefined;
    
    // Try ERC-721 standard (tokenURI)
    try {
      tokenUri = await contract.tokenURI(tokenId);
      console.log(`[Edge] Attempted ERC-721 tokenURI. Result: ${tokenUri}`);
    } catch (e) {
      console.warn(`[Edge] ERC-721 tokenURI failed for ${contractAddress}/${tokenId}. Trying ERC-1155 fallback.`);
      // If ERC-721 fails, try ERC-1155 standard (uri)
      try {
        let uriTemplate = await contract.uri(tokenId);
        const hexId = tokenId.toString(16).padStart(64, '0');
        tokenUri = uriTemplate.replace('{id}', hexId);
        console.log(`[Edge] ERC-721 failed, used ERC-1155 fallback. Result: ${tokenUri}`);
      } catch (e2) {
        console.error(`[Edge] Failed to retrieve token URI/URI from contract for ${contractAddress}/${tokenId}.`, e2);
        throw new Error("Failed to retrieve token URI from contract.");
      }
    }

    if (!tokenUri) {
      throw new Error("Token URI resolved to an empty URL.");
    }
    
    // --- Electropunks Specific Fix ---
    // Check if the contract address matches (case-insensitive)
    if (contractAddress.toLowerCase() === ELECTROPUNKS_ADDRESS.toLowerCase()) {
        // If the URI doesn't end with a file extension (like .json, .txt, etc.), assume it's a base path.
        // We check for a dot followed by 2-4 characters at the end of the string.
        if (!/\.[a-z]{2,4}$/i.test(tokenUri)) {
            tokenUri = `${tokenUri.replace(/\/$/, '')}/${tokenId}.json`;
            console.log(`[Edge] Electropunks base URI fix applied. New URI: ${tokenUri}`);
        }
    }
    // --- End Fix ---

    let json: any;
    let metadataUrl = tokenUri;
    
    // 2. Fetch Metadata JSON
    if (tokenUri.startsWith('data:application/json;base64,')) {
      const base64String = tokenUri.split(',')[1];
      const decodedString = atob(base64String);
      json = JSON.parse(decodedString);
      metadataUrl = 'In-line Base64 Data URI';
    } else {
      metadataUrl = normalizeUrl(tokenUri);
      console.log(`[Edge] Final fetch URL: ${metadataUrl}`);
      
      const res = await fetch(metadataUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch metadata from ${metadataUrl}: Status ${res.status}`);
      }
      
      json = await res.json();
    }

    let imageUrl = json.image || json.image_url || json.imageURI || json.gif;
    imageUrl = normalizeUrl(imageUrl);
    
    const metadata = {
      title: json.name || `Token #${tokenId}`,
      description: json.description || '(No description)',
      image: imageUrl || '',
      source: metadataUrl,
      attributes: json.attributes || [],
    };

    // 3. Cache result in gallery_nft_metadata table
    const { error: upsertError } = await supabase
      .from('gallery_nft_metadata')
      .upsert({
        contract_address: contractAddress,
        token_id: tokenId,
        title: metadata.title,
        description: metadata.description,
        image: metadata.image,
        source: metadata.source,
        attributes: metadata.attributes,
      }, { onConflict: 'contract_address, token_id' });

    if (upsertError) {
      console.error("[Edge] Error caching metadata:", upsertError);
      // Continue execution, as the primary goal (fetching) succeeded
    }

    // 4. Return metadata
    return new Response(JSON.stringify(metadata), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("[Edge] Function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});