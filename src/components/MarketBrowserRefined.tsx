import React, { useMemo, useState, useEffect, useRef } from "react";

const MARKETPLACES = [
  {
    id: "electroswap",
    name: "ElectroSwap",
    template: "https://app.electroswap.io/nfts/asset/{collection}/{tokenId}",
  },
  {
    id: "panth",
    name: "Panth.art",
    template: "https://panth.art/collections/{collection}/{tokenId}",
  },
  {
    id: "rarible",
    name: "Rarible",
    template: "https://rarible.com/electroneum/items/{collection}:{tokenId}",
  },
] as const;

function buildMarketplaceUrls(collection: string, tokenId: string | number) {
  const coll = String(collection);
  const tok = String(tokenId);
  return MARKETPLACES.map((m) => ({
    ...m,
    url: m.template.replace("{collection}", encodeURIComponent(coll)).replace("{tokenId}", encodeURIComponent(tok)),
  }));
}

type ProbeStatus = "unknown" | "unavailable" | "available" | "blocked";

/**
 * Lightweight fetch with timeout.
 */
async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { signal: controller.signal, ...init });
    clearTimeout(id);
    return res;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Probing strategy:
 * 1) Try HEAD (fast) -> if 2xx treat as available.
 * 2) Try GET with Accept: application/json -> if JSON with useful fields treat as available.
 * 3) Try GET (text) -> simple heuristics: "not found", "404", "page not found", or missing token id -> treat as unavailable.
 *
 * Returns one of ProbeStatus.
 *
 * NOTE: cross-origin requests may throw due to CORS - those are returned as "blocked".
 */
export async function probeMarketplaceUrl(url: string, timeoutMs = 4000, useProxyIfBlocked = true) : Promise<ProbeStatus> {
  // attempt HEAD
  try {
    const head = await fetchWithTimeout(url, { method: "HEAD", mode: "cors" }, timeoutMs);
    if (head && head.ok) {
      // HEAD success -> likely available
      return "available";
    }
    // if HEAD returns 404/410 etc -> unavailable
    if (head && (head.status === 404 || head.status === 410)) {
      return "unavailable";
    }
  } catch (err: any) {
    // could be CORS block or network failure — fallthrough to GET attempt
    // If it's an AbortError treat as unavailable (timeout); otherwise may be blocked
    // We will try GET next.
  }

  // try GET for JSON or HTML
  try {
    // try JSON first (some marketplaces will return JSON or redirect)
    const getJson = await fetchWithTimeout(url, { method: "GET", headers: { Accept: "application/json" }, mode: "cors" }, timeoutMs);
    if (getJson && getJson.ok) {
      const contentType = (getJson.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("application/json")) {
        // try to parse; if parse succeeds and we have a body -> available
        try {
          const body = await getJson.json();
          // lightweight heuristic: body exists and is object -> available
          if (body && typeof body === "object") return "available";
        } catch (e) {
          // parsing failed -> continue to HTML check
        }
      } else {
        // HTML response — check for 404 markers
        const text = await getJson.text();
        const lower = text.slice(0, 2000).toLowerCase(); // only examine prefix
        if (/(404|not found|page not found|no item|no token|invalid token)/i.test(lower)) {
          return "unavailable";
        }
        // HTML contains something — treat as available
        return "available";
      }
    } else if (getJson && (getJson.status === 404 || getJson.status === 410)) {
      return "unavailable";
    }
  } catch (err: any) {
    // if fetch throws, likely CORS blocked or network. We'll try proxy fallback.
  }

  // At this point: HEAD failed and GET likely failed due to CORS or timeout. We cannot reliably know.
  if (useProxyIfBlocked && typeof window !== "undefined") {
    // call your server-side probe endpoint if available. This requires implementing a tiny server route:
    // GET /api/probe?url=<encodeURIComponent(url)> which performs HEAD/GET server-side and returns JSON { status: "available"|"unavailable" }
    try {
      const proxyUrl = `/api/probe?url=${encodeURIComponent(url)}`;
      const proxyResp = await fetchWithTimeout(proxyUrl, { method: "GET", mode: "same-origin" }, timeoutMs);
      if (proxyResp && proxyResp.ok) {
        const j = await proxyResp.json();
        if (j && j.status === "available") return "available";
        if (j && j.status === "unavailable") return "unavailable";
      }
    } catch (e) {
      // proxy failed or not present; fallthrough to "blocked"
    }
  }

  // We couldn't determine due to CORS or proxy absence
  return "blocked";
}

export function MarketBrowserRefined({
  collection,
  tokenId,
  open,
  onClose,
}: {
  collection: string;
  tokenId: string | number;
  open: boolean;
  onClose: () => void;
}) {
  const marketplaces = useMemo(() => buildMarketplaceUrls(collection, tokenId), [collection, tokenId]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(marketplaces[0]?.url ?? null);

  // store probe statuses and cache to avoid repeated probes
  const cacheRef = useRef<Record<string, ProbeStatus>>({});
  const [statuses, setStatuses] = useState<Record<string, ProbeStatus>>(() => ({}));
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    // probe all marketplaces in parallel (limited concurrency)
    let cancelled = false;

    async function runProbes() {
      const entries = marketplaces.map((m) => ({ id: m.id, url: m.url }));
      // concurrency limit helper
      const concurrency = 4;
      const queue = [...entries];
      const results: Record<string, ProbeStatus> = {};

      async function worker() {
        while (queue.length && !cancelled) {
          const item = queue.shift();
          if (!item) break;
          const key = `${item.url}`;
          if (cacheRef.current[key]) {
            results[item.id] = cacheRef.current[key];
            // update status immediately
            setStatuses((s) => ({ ...s, [item.id]: cacheRef.current[key] }));
            continue;
          }

          // set interim state "unknown" to show spinner or similar
          setStatuses((s) => ({ ...s, [item.id]: "unknown" }));

          const status = await probeMarketplaceUrl(item.url, 4000, true);
          cacheRef.current[key] = status;
          results[item.id] = status;
          if (!cancelled && mountedRef.current) {
            setStatuses((s) => ({ ...s, [item.id]: status }));
          }
        }
      }

      // spawn workers
      const workers = Array.from({ length: concurrency }).map(() => worker());
      await Promise.all(workers);
    }

    runProbes();

    return () => { cancelled = true; };
  }, [open, collection, tokenId, marketplaces]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1100px, 96vw)", height: "80vh", background: "#0f1720", borderRadius: 10, overflow: "hidden", display: "grid", gridTemplateColumns: "320px 1fr" }}>
        <div style={{ padding: 12, background: "#0b1220", overflowY: "auto" }}>
          <h3 style={{ margin: "6px 0 12px 0", color: "#fff" }}>Open on marketplace</h3>

          {marketplaces.map((m) => {
            const status: ProbeStatus = statuses[m.id] ?? "unknown";
            const disabled = status === "unavailable";
            const blocked = status === "blocked";
            return (
              <div key={m.id} style={{ marginBottom: 8 }}>
                <button
                  onClick={() => {
                    if (disabled) return;
                    const opened = window.open(m.url, `${m.name} - ${collection}/${tokenId}`, `scrollbars=yes,width=1100,height=800`);
                    if (opened) {
                      onClose();
                    } else {
                      // popup blocked -> set preview iframe
                      setPreviewUrl(m.url);
                    }
                  }}
                  disabled={disabled}
                  title={
                    disabled
                      ? "Not available on this marketplace"
                      : blocked
                      ? "Check blocked by CORS — opens in popup/iframe"
                      : "Open on marketplace"
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: disabled ? "#222" : "#061126",
                    color: disabled ? "#777" : "#e6eef8",
                    border: "1px solid rgba(255,255,255,0.03)",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: blocked ? 0.85 : 1
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{m.name}
                    {" "}
                    <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 8 }}>
                      {status === "available" ? "• available" : status === "unavailable" ? "• not found" : status === "blocked" ? "• blocked" : "• checking"}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6, wordBreak: 'break-all' }}>{m.url}</div>
                </button>
              </div>
            );
          })}

          <div style={{ marginTop: 12 }}>
            <button onClick={() => navigator.clipboard?.writeText(buildMarketplaceUrls(collection, tokenId)[0].url)} style={{ padding: "8px 10px", borderRadius: 6, background: "#0b6cff", color: "#fff", border: "none" }}>
              Copy first marketplace link
            </button>
          </div>
        </div>

        <div style={{ background: "#000" }}>
          {previewUrl ? (
            <iframe title="marketplace-preview" src={previewUrl} style={{ width: "100%", height: "100%", border: 0 }} sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals" />
          ) : (
            <div style={{ color: "#888", padding: 16 }}>Select a marketplace to preview or open in popup.</div>
          )}
        </div>
      </div>
    </div>
  );
}