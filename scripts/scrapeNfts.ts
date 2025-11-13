import { JsonRpcProvider, Contract } from "ethers";
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { ALL_CONTRACT_ADDRESSES, ALL_CONTRACT_NAMES_MAP } from '../src/config/galleryConfig';

// --- CONFIGURATION ---
const RPC_URL = "https://rpc.ankr.com/electroneum";
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'gallery_metadata_scraped.csv');
const CONCURRENT_REQUESTS = 5; // Number of parallel requests to make

// --- PROVIDER & ABI ---
const provider = new JsonRpcProvider(RPC_URL);
const erc721And1155Abi = [
  "function name() view returns (string)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function uri(uint256 _id) view returns (string)",
  "function totalSupply() view returns (uint256)"
];

// --- TYPES ---
interface NftMetadata {
  contract_address: string;
  token_id: number;
  title: string;
  description: string;
  image: string;
  source: string;
  attributes: string; // JSON stringified
}

// --- HELPER FUNCTIONS ---

function normalizeUrl(url: string): string {
  if (!url) return url;
  url = url.trim();
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  return url;
}

async function fetchTotalSupply(contractAddress: string): Promise<number> {
  const contract = new Contract(contractAddress, erc721And1155Abi, provider);
  try {
    const supply = await contract.totalSupply();
    return Number(supply);
  } catch (e) {
    console.warn(`Could not get totalSupply for ${contractAddress}. Assuming 100 tokens as a fallback.`);
    return 100; // Fallback for contracts without totalSupply or other errors
  }
}

async function fetchTokenUri(contract: Contract, tokenId: number): Promise<string> {
  try {
    return await contract.tokenURI(tokenId);
  } catch (e) {
    try {
      let uriTemplate = await contract.uri(tokenId);
      if (uriTemplate.includes('{id}')) {
        const hexId = tokenId.toString(16).padStart(64, '0');
        return uriTemplate.replace('{id}', hexId);
      }
      return uriTemplate.endsWith('/') ? `${uriTemplate}${tokenId}` : uriTemplate;
    } catch (e2) {
      throw new Error(`Failed to get tokenURI/uri for token ${tokenId}`);
    }
  }
}

async function getMetadataForToken(contractAddress: string, tokenId: number): Promise<NftMetadata | null> {
  try {
    const contract = new Contract(contractAddress, erc721And1155Abi, provider);
    const tokenUri = await fetchTokenUri(contract, tokenId);
    const metadataUrl = normalizeUrl(tokenUri);

    if (!metadataUrl) {
        console.error(`  - Token ${tokenId}: Empty metadata URL.`);
        return null;
    }

    const response = await fetch(metadataUrl);
    if (!response.ok) {
      console.error(`  - Token ${tokenId}: Failed to fetch metadata from ${metadataUrl} (Status: ${response.status})`);
      return null;
    }

    const json: any = await response.json();
    const imageUrl = normalizeUrl(json.image || json.image_url || json.imageURI || '');

    return {
      contract_address: contractAddress,
      token_id: tokenId,
      title: json.name || `Token #${tokenId}`,
      description: json.description || '(No description)',
      image: imageUrl,
      source: metadataUrl,
      attributes: JSON.stringify(json.attributes || []),
    };
  } catch (error: any) {
    console.error(`  - Token ${tokenId}: Error processing token. ${error.message}`);
    return null;
  }
}

function toCsv(data: NftMetadata[]): string {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => {
        return Object.values(row).map(value => {
            const strValue = String(value).replace(/"/g, '""'); // Escape double quotes
            return `"${strValue}"`; // Enclose all values in double quotes
        }).join(',');
    });
    return [headers, ...rows].join('\n');
}


// --- MAIN SCRAPER LOGIC ---

async function main() {
  console.log("Starting NFT metadata scrape...");
  const allMetadata: NftMetadata[] = [];

  for (const contractAddress of ALL_CONTRACT_ADDRESSES) {
    const collectionName = ALL_CONTRACT_NAMES_MAP[contractAddress] || contractAddress;
    console.log(`\nProcessing Collection: ${collectionName} (${contractAddress})`);

    const totalSupply = await fetchTotalSupply(contractAddress);
    console.log(`- Found total supply of ${totalSupply} tokens.`);

    const tokenIds = Array.from({ length: totalSupply }, (_, i) => i + 1);
    
    for (let i = 0; i < tokenIds.length; i += CONCURRENT_REQUESTS) {
        const batch = tokenIds.slice(i, i + CONCURRENT_REQUESTS);
        const promises = batch.map(tokenId => getMetadataForToken(contractAddress, tokenId));
        
        const results = await Promise.all(promises);
        
        results.forEach((metadata, index) => {
            if (metadata) {
                allMetadata.push(metadata);
                console.log(`  - Scraped Token ${batch[index]}`);
            }
        });
    }
  }

  console.log(`\nScraping complete. Total NFTs processed: ${allMetadata.length}`);
  
  if (allMetadata.length > 0) {
      const csvData = toCsv(allMetadata);
      fs.writeFileSync(OUTPUT_FILE, csvData);
      console.log(`Successfully wrote CSV data to: ${OUTPUT_FILE}`);
  } else {
      console.log("No metadata was scraped. CSV file not created.");
  }
}

main().catch(error => {
  console.error("An unexpected error occurred:", error);
  process.exit(1);
});