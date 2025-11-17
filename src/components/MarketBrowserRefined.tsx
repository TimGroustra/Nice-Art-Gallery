import React, { useState, useMemo, useEffect, useRef } from "react";
import { showError } from "@/utils/toast";
import { probeMarketplaceServerSide, ProbeStatus } from "@/utils/marketProbeClient";

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
    id: "rarible",
    name: "Rarible",
    template: "https://rarible.com/electroneum/items/{collection}:{tokenId}",
  },
  {
    id: "panth",
    name: "Panth.art",
    template: "https://panth.art/collections/{collection}/{tokenId}",
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
  const [probeState, setProbeState] = useState<Record<string, ProbeStatus>>({});
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // Effect to trigger server-side probing when the modal opens
  useEffect(() => {
    if (!open) {
      setProbeState({});
      return;
    }

    // Set all to checking initially
    const initialStates: Record<string, ProbeStatus> = {};
    markets.forEach(m => initialStates[m.id] = "checking");
    setProbeState(initialStates);

    markets.forEach(market => {
      probeMarketplaceServerSide(market.id, collection, tokenId).then((res) => {
        if (mounted.current) {
          setProbeState(prev => ({ ...prev, [market.id]: res.status }));
          if (res.status === "error") {
            console.error(`Probe error for ${market.name}:`, res.reason);
          }
        }
      });
    });
  }, [open, collection, tokenId, markets]);

  // When user selects a marketplace button -> open page immediately if available/error/blocked
  function handleSelect(marketId: string) {
    const market = markets.find((m) => m.id === marketId);
    if (!market) return;
    
    const state = probeState[marketId];
    
    // If we are still checking, do nothing
    if (state === "checking") return;

    // If unavailable or error, show error and stop
    if (state === "unavailable" || state === "error") {
      showError(`${market.name} reported this token is unavailable or an error occurred during check.`);
      return;
    }

    // If available, open the popup
    const opened = openCenteredPopup(market.url, `${market.name} - ${collection}/${tokenId}`);
    if (opened) {
      onClose();
    } else {
      showError("Popup blocked. Please allow popups for this site.");
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1400, background: "rgba(0,0,0,0.6)" }}
      onClick={() => onClose()}
    >
      <div 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          width: "min(500px, 94vw)", 
          maxWidth: "500px", 
          height: "auto", 
          background: "#0b1220", 
          borderRadius: 12, 
          overflow: "hidden" 
        }}
      >
        {/* LEFT: marketplaces chooser */}
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>View NFT in Marketplace</div>
          <div style={{ color: "#9aa4b2", fontSize: 13 }}>Choose a marketplace to open this token.</div>

          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 10 }}>
            {markets.map((m) => {
              const state = probeState[m.id];
              // Disable if unavailable OR error
              const disabled = state === "unavailable" || state === "error";
              const checking = state === "checking" || state === undefined;
              
              let statusText = "Tap to open";
              let statusColor = "#9aa4b2";

              if (checking) {
                statusText = "Checking…";
                statusColor = "#9fb7ff";
              } else if (state === "unavailable") {
                statusText = "Not found";
                statusColor = "#6e7a86";
              } else if (state === "available") {
                statusText = "Available";
                statusColor = "#9fffba";
              } else if (state === "error") {
                statusText = "Error"; // Changed text from "Error (Try anyway)"
                statusColor = "#ff7a7a"; // Changed color to red for error
              }

              return (
                <button
                  key={m.id}
                  onClick={() => handleSelect(m.id)}
                  // Disable if checking OR disabled (unavailable/error)
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
                    <div style={{ fontSize: 12, color: disabled ? "#6e7a86" : "#9aa4b2", marginTop: 4, wordBreak: 'break-all' }}>{m.url}</div>
                  </div>

                  <div style={{ minWidth: 120, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                    {checking ? (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <svg width="18" height="18" viewBox="0 0 50 50" style={{ animation: "spin 1s linear infinite" }}>
                          <circle cx="25" cy="25" r="20" fill="none" stroke="#9fb7ff" strokeWidth="5" strokeLinecap="round" strokeDasharray="31.4 31.4"></circle>
                        </svg>
                        <span style={{ fontSize: 13, color: statusColor }}>{statusText}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 13, color: statusColor }}>{statusText}</span>
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
      </div>

      {/* small CSS keyframes injected inline so spinner works without external CSS */}
      <style>{`@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
    </div>
  );
}