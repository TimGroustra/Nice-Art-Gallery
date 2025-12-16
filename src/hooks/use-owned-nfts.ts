import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

export interface OwnedNFT {
  chainId: number;
  contract: string;
  tokenId: string;
  image: string; // Added image field for UI display
}

// Mock data for owned NFTs (simulating fetch)
const MOCK_OWNED_NFTS: OwnedNFT[] = [
  { chainId: 111111, contract: '0x1234...AABB', tokenId: '1', image: '/placeholder.svg' },
  { chainId: 111111, contract: '0x5678...CCDD', tokenId: '42', image: '/placeholder.svg' },
  { chainId: 111111, contract: '0x9012...EEFF', tokenId: '101', image: '/placeholder.svg' },
  { chainId: 111111, contract: '0x1234...AABB', tokenId: '2', image: '/placeholder.svg' },
  { chainId: 111111, contract: '0x5678...CCDD', tokenId: '43', image: '/placeholder.svg' },
  { chainId: 111111, contract: '0x1234...AABB', tokenId: '3', image: '/placeholder.svg' },
  { chainId: 111111, contract: '0x5678...CCDD', tokenId: '44', image: '/placeholder.svg' },
  { chainId: 111111, contract: '0x9012...EEFF', tokenId: '102', image: '/placeholder.svg' },
];

/**
 * Hook to fetch owned NFTs for the connected wallet.
 * Currently uses mock data.
 */
export function useOwnedNFTs(): OwnedNFT[] {
  const { address: wallet } = useAccount();
  const [nfts, setNFTs] = useState<OwnedNFT[]>([]);

  useEffect(() => {
    if (!wallet) {
      setNFTs([]);
      return;
    }

    // Placeholder for actual API call:
    // fetch(`/api/nfts?wallet=${wallet}`)
    //   .then(r => r.json())
    //   .then(setNFTs)
    //   .catch(() => setNFTs([]));

    // Using mock data for immediate functionality
    setNFTs(MOCK_OWNED_NFTS);
  }, [wallet]);

  return nfts;
}