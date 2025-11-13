const PREFERRED_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';
const OLD_GATEWAY = 'https://ipfs.io/ipfs/';

/**
 * Normalizes an IPFS URL to use a preferred, reliable gateway.
 * Handles raw 'ipfs://' URIs and replaces outdated gateway URLs.
 * @param url The URL to normalize.
 * @returns The normalized URL using the preferred gateway.
 */
export function normalizeIpfsUrl(url: string): string {
  if (!url) return url;
  
  // If it's an old gateway URL, replace it with the preferred one.
  if (url.startsWith(OLD_GATEWAY)) {
    return url.replace(OLD_GATEWAY, PREFERRED_GATEWAY);
  }
  
  // If it's a raw ipfs:// URL, replace it.
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', PREFERRED_GATEWAY);
  }
  
  return url;
}