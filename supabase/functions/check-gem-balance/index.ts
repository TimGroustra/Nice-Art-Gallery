import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { JsonRpcProvider, Contract } from "https://esm.sh/ethers@6.15.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// ElectroGems Contract Address (ERC-721/1155 compatible for balanceOf)
const ELECTRO_GEMS_ADDRESS = "0xcff0d88Ed5311bAB09178b6ec19A464100880984";
const RPC_URL = "https://rpc.ankr.com/electroneum";

// Minimal ABI for balanceOf(address)
const ABI = ["function balanceOf(address owner) view returns (uint256)"];

const provider = new JsonRpcProvider(RPC_URL);
const contract = new Contract(ELECTRO_GEMS_ADDRESS, ABI, provider);

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
    
    // Call balanceOf
    const balanceBigInt = await contract.balanceOf(walletAddress);
    const balance = Number(balanceBigInt);

    return new Response(JSON.stringify({ balance }), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (e) {
    console.error("Edge Function error:", e);
    return new Response(JSON.stringify({ error: "Failed to check balance", details: String(e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});