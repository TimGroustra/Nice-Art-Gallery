import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { JsonRpcProvider, Contract } from "https://esm.sh/ethers@6.15.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const RPC_URL = "https://rpc.ankr.com/electroneum";
const provider = new JsonRpcProvider(RPC_URL);

const ERC165_ABI = ["function supportsInterface(bytes4) view returns (bool)"];
const ERC721_ABI = ["function tokenURI(uint256) view returns (string)"];
const ERC1155_ABI = ["function uri(uint256) view returns (string)"];
const TS_ABI = ["function totalSupply() view returns (uint256)"];

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

async function fetchMetadata(contractAddress: string, tokenId: string) {
  try {
    const contract = new Contract(contractAddress, [...ERC165_ABI, ...ERC721_ABI, ...ERC1155_ABI], provider);
    const is1155 = await contract.supportsInterface("0xd9b67a26").catch(() => false);
    
    let uri = "";
    if (is1155) {
      uri = await contract.uri(tokenId);
      if (uri.includes("{id}")) {
        const hexId = BigInt(tokenId).toString(16).padStart(64, '0');
        uri = uri.replace("{id}", hexId);
      }
    } else {
      uri = await contract.tokenURI(tokenId);
    }

    if (!uri) return null;

    // Normalize IPFS
    const normalizedUri = uri.replace(/^ipfs:\/\/(ipfs\/)?/, "https://ipfs.io/ipfs/");
    
    const res = await fetch(normalizedUri);
    if (!res.ok) return { source: normalizedUri, title: "Unknown", description: "", image: normalizedUri };
    
    const meta = await res.json();
    return {
      title: meta.name || meta.title || "Unnamed",
      description: meta.description || "",
      image: meta.image || meta.image_url || meta.animation_url || "",
      source: normalizedUri,
      attributes: meta.attributes || []
    };
  } catch (e) {
    console.error(`[get-gallery-data] Error fetching ${contractAddress}:${tokenId}`, e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    console.log("[get-gallery-data] Starting bulk fetch...");

    // 1. Fetch all gallery configs
    const { data: configs, error: configError } = await supabase
      .from('gallery_config')
      .select('*');

    if (configError) throw configError;

    // 2. Fetch existing metadata from DB
    const { data: existingMetadata } = await supabase
      .from('gallery_nft_metadata')
      .select('*');

    const metadataMap = new Map();
    existingMetadata?.forEach(m => metadataMap.set(`${m.contract_address.toLowerCase()}:${m.token_id}`, m));

    // 3. Identify missing metadata
    const missing = configs.filter(c => {
      if (!c.contract_address) return false;
      const key = `${c.contract_address.toLowerCase()}:${c.default_token_id}`;
      return !metadataMap.has(key);
    });

    // 4. Fetch missing metadata in parallel (limited)
    if (missing.length > 0) {
      console.log(`[get-gallery-data] Fetching ${missing.length} missing metadata entries...`);
      const newMetadatas = await Promise.all(missing.map(async (c) => {
        const meta = await fetchMetadata(c.contract_address, String(c.default_token_id));
        if (meta) {
          return {
            contract_address: c.contract_address.toLowerCase(),
            token_id: c.default_token_id,
            ...meta
          };
        }
        return null;
      }));

      const toInsert = newMetadatas.filter(Boolean);
      if (toInsert.length > 0) {
        await supabase.from('gallery_nft_metadata').upsert(toInsert);
        toInsert.forEach(m => metadataMap.set(`${m.contract_address}:${m.token_id}`, m));
      }
    }

    // 5. Fetch total supplies for unique contracts
    const uniqueContracts = [...new Set(configs.map(c => c.contract_address).filter(Boolean))];
    const supplies: Record<string, number> = {};
    
    await Promise.all(uniqueContracts.map(async (addr) => {
      try {
        const contract = new Contract(addr, TS_ABI, provider);
        const supply = await contract.totalSupply();
        supplies[addr] = Number(supply);
      } catch {
        supplies[addr] = 10; // Fallback
      }
    }));

    return new Response(JSON.stringify({
      configs,
      metadata: Array.from(metadataMap.values()),
      supplies
    }), { status: 200, headers: corsHeaders });

  } catch (e) {
    console.error("[get-gallery-data] Fatal error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});