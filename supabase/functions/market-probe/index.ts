import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { JSDOM } from "https://esm.sh/jsdom@24.1.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// Helper: timeout wrapper for fetch
async function fetchTimeout(url: string, opts: RequestInit = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow", ...opts });
    clearTimeout(id);
    return res;
  } finally {
    clearTimeout(id);
  }
}

type ProbeResult = { status: "available" | "unavailable" | "error"; reason?: string; probe?: string; url?: string };

// Rarible probe: try the official API endpoint(s)
async function probeRarible(collection: string, tokenId: string): Promise<ProbeResult> {
  // Build possible itemIds - try several common formats
  const candidates = [
    `${collection}:${tokenId}`,
    `ETHEREUM:${collection}:${tokenId}`,
  ];

  // Public Rarible API base
  const baseCandidates = [
    "https://api.rarible.org/v0.1/items/",
    "https://ethereum-api.rarible.org/v0.1/items/"
  ];

  for (const base of baseCandidates) {
    for (const itemId of candidates) {
      try {
        const url = base + encodeURIComponent(itemId);
        const r = await fetchTimeout(url, { method: "GET" }, 5000);
        if (r && r.ok) {
          // 200 -> token exists
          return { status: "available", probe: "rarible-api", url };
        } else if (r && r.status === 404) {
          // explicit not found for this itemId - try next candidate
          continue;
        }
      } catch (e) {
        console.error("Rarible probe failed:", e);
        // could be network error / rate limit; try next candidate
      }
    }
  }

  // nothing found
  return { status: "unavailable", probe: "rarible-api" };
}

// Generic HTML probe (ElectroSwap / Panth / other)
async function probeHtmlPage(pageUrl: string, tokenId: string): Promise<ProbeResult> {
  try {
    const r = await fetchTimeout(pageUrl, { method: "GET" }, 6000);
    if (!r) {
      return { status: "error", reason: "no-response" };
    }
    if (r.status === 404 || r.status === 410) return { status: "unavailable", reason: "404/410" };

    const text = await r.text();
    const dom = new JSDOM(text);
    const doc = dom.window.document;

    // 1) check for JSON-LD or ld+json script blocks that reference token
    const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
    for (const s of scripts) {
      try {
        const j = JSON.parse(s.textContent || "{}");
        const str = JSON.stringify(j).toLowerCase();
        if (str.includes(tokenId.toLowerCase())) {
          return { status: "available", probe: "json-ld" };
        }
      } catch {}
    }

    // 2) check og:title / og:description meta tags
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
    const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
    const combined = (ogTitle + " " + ogDesc).toLowerCase();
    if (combined.includes(tokenId.toLowerCase()) || combined.includes("token") || combined.includes("nft")) {
      return { status: "available", probe: "og-meta" };
    }

    // 3) Check for obvious "not found" phrases in page text
    const pageSnippet = text.slice(0, 3000).toLowerCase();
    if (/not found|page not found|no item|invalid token|no results|not available/i.test(pageSnippet)) {
      return { status: "unavailable", probe: "html-heuristic" };
    }

    // 4) fallback: assume available if page returned 200 but we didn't detect negative signals
    return { status: "available", probe: "html-200-fallback" };
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
      result = await probeRarible(collection, tok);
    } else if (marketplace === "electroswap") {
      const pageUrl = `https://app.electroswap.io/nfts/asset/${collection}/${tok}`;
      result = await probeHtmlPage(pageUrl, tok);
    } else if (marketplace === "panth") {
      const pageUrl = `https://panth.art/collections/${collection}/${tok}`;
      result = await probeHtmlPage(pageUrl, tok);
    } else {
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