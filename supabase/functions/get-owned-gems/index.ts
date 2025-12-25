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

const ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)"
];

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, 
  { auth: { persistSession: false } }
);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  
  try {
    const { walletAddress } = await req.json();
    if (!walletAddress) return new Response(JSON.stringify({ error: "Missing walletAddress" }), { status: 400, headers: corsHeaders });
    
    const provider = new JsonRpcProvider(RPC_URL);
    const contract = new Contract(ELECTRO_GEMS_ADDRESS, ABI, provider);

    const balanceBigInt = await contract.balanceOf(walletAddress);
    const balance = Number(balanceBigInt);

    if (balance === 0) {
        return new Response(JSON.stringify({ ownedTokens: [], availableTokens: [] }), { status: 200, headers: corsHeaders });
    }

    const ownedTokens: string[] = [];
    // Enumerate up to 20 tokens
    const limit = Math.min(balance, 20); 
    for (let i = 0; i < limit; i++) {
        try {
            const tokenIdBigInt = await contract.tokenOfOwnerByIndex(walletAddress, i);
            ownedTokens.push(tokenIdBigInt.toString());
        } catch (e) {
            console.warn(`[get-owned-gems] Enumeration break at ${i}`);
            break; 
        }
    }

    const now = new Date().toISOString();
    const { data: locks } = await supabase
        .from('panel_locks')
        .select('locking_gem_token_id')
        .gt('locked_until', now);

    const usedTokens = new Set((locks || []).map(l => l.locking_gem_token_id).filter(Boolean));
    const availableTokens = ownedTokens.filter(id => !usedTokens.has(id));

    return new Response(JSON.stringify({ ownedTokens, availableTokens }), { status: 200, headers: corsHeaders });

  } catch (e) {
    console.error("[get-owned-gems] Error:", e);
    return new Response(JSON.stringify({ error: "Failed to retrieve gems", details: String(e) }), { status: 200, headers: corsHeaders });
  }
});