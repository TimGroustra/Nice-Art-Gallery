import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NFTRef } from '@/avatar/AvatarState';
import { Button } from '@/components/ui/button';
import { Image, Gem } from 'lucide-react';

interface NFTInventoryProps {
  ownedNFTs: NFTRef[];
  onSelect: (nft: NFTRef) => void;
}

// Mock data for owned NFTs since we don't have a hook to fetch them yet
const MOCK_OWNED_NFTS: NFTRef[] = [
    { chainId: 111111, contract: '0x1234...AABB', tokenId: '1' },
    { chainId: 111111, contract: '0x5678...CCDD', tokenId: '42' },
    { chainId: 111111, contract: '0x9012...EEFF', tokenId: '101' },
    { chainId: 111111, contract: '0x1234...AABB', tokenId: '2' },
    { chainId: 111111, contract: '0x5678...CCDD', tokenId: '43' },
];

const NFTInventory: React.FC<NFTInventoryProps> = ({ ownedNFTs, onSelect }) => {
  const nfts = ownedNFTs.length > 0 ? ownedNFTs : MOCK_OWNED_NFTS;
  
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>NFT Inventory</CardTitle>
        <CardDescription>Select an NFT to assign it to an avatar slot.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-full max-h-[600px]">
          <div className="p-4 space-y-3">
            {nfts.map((nft, index) => (
              <div 
                key={`${nft.contract}:${nft.tokenId}:${index}`} 
                className="flex items-center justify-between p-3 border rounded-lg bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer"
                onClick={() => onSelect(nft)}
              >
                <div className="flex items-center space-x-3">
                  <Image className="h-6 w-6 text-primary" />
                  <div>
                    <p className="font-medium text-sm">Token #{nft.tokenId}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                      {nft.contract.substring(0, 6)}...{nft.contract.substring(nft.contract.length - 4)}
                    </p>
                  </div>
                </div>
                <Button variant="secondary" size="sm">
                    Assign
                </Button>
              </div>
            ))}
            {nfts.length === 0 && (
                <div className="text-center text-muted-foreground py-10">
                    No NFTs found in your wallet.
                </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default NFTInventory;