import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// Helper: timeout wrapper for fetch
async function fetchTimeout(url: string, opts: RequestInit = {}, timeoutMs = 15000) { // Increased timeout to 15s
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  // Add realistic browser headers
  const headers = new Headers(opts.headers);
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8');
  }
  if (!headers.has('Accept-Language')) {
    headers.set('Accept-Language', 'en-US,en;q=0.9');
  }
  // Add Referer for Panth.art specifically
  if (url.includes("panth.art") && !headers.has('Referer')) {
      headers.set('Referer', 'https://panth.art/');
  }

  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow", headers, ...opts });
    clearTimeout(id);
    return res;
  } finally {
    clearTimeout(id);
  }
}

type ProbeResult = { status: "available" | "unavailable" | "error"; reason?: string; probe?: string; url?: string };

/**
 * Generic HTML probe (ElectroSwap / Rarible) using robust text matching instead of JSDOM.
 */
async function probeHtmlPage(pageUrl: string, tokenId: string): Promise<ProbeResult> {
  try {
    const r = await fetchTimeout(pageUrl, { method: "GET" }, 15000);
    if (!r) return { status: "error", reason: "no-response" };
    if (r.status === 404 || r.status === 410) return { status: "unavailable", reason: "404/410" };

    const text = await r.text();
    const lowerText = text.toLowerCase();

    // 1) Negative signals: explicit "not found" phrases (check this first)
    if (/(not found|page not found|no item|invalid token|no results|not available|doesn't exist)/i.test(lowerText)) {
      return { status: "unavailable", probe: "html-heuristic-negative" };
    }

    // 2) Check JSON-LD scripts for tokenId
    const jsonLdRegex = /<script type="application\/ld\+json">(.*?)<\/script>/gs;
    let match;
    while ((match = jsonLdRegex.exec(text)) !== null) {
      try {
        const jsonContent = JSON.parse(match[1]);
        const str = JSON.stringify(jsonContent).toLowerCase();
        if (tokenId && str.includes(tokenId.toLowerCase())) {
          return { status: "available", probe: "json-ld" };
        }
      } catch {}
    }

    // 3) Check meta tags (og:title, og:description) and regular title
    const titleMatch = text.match(/<title>(.*?)<\/title>/i);
    const ogTitleMatch = text.match(/<meta property="og:title" content="(.*?)"/i);
    const ogDescMatch = text.match(/<meta property="og:description" content="(.*?)"/i);
    
    const title = titleMatch ? titleMatch[1] : "";
    const ogTitle = ogTitleMatch ? ogTitleMatch[1] : "";
    const ogDesc = ogDescMatch ? ogDescMatch[1] : "";

    const combined = (ogTitle + " " + ogDesc + " " + title).toLowerCase();
    if (combined && (combined.includes("nft") || combined.includes("token") || combined.includes(tokenId.toLowerCase()))) {
      return { status: "available", probe: "meta-title" };
    }

    // 4) Check for common NFT page markers in the body text
    if (lowerText.includes("owner") || lowerText.includes("minted") || lowerText.includes("created by") || lowerText.includes("collection")) {
        return { status: "available", probe: "body-keywords" };
    }

    // 5) Fallback: If status is 200 and no negative signals were found, assume it's available.
    if (r.status >= 200 && r.status < 300) {
        return { status: "available", probe: "html-200-fallback" };
    }

    // If we reach here, it's likely an error or redirect page we didn't catch
    return { status: "unavailable", probe: "fallback-unavailable" };

  } catch (e) {
    console.error("HTML probe failed:", e);
    return { status: "error", reason: String(e) };
  }
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const { marketplace, collection, tokenId } = await req.json();
    
    if (!marketplace || !collection || tokenId === undefined) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    
    const tok = String(tokenId);

    let result: ProbeResult;

    if (marketplace === "rarible") {
      // Use HTML probe for Rarible
      const pageUrl = `https://rarible.com/electroneum/items/${collection}:${tok}`;
      result = await probeHtmlPage(pageUrl, tok);
    } else if (marketplace === "electroswap") {
      const pageUrl = `https://app.electroswap.io/nfts/asset/${collection}/${tok}`;
      result = await probeHtmlPage(pageUrl, tok);
    } 
    else {
      result = { status: "error", reason: "Unknown marketplace" };
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (e) {
    console.error("Edge Function error:", e);
    return new Response(JSON.stringify({ status: "error", reason: String(e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});