import React from 'react';
import { NFTUse, OwnedNFT } from "@/avatar/editorTypes";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const OPTIONS: NFTUse[] = [
  "tshirt",
  "hoodie",
  "watch",
  "hat",
  "glasses",
  "sword",
  "jar",
  "ball",
  "pet",
  "floating",
  "palette",
  "aura"
];

export function NFTUseModal({
  nft,
  onChoose,
  onClose
}: {
  nft: OwnedNFT;
  onChoose: (use: NFTUse) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!nft} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Use NFT as...</DialogTitle>
          <DialogDescription>
            Select how you want to apply Token #{nft.tokenId} to your avatar.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-3 gap-3 max-h-[400px] overflow-y-auto p-2">
          {OPTIONS.map(opt => (
            <Card 
                key={opt} 
                className="p-2 text-center cursor-pointer hover:bg-secondary transition-colors"
                onClick={() => onChoose(opt)}
            >
                <div className="text-sm font-medium capitalize">{opt.replace(/([A-Z])/g, ' $1')}</div>
            </Card>
          ))}
        </div>
        
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </DialogContent>
    </Dialog>
  );
}