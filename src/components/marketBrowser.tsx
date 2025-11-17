import React, { useMemo, useState, useCallback } from "react";

type Marketplace = {
  id: string;
  name: string;
  description?: string;
  template: string; // template with {collection} and {tokenId}
  // optionally a flag to indicate tokenId formatting (decimal | hex64)
  tokenFormat?: "decimal" | "hex64" | "lowercaseHexNo0x";
};

const marketplaceTemplates: Record<string, Marketplace> = {
  electroswap: {
    id: "electroswap",
    name: "ElectroSwap",
    template:
      "https://app.electroswap.io/nfts/asset/{collection}/{tokenId}",
    tokenFormat: "decimal",
    description: "ElectroSwap item page"
  },
  panth: {
    id: "panth",
    name: "Panth.art",
    template:
      "https://panth.art/collections/{collection}/{tokenId}",
    tokenFormat: "decimal",
    description: "Panth collection token"
  },
  rarible: {
    id: "rarible",
    name: "Rarible",
    // Rarible uses lowercase address and tokenId separated by colon in examples
    template:
      "https://rarible.com/electroneum/items/{collection}:{tokenId}",
    tokenFormat: "decimal",
    description: "Rarible marketplace link"
  },
  opensea: {
    id: "opensea",
    name: "OpenSea",
    // OpenSea format for single asset (example for ethereum collection + token)
    template:
      "https://opensea.io/assets/{collection}/{tokenId}",
    tokenFormat: "decimal",
    description: "OpenSea item page"
  },
  // add more marketplaces here as needed
};

/** helper: return 64-char lowercase hex (no 0x) for ERC-1155 {id} replacement if needed */
function toHex64(value: string | number) {
  // using BigInt -> hex
  const n = BigInt(value.toString());
  let hex = n.toString(16);
  if (hex.length > 64) hex = hex.slice(-64); // truncate right-most if absurdly long
  return hex.padStart(64, "0").toLowerCase();
}

/** safe sanitize for addresses (very small basic check) */
function sanitizeAddress(addr: string) {
  if (!addr) return addr;
  const s = String(addr).trim();
  // if starts with 0x keep as-is, else return lowercase
  return s;
}

/** Build final URLs for a given collection + tokenId */
export function buildMarketplaceUrls(collection: string, tokenId: string | number) {
  const collectionSafe = sanitizeAddress(collection);
  const tokenStr = String(tokenId);

  const results = Object.values(marketplaceTemplates).map((m) => {
    let resolvedToken = tokenStr;

    if (m.tokenFormat === "hex64") {
      resolvedToken = toHex64(tokenStr);
    } else if (m.tokenFormat === "lowercaseHexNo0x") {
      // e.g. some marketplaces want lowercase hex without 0x but not padded
      try {
        const n = BigInt(tokenStr);
        resolvedToken = n.toString(16).toLowerCase();
      } catch {
        resolvedToken = tokenStr;
      }
    } else {
      // decimal - keep token as-is (string or number)
      resolvedToken = tokenStr;
    }

    // rarible example required lowercased collection address in the example
    const collectionForTemplate =
      m.id === "rarible" ? collectionSafe.toLowerCase() : collectionSafe;

    const url = m.template
      .replace(/\{collection\}/g, encodeURIComponent(collectionForTemplate))
      .replace(/\{tokenId\}/g, encodeURIComponent(resolvedToken));

    return {
      ...m,
      url,
    };
  });

  return results;
}

/** Try to open a centered popup. Returns true if popup opened. */
function openCenteredPopup(url: string, title = "Marketplace", w = 1100, h = 800) {
  // center calculation
  const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
  const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
  const width = window.innerWidth ?? document.documentElement.clientWidth ?? screen.width;
  const height = window.innerHeight ?? document.documentElement.clientHeight ?? screen.height;
  const left = width / 2 - w / 2 + dualScreenLeft;
  const top = height / 2 - h / 2 + dualScreenTop;

  const features = `scrollbars=yes, width=${w}, height=${h}, top=${top}, left=${left}`;
  const newWindow = window.open(url, title, features);
  if (newWindow) {
    try {
      newWindow.focus();
    } catch {}
    return true;
  }
  return false;
}

/* ============================
   React Modal component
   ============================ */

export function MarketBrowserModal({
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

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1200,
        background: "rgba(0,0,0,0.55)"
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1100px, 96vw)",
          height: "80vh",
          background: "#0f1720",
          borderRadius: 10,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "320px 1fr"
        }}
      >
        <div style={{ padding: 12, background: "#0b1220", overflowY: "auto" }}>
          <h3 style={{ margin: "6px 0 12px 0", color: "#fff" }}>Open on marketplace</h3>

          {marketplaces.map((m) => (
            <div key={m.id} style={{ marginBottom: 8 }}>
              <button
                onClick={() => {
                  // try popup first
                  const opened = openCenteredPopup(m.url, `${m.name} - ${collection}/${tokenId}`);
                  if (!opened) {
                    // popup blocked; show in iframe
                    setPreviewUrl(m.url);
                  } else {
                    // close modal if popup opened successfully
                    onClose();
                  }
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 6,
                  background: "#061126",
                  color: "#e6eef8",
                  border: "1px solid rgba(255,255,255,0.03)"
                }}
              >
                <div style={{ fontWeight: 600 }}>{m.name}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{m.description}</div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>{m.url}</div>
              </button>
            </div>
          ))}

          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(buildMarketplaceUrls(collection, tokenId)[0].url);
              }}
              style={{ padding: "8px 10px", borderRadius: 6, background: "#0b6cff", color: "#fff", border: "none" }}
            >
              Copy first marketplace link
            </button>
          </div>
        </div>

        <div style={{ background: "#000" }}>
          {previewUrl ? (
            <iframe
              title="marketplace-preview"
              src={previewUrl}
              style={{ width: "100%", height: "100%", border: 0 }}
              sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals"
            />
          ) : (
            <div style={{ color: "#888", padding: 16 }}>Select a marketplace to preview or open in popup.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================
   Hook to open modal from a panel
   ============================ */

export function useMarketBrowser() {
  const [state, setState] = useState<{ open: boolean; collection?: string; tokenId?: string | number }>({
    open: false,
  });

  const openFor = useCallback((collection: string, tokenId: string | number) => {
    setState({ open: true, collection, tokenId });
  }, []);

  const close = useCallback(() => {
    setState({ open: false });
  }, []);

  const ui = (
    <MarketBrowserModal
      collection={state.collection ?? ""}
      tokenId={state.tokenId ?? ""}
      open={state.open}
      onClose={close}
    />
  );

  return { openFor, ui, close };
}