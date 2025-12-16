import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OwnedNFT } from '@/hooks/use-owned-nfts';
import { AvatarProfile, NFTRef } from '@/avatar/AvatarState';

// Define the structure for assignment logic
interface UseOption {
    label: string;
    apply: (profile: AvatarProfile, nft: NFTRef) => AvatarProfile;
}

const USES: UseOption[] = [
  { label: "T-Shirt (Torso)", apply: (p, n) => ({ ...p, wearables: { ...p.wearables, torso: n } }) },
  { label: "Hat (Head)", apply: (p, n) => ({ ...p, wearables: { ...p.wearables, head: n } }) },
  { label: "Watch (Left Wrist)", apply: (p, n) => ({ ...p, wearables: { ...p.wearables, wristLeft: n } }) },
  { label: "Watch (Right Wrist)", apply: (p, n) => ({ ...p, wearables: { ...p.wearables, wristRight: n } }) },
  { label: "Shoes (Feet)", apply: (p, n) => ({ ...p, wearables: { ...p.wearables, feet: n } }) },
  { label: "Sword (Right Hand)", apply: (p, n) => ({ ...p, props: { ...p.props, handRight: n } }) },
  { label: "Jar / Prop (Left Hand)", apply: (p, n) => ({ ...p, props: { ...p.props, handLeft: n } }) },
  { label: "Pet Companion", apply: (p, n) => ({ ...p, pet: n }) },
  { label: "Floating Item (Prop)", apply: (p, n) => ({
      ...p,
      props: { ...p.props, floating: [...(p.props.floating || []), n] }
    })
  },
  { label: "Aura Effect", apply: (p, n) => ({ ...p, aura: n }) },
  { label: "Body Seed (Morph)", apply: (p, n) => ({ ...p, bodySeed: n }) },
  { label: "Palette Seed (Color)", apply: (p, n) => ({ ...p, paletteSeed: n }) }
];

export function NFTUseModal({
  nft,
  onApply,
  onClose
}: {
  nft: OwnedNFT;
  onApply: (applyFn: (profile: AvatarProfile) => AvatarProfile) => void;
  onClose: () => void;
}) {
    
  // Convert OwnedNFT (which includes image) to NFTRef (runtime state)
  const nftRef: NFTRef = {
      chainId: nft.chainId,
      contract: nft.contract,
      tokenId: nft.tokenId,
  };

  return (
    <Dialog open={!!nft} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Use NFT #{nft.tokenId} as...</DialogTitle>
          <DialogDescription>
            Select how you want to apply this NFT to your avatar profile.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto p-2">
          {USES.map(u => (
            <Card 
                key={u.label} 
                className="p-4 text-center cursor-pointer hover:bg-accent transition-colors"
                onClick={() => onApply((profile) => u.apply(profile, nftRef))}
            >
                <div className="text-sm font-medium">{u.label}</div>
            </Card>
          ))}
        </div>
        
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </DialogContent>
    </Dialog>
  );
}