import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.4'

// Hardcoded for ElectroPunks collection
const ELECTROPUNKS_ADDRESS = "0x0dD500d9eDEF4d0c4B0c50fa0C4faccB711FDA43";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper function for fetch with timeout and retries
async function fetchWithRetry(url: string, timeout: number = 15000, retries: number = 3): Promise<Response> {
    const controller = new AbortController();
    let lastError: Error | null = null;
    
    for (let i = 0; i < retries; i++) {
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(id);
            if (!response.ok) {
                throw new Error(`HTTP status ${response.status}`);
            }
            return response;
        } catch (error) {
            clearTimeout(id);
            lastError = error as Error;
            console.warn(`[Fetch Retry] Attempt ${i + 1} failed for ${url}: ${lastError?.message}. Retrying...`);
            // Exponential backoff
            await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
        }
    }
    throw new Error(`Failed to fetch URL after ${retries} attempts: ${url}. Last error: ${lastError?.message}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Initialize Supabase client with Service Role Key for storage access
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
    const { items } = await req.json();
    
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Input must be a non-empty array of items.");
    }

    const results = [];
    
    for (const item of items) {
        const { tokenId, title, description, imageResolved, attributes, metadataUrl } = item;
        
        if (!tokenId || !imageResolved) {
            results.push({ tokenId, status: 'skipped', reason: 'Missing tokenId or imageResolved URL' });
            continue;
        }
        
        let finalImageUrl = imageResolved;
        let status = 'success';
        let reason = 'Cached successfully';

        // --- Image Caching Logic ---
        let imageRes: Response | null = null;
        try {
            console.log(`[Bulk Cache] Fetching image for Token ${tokenId} from: ${imageResolved}`);
            imageRes = await fetchWithRetry(imageResolved, 15000, 3); 
        } catch (e) {
            console.warn(`[Bulk Cache] Failed to fetch external image for Token ${tokenId}. Skipping image cache. Error: ${e.message}`);
            status = 'partial_success';
            reason = 'Metadata cached, image fetch failed.';
        }
        
        if (imageRes && imageRes.ok) {
            const contentType = imageRes.headers.get('Content-Type') || 'image/png';
            const imageBuffer = await imageRes.arrayBuffer();
            const imagePayload = new Uint8Array(imageBuffer);
            
            let fileExtension = 'png';
            if (contentType) {
                const parts = contentType.split('/');
                if (parts.length === 2) {
                    fileExtension = parts[1].toLowerCase().replace('jpeg', 'jpg');
                }
            }
            
            const storagePath = `${ELECTROPUNKS_ADDRESS}/${tokenId}.${fileExtension}`;
            
            const { error: uploadError } = await supabase.storage
                .from('nft_images')
                .upload(storagePath, imagePayload, {
                    cacheControl: '3600',
                    upsert: true,
                    contentType: contentType,
                });

            if (uploadError) {
                console.error(`[Bulk Cache] Failed to upload image for Token ${tokenId}:`, uploadError);
                status = 'partial_success';
                reason = 'Metadata cached, image upload failed.';
            } else {
                const { data: publicUrlData } = supabase.storage
                    .from('nft_images')
                    .getPublicUrl(storagePath);
                
                if (publicUrlData?.publicUrl) {
                    finalImageUrl = publicUrlData.publicUrl;
                } else {
                    console.error(`[Bulk Cache] Failed to get public URL for storage path: ${storagePath}`);
                    status = 'partial_success';
                    reason = 'Metadata cached, failed to get public URL.';
                }
            }
        }
        // --- End Image Caching Logic ---

        // --- Database Metadata Caching ---
        const metadataToCache = {
          contract_address: ELECTROPUNKS_ADDRESS,
          token_id: tokenId,
          title: title || `Token #${tokenId}`,
          description: description || '(No description)',
          image: finalImageUrl, 
          source: metadataUrl || 'Rarible API',
          attributes: attributes || [],
        };
        
        const { error: insertError } = await supabase
          .from('gallery_nft_metadata')
          .upsert(metadataToCache, { onConflict: 'contract_address, token_id' });

        if (insertError) {
          console.error(`[Bulk Cache] Failed to save metadata to Supabase DB for Token ${tokenId}:`, insertError.message);
          status = 'failure';
          reason = 'Failed to insert metadata into DB.';
        }
        
        results.push({ tokenId, status, reason });
    }
    
    console.log(`[Bulk Cache] Finished processing ${items.length} items.`);

    return new Response(JSON.stringify({ results, count: items.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error("[Bulk Cache] Edge Function execution error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})