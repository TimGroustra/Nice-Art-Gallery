import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.4'

// Deno compatible imports for utility functions
import { pLimit } from "https://esm.sh/p-limit@5.0.0";

const ELECTROPUNKS_ADDRESS = "0x0dD500d9eDEF4d0c4B0c50fa0C4faccB711FDA43";
const API_BASE = "https://api.rarible.org/v0.1/nft/items/byCollection";
const CHAIN_PREFIXES = ["ETHEREUM", "POLYGON", "BASE", "ARBITRUM"];
const CONCURRENCY = 6;
const TIMEOUT_MS = 10000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function ipfsCandidates(uri: string | null | undefined): string[] {
  if (!uri) return [];
  uri = uri.trim();
  if (uri.startsWith("ipfs://")) {
    const path = uri.slice(7).replace(/^\/+/, "");
    return [
      `https://cloudflare-ipfs.com/ipfs/${path}`,
      `https://dweb.link/ipfs/${path}`,
      `https://nftstorage.link/ipfs/${path}`,
      `https://ipfs.io/ipfs/${path}`
    ];
  }
  // already http(s)
  return [uri];
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs: number = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fetchRaribleByCollection(collectionParam: string, size = 100, continuation: string | null = null) {
  const qp = new URLSearchParams();
  qp.set("collection", collectionParam);
  qp.set("size", String(size));
  if (continuation) qp.set("continuation", continuation);
  const url = `${API_BASE}?${qp.toString()}`;
  
  console.log(`[Rarible Fetch] Requesting: ${url}`);
  
  const res = await fetchWithTimeout(url, { method: "GET", headers: { "Accept": "application/json" }});
  
  console.log(`[Rarible Fetch] Response Status: ${res.status}`);
  
  if (!res.ok) throw new Error(`Rarible API ${res.status} ${res.statusText} for collection ${collectionParam}`);
  const json = await res.json();
  return json;
}

async function resolveImageUrl(rawImageField: string | null | undefined) {
  if (!rawImageField) return { resolved: null, attributes: null };
  let candidates = ipfsCandidates(rawImageField);
  
  for (const c of candidates) {
    try {
      // Try HEAD first (quicker)
      const head = await fetchWithTimeout(c, { method: "HEAD" }, 6000);
      if (head.ok) return { resolved: c };
    } catch (e) {
      // continue
    }
    // Fallback to GET quick check if small
    try {
      const get = await fetchWithTimeout(c, { method: "GET" }, 8000);
      if (get.ok) {
        const ct = get.headers.get("content-type") || "";
        if (ct.startsWith("image/") || ct.startsWith("video/")) return { resolved: c };
      }
    } catch (e) {}
  }
  return { resolved: null };
}

async function processRaribleItem(item: any) {
    const out: any = {
        tokenId: item.tokenId || (item.id ? String(item.id).split(":").pop() : null),
        itemId: item.id,
        blockchain: item.blockchain,
        metadataUrl: null,
        imageRaw: null,
        imageResolved: null,
        title: item.meta?.name || `Token #${item.tokenId}`,
        description: item.meta?.description || '(No description)',
        attributes: item.meta?.attributes || [],
        error: null
    };

    try {
        // 1. Try to find image URL directly in meta content
        if (item.meta && item.meta.content && item.meta.content.length) {
            const content = item.meta.content;
            const firstUrl = content.find((c: any) => c.url && (c.mime?.startsWith("image") || c.mime?.startsWith("video")))?.url
                          || content.find((c: any) => c.url)?.url;
            if (firstUrl) {
                out.imageRaw = firstUrl;
            }
        }
        
        // 2. Fallback: check item.meta.metadata
        if (!out.imageRaw && item.meta && item.meta.metadata) {
            if (item.meta.metadata.image) out.imageRaw = item.meta.metadata.image;
        }
        
        // 3. Fallback: attempt to fetch metadata via item.tokenUri if present
        if (!out.imageRaw && item.tokenUri) {
            out.metadataUrl = item.tokenUri;
            try {
                const r = await fetchWithTimeout(item.tokenUri, { method: "GET" }, 8000);
                if (r.ok) {
                    const j = await r.json();
                    if (j.image) out.imageRaw = j.image;
                    else if (j.image_url) out.imageRaw = j.image_url;
                    
                    // Update title/description/attributes if fetched from tokenUri
                    out.title = j.name || out.title;
                    out.description = j.description || out.description;
                    out.attributes = j.attributes || out.attributes;
                }
            } catch (e) {
                // ignore metadata fetch errors here
            }
        }

        // 4. Resolve image field to gateway
        if (out.imageRaw) {
            const resolved = await resolveImageUrl(out.imageRaw);
            out.imageResolved = resolved.resolved;
        } else {
            out.error = "no image field found in item meta or tokenUri";
        }
    } catch (err) {
        out.error = err.message || String(err);
    }
    
    console.log(`[Item ${out.tokenId}] Image Resolved: ${out.imageResolved ? 'Yes' : 'No'} (Error: ${out.error || 'None'})`);
    
    return out;
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Initialize Supabase client with Service Role Key for invoking other functions
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
    const limit = pLimit(CONCURRENCY);
    const allResults = [];
    let foundAny = false;

    for (const prefix of CHAIN_PREFIXES) {
      const collectionParam = `${prefix}:${ELECTROPUNKS_ADDRESS}`;
      console.log("Trying Rarible collection param:", collectionParam);
      
      try {
        let cont: string | null = null;
        let page = 0;
        do {
          const body = await fetchRaribleByCollection(collectionParam, 100, cont);
          const items = body.items || body;
          
          if (items && items.length > 0) {
            foundAny = true;
            console.log(`Processing page ${page} with ${items.length} items.`);
            
            const tasks = items.map((item: any) => limit(() => processRaribleItem(item)));
            const pageResults = await Promise.all(tasks);
            allResults.push(...pageResults);
          }
          cont = body.continuation || null;
          page++;
        } while (cont);
        
        if (foundAny) break; // stop trying other chain prefixes
      } catch (err) {
        console.warn("Rarible API attempt failed for", collectionParam, ":", err.message || err);
        // try next prefix
      }
    }

    if (!foundAny) {
      throw new Error("Rarible returned no items for any tried chain prefixes.");
    }
    
    // Filter out items that failed to resolve an image
    const validItems = allResults.filter(item => item.imageResolved);
    
    console.log(`Successfully fetched ${allResults.length} items from Rarible. ${validItems.length} items have resolved images and will be cached.`);

    // --- Invoke Bulk Cache Function ---
    const { data: cacheData, error: cacheError } = await supabase.functions.invoke('bulk-cache-metadata', {
        body: { items: validItems },
    });

    if (cacheError) {
        console.error("Error invoking bulk-cache-metadata:", cacheError);
        throw new Error(`Failed to trigger bulk caching: ${cacheError.message}`);
    }
    
    console.log("Bulk caching triggered successfully.");

    return new Response(JSON.stringify({ 
        message: "Rarible data fetched and bulk caching initiated.", 
        count: validItems.length,
        cacheResults: cacheData
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