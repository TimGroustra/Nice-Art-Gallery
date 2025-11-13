import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { JsonRpcProvider, Contract } from "https://esm.sh/ethers@6.15.0";

// --- Configuration (Must be duplicated here as Edge Functions cannot import from src/) ---

// Ankr RPC endpoint for Electroneum
const RPC_URL = "https://rpc.ankr.com/electroneum";
const provider = new JsonRpcProvider(RPC_URL);

const erc721And1155Abi = [
  "function name() view returns (string)",
  "function tokenURI(uint256 tokenId) view returns (string)", // ERC-721
  "function uri(uint256 _id) view returns (string)", // ERC-1155
  "function totalSupply() view returns (uint256)"
];

const ALL_CONTRACT_ADDRESSES = [
  "0x9d4E0280B3732fCEAeEeCD870613aB30bCDA7A31", // Planet ETN
  "0x56B33D971AfC1d2CEA35f20599E8EF5094Ffd399", // MEGA OGs
  "0x8C9a0D62f194d7595E7e68373b0678E109aA3CD3", // Electro Bulls
  "0x939548A645AD1C3164d82A168735DB1558c9EFDD", // Electroneum x Rarible
  "0xAb7Ad6b7A272B52C752D5087fA0FE238cC9BFadF", // Baby Pandas
  "0xD3Ec30829eb7DB12E96488c70EF715d96B2CCE42", // ETN Rock
  "0xD7195E3c956Be88bA28dc0cbf65829dD7db6EA8a", // ElectroFox
  "0xE76b450eE07CE833E10f9227F1Fbbc96e5f9514d", // HoneyBadgers
  "0xe86fb488532e86d99574B9fed9D42ff4AC0FDE23", // Thirst & Thunder
  "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4", // Verdant Kin
  "0x3446c31703CA826F368B981E50971A00eA4C23be", // Limitless: Different Worlds
  "0xe6db26D4F86108D2E9C21924dEf563fA393B8469", // Richard Ells on a Skateboard
  "0x0dD500d9eDEF4d0c4B0c50fa0C4faccB711FDA43", // ElectroPunks
  "0xAcb0bd4EF927A2f4989c731eD6e2213326A02445", // Voyage
  "0xae67aB41E3fe5a459A8602dCFe21684C6caB5703", // New App Celebration
  "0x7782d0Af7642F0aE8bB40eFe36F83deE45DE9d55", // Alien Transmission
  "0xc2DCd3A8cdAFb396DC9FCB606Ace530d1A106a1c", // Electroneum 2.0
  "0x748723AF17899E3C2C1cA682be2733Bca87FDDc8", // Blue Catto
  "0xF91290684eb728f6715EFF0b50018105B6B31658", // Electric Eels
  "0xD5bBD743A47cD60e23FDA16Abf56F3aaA813Fe47", // Thunder Swords
  "0x9b852BD6965F050e9AB8eEd4c900742b1d01fdD1", // Club Watches
  "0xc107C97710972e964d59000f610c07262638B508", // Non-Fungible Comrades
  "0xcff0d88Ed5311bAB09178b6ec19A464100880984", // ElectroGems
  "0x31cbb613D14cc85Cf3A8889007562E4B5cE9518b", // Electric Legends
  "0x1760321f42A9BE39b39c779D92373769d829ef48", // The Three Graces of the Sea
];

// --- Utility Functions (Copied from nftFetcher.ts and adapted for Deno) ---

function normalizeUrl(url: string): string {
  if (!url) return url;
  url = url.trim();
  if (url.startsWith('ipfs://')) {
    const normalized = url.replace('ipfs://', 'https://ipfs.io/ipfs/');
    return normalized;
  }
  return url;
}

async function fetchTokenUri(contract: Contract, tokenId: number): Promise<string> {
  let tokenUri: string | undefined;
  
  // 1. Try ERC-721 standard (tokenURI)
  try {
    tokenUri = await contract.tokenURI(tokenId);
  } catch (e) {
    // 2. If ERC-721 fails, try ERC-1155 standard (uri)
    try {
      let uriTemplate = await contract.uri(tokenId);
      
      if (uriTemplate.includes('{id}')) {
        const hexId = tokenId.toString(16).padStart(64, '0');
        tokenUri = uriTemplate.replace('{id}', hexId);
      } else if (uriTemplate.endsWith('/')) {
        tokenUri = `${uriTemplate}${tokenId}`;
      } else {
        tokenUri = uriTemplate;
      }
    } catch (e2) {
      console.error(`Failed to retrieve token URI/URI for token ${tokenId}.`);
      throw new Error("Failed to retrieve token URI from contract.");
    }
  }
  
  if (!tokenUri) {
    throw new Error("Token URI resolved to an empty URL.");
  }
  return tokenUri;
}

async function fetchTotalSupply(contractAddress: string): Promise<number> {
  const contract = new Contract(contractAddress, erc721And1155Abi, provider);
  try {
    const supply = await contract.totalSupply();
    return Number(supply);
  } catch (e) {
    // Fallback for ERC-1155 or contracts without totalSupply
    console.warn(`Failed to call totalSupply for ${contractAddress}. Assuming max 100 tokens.`);
    return 100; 
  }
}

// --- Main Edge Function Logic ---

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Initialize Supabase client with Service Role Key for elevated database access
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: {
        persistSession: false,
      },
    }
  );

  let totalCached = 0;
  let totalFailed = 0;

  for (const contractAddress of ALL_CONTRACT_ADDRESSES) {
    console.log(`--- Processing Contract: ${contractAddress} ---`);
    
    let totalSupply = 1;
    try {
      totalSupply = await fetchTotalSupply(contractAddress);
    } catch (e) {
      console.error(`Could not determine total supply for ${contractAddress}. Skipping.`);
      continue;
    }

    // Iterate from token ID 1 up to the total supply
    for (let tokenId = 1; tokenId <= totalSupply; tokenId++) {
      try {
        const contract = new Contract(contractAddress, erc721And1155Abi, provider);
        const tokenUri = await fetchTokenUri(contract, tokenId);
        const metadataUrl = normalizeUrl(tokenUri);

        const res = await fetch(metadataUrl);
        if (!res.ok) {
          throw new Error(`Failed to fetch metadata from ${metadataUrl}: Status ${res.status}`);
        }
        
        const json = await res.json();
        
        let imageUrl = json.image || json.image_url || json.imageURI || json.gif;
        imageUrl = normalizeUrl(imageUrl);

        const metadata = {
          contract_address: contractAddress,
          token_id: tokenId,
          title: json.name || `Token #${tokenId}`,
          description: json.description || '(No description)',
          image: imageUrl || '',
          source: metadataUrl,
          attributes: json.attributes || [],
        };

        // Upsert (Insert or Update) the metadata into the gallery_nft_metadata table
        const { error } = await supabase
          .from('gallery_nft_metadata')
          .upsert(metadata, { onConflict: 'contract_address, token_id' });

        if (error) {
          console.error(`Supabase Upsert Error for ${contractAddress}/${tokenId}:`, error);
          totalFailed++;
        } else {
          totalCached++;
        }

        // Introduce a small delay to prevent rate limiting on external services
        await new Promise(resolve => setTimeout(resolve, 50)); 

      } catch (e) {
        console.error(`Failed to process token ${contractAddress}/${tokenId}:`, e);
        totalFailed++;
      }
    }
  }

  const responseBody = {
    message: "NFT caching process completed.",
    totalCached: totalCached,
    totalFailed: totalFailed,
  };

  return new Response(JSON.stringify(responseBody), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
});