import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Image } from 'lucide-react';
import { OwnedNFT } from '@/avatar/editorTypes';

interface NFTInventoryProps {
  ownedNFTs: OwnedNFT[];
  onSelect: (nft: OwnedNFT) => void;
}

const NFTInventory: React.FC<NFTInventoryProps> = ({ ownedNFTs, onSelect }) => {
  
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>NFT Inventory</CardTitle>
        <CardDescription>Select an NFT to assign it to an avatar slot.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-full max-h-[600px]">
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ownedNFTs.map((nft, index) => (
              <div 
                key={`${nft.contract}:${nft.tokenId}:${index}`} 
                className="flex flex-col items-center p-2 border rounded-lg bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer group"
                onClick={() => onSelect(nft)}
              >
                <div className="w-full aspect-square bg-gray-800 rounded-md flex items-center justify-center mb-2">
                    {/* Placeholder for NFT image */}
                    <Image className="h-8 w-8 text-primary/50" />
                </div>
                <p className="font-medium text-xs">#{nft.tokenId}</p>
                <p className="text-[10px] text-muted-foreground truncate w-full text-center">
                  {nft.contract.substring(0, 6)}...
                </p>
                <Button variant="secondary" size="sm" className="mt-2 h-6 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    Assign
                </Button>
              </div>
            ))}
            {ownedNFTs.length === 0 && (
                <div className="col-span-full text-center text-muted-foreground py-10">
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