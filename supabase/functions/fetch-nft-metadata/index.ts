import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { ethers } from "https://esm.sh/ethers@6.7.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.4'

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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: {
        persistSession: false,
      },
    }
  );

  try {
    const { contractAddress, tokenId } = await req.json();
    console.log(`[Function] Attempting to fetch metadata for ${contractAddress}/${tokenId}`);
    
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
        console.error(`[Function] Failed to retrieve token URI/URI from contract for ${contractAddress}/${tokenId}.`, e2);
        throw new Error("Failed to retrieve token URI from contract.");
      }
    }

    const metadataUrl = normalizeUrl(tokenUri!);
    
    if (!metadataUrl) {
      throw new Error("Token URI resolved to an empty URL.");
    }
    
    console.log(`[Function] Normalized metadata URL: ${metadataUrl}`);

    const res = await fetch(metadataUrl);
    
    if (!res.ok) {
      console.error(`[Function] Failed to fetch metadata from ${metadataUrl}: Status ${res.status} ${res.statusText}`);
      throw new Error(`Failed to fetch metadata from external source: Status ${res.status}`);
    }
    
    const json = await res.json();

    let externalImageUrl = json.image || json.image_url || json.imageURI || json.gif;
    externalImageUrl = normalizeUrl(externalImageUrl);
    
    if (!externalImageUrl) {
        console.warn(`[Function] No image URL found in metadata for ${tokenId}.`);
    }

    let finalImageUrl = externalImageUrl;
    
    // --- Image Caching Logic ---
    if (externalImageUrl) {
        const imageRes = await fetch(externalImageUrl);
        if (imageRes.ok) {
            const imageBlob = await imageRes.blob();
            
            // Determine file extension based on content type
            let fileExtension = 'png'; // Default fallback
            if (imageBlob.type) {
                const parts = imageBlob.type.split('/');
                if (parts.length === 2) {
                    fileExtension = parts[1].toLowerCase().replace('jpeg', 'jpg');
                }
            }
            
            // Use contract address as folder name for generalization
            const storagePath = `${contractAddress}/${tokenId}.${fileExtension}`;
            
            console.log(`[Function] Uploading image to storage path: ${storagePath}`);

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('nft_images') // Using the confirmed 'nft_images' bucket
                .upload(storagePath, imageBlob, {
                    cacheControl: '3600',
                    upsert: true,
                    contentType: imageBlob.type,
                });

            if (uploadError) {
                console.error(`[Function] Failed to upload image to storage:`, uploadError);
                // Fallback to external URL if upload fails
            } else {
                // Get the public URL for the uploaded image
                const { data: publicUrlData } = supabase.storage
                    .from('nft_images')
                    .getPublicUrl(storagePath);
                
                if (publicUrlData?.publicUrl) {
                    finalImageUrl = publicUrlData.publicUrl;
                    console.log(`[Function] Image successfully cached at: ${finalImageUrl}`);
                }
            }
        } else {
            console.warn(`[Function] Failed to fetch external image for caching: Status ${imageRes.status}`);
        }
    }
    // --- End Image Caching Logic ---

    const metadata = {
      title: json.name || `Token #${tokenId}`,
      description: json.description || '(No description)',
      image: finalImageUrl, // Use the local Supabase URL if successful, otherwise external URL
      source: metadataUrl,
      attributes: json.attributes || [],
    };
    
    console.log(`[Function] Successfully processed metadata for ${tokenId}. Title: ${metadata.title}`);

    return new Response(JSON.stringify(metadata), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    // Ensure error response includes CORS headers and logs the error
    console.error("[Function] Edge Function execution error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})