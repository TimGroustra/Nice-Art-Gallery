import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { JsonRpcProvider, Contract } from "https://esm.sh/ethers@6.15.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const ELECTRO_GEMS_ADDRESS = "0xcff0d88Ed5311bAB09178b6ec19A464100880984";
const RPC_URL = "https://rpc.ankr.com/electroneum";

// Minimal ABI for ERC721 Enumerable
const ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)"
];

const provider = new JsonRpcProvider(RPC_URL);
const contract = new Contract(ELECTRO_GEMS_ADDRESS, ABI, provider);

// Initialize Supabase client for database access using the service role key
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, 
  {
    auth: {
      persistSession: false
    }
  }
);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const { walletAddress } = await req.json();
    
    if (!walletAddress) {
      return new Response(JSON.stringify({ error: "Missing walletAddress" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    
    // 1. Get total balance
    const balanceBigInt = await contract.balanceOf(walletAddress);
    const balance = Number(balanceBigInt);

    if (balance === 0) {
        return new Response(JSON.stringify({ ownedTokens: [], availableTokens: [] }), {
            status: 200,
            headers: corsHeaders,
        });
    }

    // 2. Fetch all owned token IDs
    const ownedTokens: string[] = [];
    for (let i = 0; i < balance; i++) {
        try {
            const tokenIdBigInt = await contract.tokenOfOwnerByIndex(walletAddress, i);
            ownedTokens.push(tokenIdBigInt.toString());
        } catch (e) {
            console.error(`Failed to fetch token at index ${i}:`, e);
            // If tokenOfOwnerByIndex fails (e.g., not enumerable), we stop.
            break; 
        }
    }

    // 3. Fetch actively used locking tokens from Supabase
    const now = new Date().toISOString();
    const { data: locks, error: dbError } = await supabase
        .from('panel_locks')
        .select('locking_gem_token_id')
        .gt('locked_until', now) // Only consider active locks
        .not('locking_gem_token_id', 'is', null); 

    if (dbError) {
        console.error("Supabase DB error:", dbError);
        // If DB fails, we return all owned tokens as available (fallback)
        return new Response(JSON.stringify({ ownedTokens, availableTokens: ownedTokens, warning: "DB lock check failed" }), {
            status: 200,
            headers: corsHeaders,
        });
    }

    const usedTokens = new Set(locks.map(lock => lock.locking_gem_token_id).filter((id): id is string => !!id));
    
    // 4. Filter owned tokens to find available ones
    const availableTokens = ownedTokens.filter(tokenId => !usedTokens.has(tokenId));

    return new Response(JSON.stringify({ ownedTokens, availableTokens }), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (e) {
    console.error("Edge Function error:", e);
    return new Response(JSON.stringify({ error: "Failed to retrieve owned gems", details: String(e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});