import { ethers } from "ethers";

// --- IPFS and URL Utilities ---

const IPFS_GATEWAYS = [
  (p: string) => p.replace(/^ipfs:\/\/(ipfs\/)?/, "https://dweb.link/ipfs/"),
  (p: string) => p.replace(/^ipfs:\/\/(ipfs\/)?/, "https://cloudflare-ipfs.com/ipfs/"),
  (p: string) => p.replace(/^ipfs:\/\/(ipfs\/)?/, "https://ipfs.io/ipfs/")
];

export function normalizeUrl(url: string): string {
  if (!url) return url;
  url = url.trim();
  if (url.startsWith('ipfs://')) {
    // Try ordered gateways
    for (const g of IPFS_GATEWAYS) {
      const candidate = g(url);
      return candidate;
    }
  }
  return url;
}

export function hex64(id: number | string): string {
  // returns 64-len lowercase hex (no 0x)
  const bn = ethers.BigNumber.from(id.toString());
  let hex = bn.toHexString().replace(/^0x/, "");
  hex = hex.padStart(64, "0").toLowerCase();
  return hex;
}