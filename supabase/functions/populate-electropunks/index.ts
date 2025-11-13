import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { ethers } from "https://esm.sh/ethers@6.7.0";

// --- CORS Headers ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- Constants ---
const ELECTROPUNKS_ADDRESS = "0x0dD500d9eDEF4d0c4B0c50fa0C4faccB711FDA43";
const RPC_URL = "https://rpc.ankr.com/electroneum";
const provider = new ethers.JsonRpcProvider(RPC_URL);

// --- ABIs ---
const totalSupplyAbi = ["function totalSupply() view returns (uint256)"];
const erc721Abi = ["function tokenURI(uint256 tokenId) view returns (string)"];

// --- URL Normalization Helper ---
function normalizeUrl(url: string): string {
  if (!url) return url;
  url = url.trim();
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Use service role key for admin-level access
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Get total supply
    const supplyContract = new ethers.Contract(ELECTROPUNKS_ADDRESS, totalSupplyAbi, provider);
    const totalSupply = Number(await supplyContract.totalSupply());
    console.log(`[Function] ElectroPunks total supply: ${totalSupply}`);

    // 2. Get already cached tokens from Supabase
    const { data: existingTokens, error: fetchError } = await supabaseAdmin
      .from('gallery_nft_metadata')
      .select('token_id')
      .eq('contract_address', ELECTROPUNKS_ADDRESS);

    if (fetchError) {
      throw new Error(`Failed to fetch existing ElectroPunks: ${fetchError.message}`);
    }

    const existingTokenIds = new Set(existingTokens.map(t => t.token_id));
    console.log(`[Function] Found ${existingTokenIds.size} existing ElectroPunks in cache.`);

    // 3. Determine which tokens need to be processed
    const tokensToProcess = [];
    for (let i = 1; i <= totalSupply; i++) {
      if (!existingTokenIds.has(i)) {
        tokensToProcess.push(i);
      }
    }

    if (tokensToProcess.length === 0) {
      return new Response(JSON.stringify({ message: 'All ElectroPunks NFTs are up to date.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
    
    console.log(`[Function] Processing ${tokensToProcess.length} new ElectroPunks NFTs.`);

    // 4. Process new tokens
    const metadataContract = new ethers.Contract(ELECTROPUNKS_ADDRESS, erc721Abi, provider);
    const promises = tokensToProcess.map(async (tokenId) => {
      try {
        const tokenUri = await metadataContract.tokenURI(tokenId);
        const metadataUrl = normalizeUrl(tokenUri);
        
        if (!metadataUrl) return null;

        const res = await fetch(metadataUrl);
        if (!res.ok) return null;

        const json = await res.json();
        let imageUrl = normalizeUrl(json.image || json.image_url);

        // Only include if there is a valid, secure image URL
        if (imageUrl && imageUrl.startsWith('https://')) {
          return {
            contract_address: ELECTROPUNKS_ADDRESS,
            token_id: tokenId,
            title: json.name || `Token #${tokenId}`,
            description: json.description || '(No description)',
            image: imageUrl,
            source: metadataUrl,
            attributes: json.attributes || [],
          };
        }
      } catch (error) {
        console.error(`[Function] Failed to fetch metadata for ElectroPunk #${tokenId}:`, error.message);
      }
      return null;
    });

    const results = await Promise.all(promises);
    const validMetadata = results.filter(r => r !== null);

    let message = 'No new valid ElectroPunks found to add.';
    if (validMetadata.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('gallery_nft_metadata')
        .upsert(validMetadata, { onConflict: 'contract_address, token_id' });

      if (insertError) {
        throw new Error(`Error inserting ElectroPunks batch: ${insertError.message}`);
      }
      
      message = `Successfully added ${validMetadata.length} new ElectroPunks to the gallery.`;
      console.log(`[Function] ${message}`);
    }

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('[Function] Global error caught:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})