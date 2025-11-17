import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { JSDOM } from "https://esm.sh/jsdom@24.1.0";

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
 * Generic HTML probe (ElectroSwap / Panth / Rarible) with improved heuristics.
 */
async function probeHtmlPage(pageUrl: string, tokenId: string): Promise<ProbeResult> {
  try {
    const r = await fetchTimeout(pageUrl, { method: "GET" }, 15000);
    if (!r) return { status: "error", reason: "no-response" };
    // Treat 404/410 as definitive unavailability
    if (r.status === 404 || r.status === 410) return { status: "unavailable", reason: "404/410" };

    const text = await r.text();
    const dom = new JSDOM(text);
    const doc = dom.window.document;

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

    // 3) Panth-specific markers: "View Token URI" link, "Type ERC721", "Listing", "Owner"
    const hasViewTokenUri = !![...doc.querySelectorAll("a")].find(a => (a.textContent || "").trim().toLowerCase().includes("view token uri") || (a.href || "").includes("ipfs.io"));
    const hasType = !![...doc.querySelectorAll("*")].find(n => (n.textContent || "").toLowerCase().includes("type erc721") || (n.textContent || "").toLowerCase().includes("type erc1155"));
    const hasListingOrOwner = !![...doc.querySelectorAll("*")].find(n => (n.textContent || "").toLowerCase().includes("listing") || (n.textContent || "").toLowerCase().includes("owner"));
    const hasMainImage = !!doc.querySelector('img') || !!doc.querySelector('[role="img"]');

    if (hasViewTokenUri || hasType || hasListingOrOwner || hasMainImage) {
      // additional check: ensure not a 404-like page
      const snippet = text.slice(0, 3000).toLowerCase();
      if (!/(not found|no item|invalid token|page not found|no results)/i.test(snippet)) {
        return { status: "available", probe: "panth-markers" };
      }
    }

    // 4) Negative signals: explicit "not found" phrases
    if (/(not found|page not found|no item|invalid token|no results|not available)/i.test(text.toLowerCase())) {
      return { status: "unavailable", probe: "html-heuristic-negative" };
    }

    // 5) Fallback: 200 but no negatives -> available
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
      // Use HTML probe for Rarible
      const pageUrl = `https://rarible.com/electroneum/items/${collection}:${tok}`;
      result = await probeHtmlPage(pageUrl, tok);
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