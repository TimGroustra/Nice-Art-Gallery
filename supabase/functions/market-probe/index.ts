import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { JSDOM } from "https://esm.sh/jsdom@24.1.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// Helper: timeout wrapper for fetch
async function fetchTimeout(url: string, opts: RequestInit = {}, timeoutMs = 15000) {
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
 * Generic HTML probe (ElectroSwap / Panth / Rarible) with improved heuristics.
 */
async function probeHtmlPage(pageUrl: string, tokenId: string): Promise<ProbeResult> {
  try {
    const r = await fetchTimeout(pageUrl, { method: "GET" }, 15000);
    if (!r) return { status: "error", reason: "no-response" };
    
    // Treat 404/410 as definitive unavailability
    if (r.status === 404 || r.status === 410) return { status: "unavailable", reason: `http-${r.status}` };

    const text = await r.text();
    const dom = new JSDOM(text);
    const doc = dom.window.document;
    const lowText = text.toLowerCase();

    // 1) Check JSON-LD scripts for tokenId
    const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
    for (const s of scripts) {
      try {
        const j = JSON.parse(s.textContent || "{}");
        const str = JSON.stringify(j).toLowerCase();
        if (tokenId && str.includes(tokenId.toLowerCase())) {
          return { status: "available", probe: "json-ld" };
        }
      } catch {}
    }

    // 2) Check meta tags (og:title, og:description) and regular title
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
    const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
    const title = doc.querySelector("title")?.textContent || "";
    const combined = (ogTitle + " " + ogDesc + " " + title).toLowerCase();
    if (combined && (combined.includes("nft") || combined.includes("token") || combined.includes(tokenId))) {
      return { status: "available", probe: "meta-title" };
    }

    // 3) Panth/ElectroSwap specific markers: "View Token URI" link, "Type ERC721", "Listing", "Owner", image
    const hasViewTokenUri = !![...doc.querySelectorAll("a")].find(a => (a.textContent || "").trim().toLowerCase().includes("view token uri") || (a.href || "").includes("ipfs.io"));
    const hasType = !![...doc.querySelectorAll("*")].find(n => (n.textContent || "").toLowerCase().includes("type erc721") || (n.textContent || "").toLowerCase().includes("type erc1155"));
    const hasListingOrOwner = !![...doc.querySelectorAll("*")].find(n => (n.textContent || "").toLowerCase().includes("listing") || (n.textContent || "").toLowerCase().includes("owner"));
    const hasMainImage = !!doc.querySelector('img') || !!doc.querySelector('[role="img"]');

    if (hasViewTokenUri || hasType || hasListingOrOwner || hasMainImage) {
      // additional check: ensure not a 404-like page
      if (!/(not found|no item|invalid token|page not found|no results)/i.test(lowText)) {
        return { status: "available", probe: "html-markers" };
      }
    }

    // 4) Negative signals: explicit "not found" phrases
    if (/(not found|page not found|no item|invalid token|no results|not available)/i.test(lowText)) {
      return { status: "unavailable", probe: "html-heuristic-negative" };
    }

    // 5) Fallback: 200 and long body -> available (for client-rendered pages that might not have markers in initial HTML)
    if (r.status === 200 && text.length > 2000) {
        return { status: "available", probe: "html-200-fallback" };
    }

    // Default to unavailable if no positive markers found
    return { status: "unavailable", probe: "no-markers" };

  } catch (e) {
    console.error("HTML probe failed:", e);
    return { status: "error", reason: String(e) };
  }
}

/**
 * Probe Rarible using their API endpoint first, falling back to HTML if needed.
 */
async function probeRarible(collection: string, tokenId: string): Promise<ProbeResult> {
    // 1. Try Rarible API (fastest)
    const apiCandidates = [
        `https://api.rarible.org/v0.1/items/${encodeURIComponent(`${collection}:${tokenId}`)}`,
        // Rarible often uses ETHEREUM chain prefix even for ETN NFTs on their API
        `https://ethereum-api.rarible.org/v0.1/items/${encodeURIComponent(`ETHEREUM:${collection}:${tokenId}`)}`
    ];

    for (const url of apiCandidates) {
        try {
            const r = await fetchTimeout(url, { method: "GET", headers: { "Accept": "application/json" } }, 8000);
            if (r && r.ok) {
                return { status: "available", probe: "rarible-api", url };
            }
        } catch (e) {
            // Ignore fetch errors for API candidates, try next one
        }
    }

    // 2. Fallback to HTML probe on the main page
    const pageUrl = `https://rarible.com/electroneum/items/${collection}:${tokenId}`;
    return probeHtmlPage(pageUrl, tokenId);
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