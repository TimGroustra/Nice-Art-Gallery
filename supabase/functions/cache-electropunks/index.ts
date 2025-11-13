import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.4'

const ELECTROPUNKS_ADDRESS = "0x0dD500d9eDEF4d0c4B0c50fa0C4faccB711FDA43";
const MAX_TOKENS_TO_CACHE = 1000; // Safety limit

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Initialize Supabase client with Service Role Key to invoke other functions
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
    // 1. Get Total Supply (using existing function)
    const { data: supplyData, error: supplyError } = await supabase.functions.invoke('fetch-total-supply', {
      body: { contractAddress: ELECTROPUNKS_ADDRESS },
    });

    if (supplyError) {
      throw new Error(`Failed to fetch total supply: ${supplyError.message}`);
    }

    const totalSupply = Math.min(supplyData.totalSupply, MAX_TOKENS_TO_CACHE);
    console.log(`[Cache] Starting cache process for ${totalSupply} ElectroPunks tokens.`);

    const results = [];
    
    // 2. Iterate and invoke fetch-nft-metadata for each token
    for (let tokenId = 1; tokenId <= totalSupply; tokenId++) {
      console.log(`[Cache] Invoking fetch-nft-metadata for token ${tokenId}/${totalSupply}...`);
      
      // Note: We use the Service Role Key client, so we don't need to pass auth headers.
      const { error: fetchError } = await supabase.functions.invoke('fetch-nft-metadata', {
        body: { contractAddress: ELECTROPUNKS_ADDRESS, tokenId },
      });

      if (fetchError) {
        console.error(`[Cache] Failed to cache token ${tokenId}: ${fetchError.message}`);
        results.push({ tokenId, status: 'failed', error: fetchError.message });
      } else {
        results.push({ tokenId, status: 'success' });
      }
      
      // Introduce a small delay to prevent overwhelming the RPC provider or Supabase functions
      await new Promise(r => setTimeout(r, 500)); 
    }

    console.log(`[Cache] Caching process finished.`);

    return new Response(JSON.stringify({ 
      message: `Successfully initiated caching for ${totalSupply} tokens. Check logs for details.`,
      summary: results.filter(r => r.status === 'success').length + ' successful, ' + results.filter(r => r.status === 'failed').length + ' failed.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("[Function] Edge Function execution error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})