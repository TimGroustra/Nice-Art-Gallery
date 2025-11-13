import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { ethers } from "https://esm.sh/ethers@6.7.0";

const RPC_URL = "https://rpc.ankr.com/electroneum";
const provider = new ethers.JsonRpcProvider(RPC_URL);

const abi = ["function totalSupply() view returns (uint256)"];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { contractAddress } = await req.json();
    if (!contractAddress) {
      throw new Error("Contract address must be provided.");
    }

    const contract = new ethers.Contract(contractAddress, abi, provider);
    
    let supply;
    try {
      supply = await contract.totalSupply();
    } catch (e) {
      console.error(`Failed to call totalSupply for ${contractAddress}:`, e);
      // Fallback for contracts that don't have totalSupply (like some ERC-1155)
      supply = 100;
    }
    
    const total = Number(supply);

    return new Response(JSON.stringify({ totalSupply: total }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})