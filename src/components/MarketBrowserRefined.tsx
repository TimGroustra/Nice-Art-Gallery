import React, { useState, useMemo, useEffect, useRef } from "react";

/**
 * Minimal marketplace templates for the three marketplaces you specified.
 * Uses {collection} and {tokenId} placeholders.
 */
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

function buildUrls(collection: string, tokenId: string | number) {
  const coll = String(collection);
  const tok = String(tokenId);
  return MARKETPLACES.map((m) => ({
    ...m,
    url: m.template.replace("{collection}", encodeURIComponent(coll)).replace("{tokenId}", encodeURIComponent(tok)),
  }));
}

/** simple timeout fetch helper */
async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeout = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(input, { signal: controller.signal, ...init });
    clearTimeout(id);
    return res;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Probe a URL to determine availability.
 * Strategy:
 * 1) HEAD -> if ok => available
 * 2) GET Accept: application/json -> if JSON or HTML without 404 markers => available
 * 3) if 404 => unavailable
 * 4) if fetch fails due to CORS/network -> return "blocked"
 */
type ProbeResult = "available" | "unavailable" | "blocked" | "error";

async function probeUrl(url: string, timeout = 4000): Promise<ProbeResult> {
  try {
    // HEAD
    try {
      const head = await fetchWithTimeout(url, { method: "HEAD", mode: "cors" }, timeout);
      if (head && head.ok) return "available";
      if (head && (head.status === 404 || head.status === 410)) return "unavailable";
    } catch {
      // HEAD failed (likely CORS) — we'll continue to GET attempt
    }

    // GET (try JSON first)
    try {
      const getJson = await fetchWithTimeout(url, { method: "GET", headers: { Accept: "application/json" }, mode: "cors" }, timeout);
      if (getJson && getJson.ok) {
        const ct = (getJson.headers.get("content-type") || "").toLowerCase();
        if (ct.includes("application/json")) {
          // most likely an API/redirect; treat presence as available
          return "available";
        }
        // fallthrough to text check
        const text = await getJson.text();
        const lower = text.slice(0, 2000).toLowerCase();
        if (/(404|not found|page not found|no item|no token|invalid token)/i.test(lower)) return "unavailable";
        return "available";
      } else if (getJson && (getJson.status === 404 || getJson.status === 410)) {
        return "unavailable";
      }
    } catch {
      // GET failed (likely blocked by CORS)
      return "blocked";
    }

    // fallback: unknown but not strictly blocked; mark blocked to be safe
    return "blocked";
  } catch (err) {
    console.warn("probeUrl error", err);
    return "error";
  }
}

/** Try to open a centered popup. Returns true if succeeded. */
function openCenteredPopup(url: string, title = "Marketplace", w = 1100, h = 800) {
  const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
  const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
  const width = window.innerWidth ?? document.documentElement.clientWidth ?? screen.width;
  const height = window.innerHeight ?? document.documentElement.clientHeight ?? screen.height;
  const left = width / 2 - w / 2 + dualScreenLeft;
  const top = height / 2 - h / 2 + dualScreenTop;
  const features = `scrollbars=yes,width=${w},height=${h},top=${top},left=${left}`;
  const newWin = window.open(url, title, features);
  if (newWin) try { newWin.focus(); } catch {}
  return !!newWin;
}

/**
 * Props:
 * - collection: contract address (string)
 * - tokenId: token number (string | number)
 * - open: whether to show modal
 * - onClose: callback
 */
export function MarketBrowserRefined({ collection, tokenId, open, onClose }: {
  collection: string;
  tokenId: string | number;
  open: boolean;
  onClose: () => void;
}) {
  const markets = useMemo(() => buildUrls(collection, tokenId), [collection, tokenId]);
  // track probe state per marketplace id
  const [probeState, setProbeState] = useState<Record<string, ProbeResult | "checking">>({});
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!open) {
      setProbeState({});
      setSelectedMarket(null);
      setIframeUrl(null);
    }
  }, [open, collection, tokenId]);

  // When user selects a marketplace button -> probe the url (if not already probed) and then open page.
  async function handleSelect(marketId: string) {
    const market = markets.find((m) => m.id === marketId);
    if (!market) return;
    setSelectedMarket(marketId);
    setProbeState((s) => ({ ...s, [marketId]: "checking" }));

    const result = await probeUrl(market.url, 4000);

    if (!mounted.current) return;

    setProbeState((s) => ({ ...s, [marketId]: result }));

    if (result === "available") {
      // try to open popup; if blocked, show in iframe preview inside modal
      const opened = openCenteredPopup(market.url, `${market.name} - ${collection}/${tokenId}`);
      if (!opened) {
        setIframeUrl(market.url);
      } else {
        onClose();
      }
      return;
    }

    if (result === "blocked") {
      // CORS blocked — try open popup anyway (may work via direct navigation)
      const opened = openCenteredPopup(market.url, `${market.name} - ${collection}/${tokenId}`);
      if (!opened) {
        // show iframe as fallback (will likely be blocked in iframe too)
        setIframeUrl(market.url);
      } else {
        onClose();
      }
      return;
    }

    // unavailable or error -> keep modal open and show error next to the button
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1400, background: "rgba(0,0,0,0.6)" }}
      onClick={() => onClose()}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(980px, 94vw)", maxWidth: "980px", height: "70vh", background: "#0b1220", borderRadius: 12, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 520px" }}>
        {/* LEFT: marketplaces chooser */}
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>Open token in marketplace</div>
          <div style={{ color: "#9aa4b2", fontSize: 13 }}>Choose a marketplace. The page will load only after you select one.</div>

          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 10 }}>
            {markets.map((m) => {
              const state = probeState[m.id];
              const disabled = state === "unavailable";
              const checking = state === "checking";
              return (
                <button
                  key={m.id}
                  onClick={() => handleSelect(m.id)}
                  disabled={checking || disabled}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "14px 16px",
                    borderRadius: 10,
                    background: disabled ? "#1b2430" : checking ? "#0e3b66" : "#081020",
                    color: disabled ? "#6e7a86" : "#e6eef8",
                    border: "1px solid rgba(255,255,255,0.03)",
                    cursor: checking || disabled ? "not-allowed" : "pointer",
                    textAlign: "left"
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: disabled ? "#6e7a86" : "#9aa4b2", marginTop: 4 }}>{m.url}</div>
                  </div>

                  <div style={{ minWidth: 120, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                    {checking ? (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <svg width="18" height="18" viewBox="0 0 50 50" style={{ animation: "spin 1s linear infinite" }}>
                          <circle cx="25" cy="25" r="20" fill="none" stroke="#9fb7ff" strokeWidth="5" strokeLinecap="round" strokeDasharray="31.4 31.4"></circle>
                        </svg>
                        <span style={{ fontSize: 13, color: "#9fb7ff" }}>Checking…</span>
                      </div>
                    ) : disabled ? (
                      <span style={{ fontSize: 13, color: "#b3bccc" }}>Not found</span>
                    ) : state === "available" ? (
                      <span style={{ fontSize: 13, color: "#9fffba" }}>Open</span>
                    ) : state === "blocked" ? (
                      <span style={{ fontSize: 13, color: "#ffd37a" }}>Blocked (CORS)</span>
                    ) : (
                      <span style={{ fontSize: 13, color: "#9aa4b2" }}>Tap to open</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
            <button onClick={() => { navigator.clipboard?.writeText(markets[0].url); }} style={{ padding: "10px 12px", borderRadius: 8, background: "#0b6cff", color: "#fff", border: "none" }}>
              Copy ElectroSwap link
            </button>
            <button onClick={() => onClose()} style={{ padding: "10px 12px", borderRadius: 8, background: "#18202a", color: "#cbd6e3", border: "1px solid rgba(255,255,255,0.03)" }}>
              Cancel
            </button>
          </div>
        </div>

        {/* RIGHT: iframe preview area (only shown after selection or fallback) */}
        <div style={{ background: "#000", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 12, background: "#071425", color: "#cfe0ff", fontWeight: 600 }}>
            {selectedMarket ? `${MARKETPLACES.find(mp => mp.id === selectedMarket)?.name} — ${collection}/${tokenId}` : "Preview"}
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            {iframeUrl ? (
              <iframe
                title="marketplace-preview"
                src={iframeUrl}
                style={{ width: "100%", height: "100%", border: 0 }}
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals"
              />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#888", padding: 20 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, marginBottom: 6 }}>{selectedMarket ? "Attempting to open..." : "Select a marketplace to open this token"}</div>
                  <div style={{ fontSize: 12, color: "#6e7a86" }}>{selectedMarket ? "If a popup is blocked, the page will be shown in this preview pane." : "No page will load until you choose a marketplace."}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* small CSS keyframes injected inline so spinner works without external CSS */}
      <style>{`@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
    </div>
  );
}