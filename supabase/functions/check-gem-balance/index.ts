import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { JsonRpcProvider, Contract } from "https://esm.sh/ethers@6.15.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// ElectroGems Contract Address
const ELECTRO_GEMS_ADDRESS = "0xcff0d88Ed5311bAB09178b6ec19A464100880984";
// Using official Electroneum RPC for better reliability
const RPC_URL = "https://rpc.electroneum.com";

const ABI = ["function balanceOf(address owner) view returns (uint256)"];

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

    console.log(`Checking balance for: ${walletAddress} on contract: ${ELECTRO_GEMS_ADDRESS}`);
    
    const provider = new JsonRpcProvider(RPC_URL);
    const contract = new Contract(ELECTRO_GEMS_ADDRESS, ABI, provider);
    
    const balanceBigInt = await contract.balanceOf(walletAddress);
    const balance = Number(balanceBigInt);

    console.log(`Balance found: ${balance}`);

    return new Response(JSON.stringify({ balance }), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (e) {
    console.error("Edge Function error checking balance:", e);
    return new Response(JSON.stringify({ error: "Failed to check balance", details: String(e) }), {
      status: 200, // Return 200 with error in body so client can handle it gracefully
      headers: corsHeaders,
    });
  }
});