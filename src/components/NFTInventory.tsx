import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Image } from 'lucide-react';
import { OwnedNFT } from '@/hooks/use-owned-nfts'; // Use the updated hook type

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
        <ScrollArea className="h-full max-h-[calc(100vh-15rem)]">
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ownedNFTs.map((nft, index) => (
              <div 
                key={`${nft.contract}:${nft.tokenId}:${index}`} 
                className="flex flex-col items-center p-2 border rounded-lg bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer group"
                onClick={() => onSelect(nft)}
              >
                <div className="w-full aspect-square bg-gray-800 rounded-md flex items-center justify-center mb-2 overflow-hidden">
                    {/* Display NFT image */}
                    <img 
                        src={nft.image} 
                        alt={`NFT #${nft.tokenId}`} 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            // Fallback to placeholder icon if image fails to load
                            (e.target as HTMLImageElement).style.display = 'none';
                            const parent = (e.target as HTMLImageElement).parentElement;
                            if (parent) {
                                parent.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image text-primary/50"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                            }
                        }}
                    />
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
                    No NFTs found in your wallet. (Using mock data)
                </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default NFTInventory;