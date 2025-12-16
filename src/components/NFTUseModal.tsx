import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OwnedNFT } from '@/hooks/use-owned-nfts';
import { AvatarProfile, NFTRef, StyledNFTRef } from '@/avatar/AvatarState';
import { MeshLibrary } from '@/avatar/MeshLibrary';

// Define the structure for assignment logic
interface UseOption {
    label: string;
    styleKey: string;
    apply: (profile: AvatarProfile, styledNft: StyledNFTRef) => AvatarProfile;
}

// Helper to create a StyledNFTRef from an OwnedNFT and a styleKey
const createStyledNFTRef = (nft: OwnedNFT, styleKey: string): StyledNFTRef => ({
    chainId: nft.chainId,
    contract: nft.contract,
    tokenId: nft.tokenId,
    styleKey: styleKey,
});

const USES: UseOption[] = [
  // Wearables
  { label: "T-Shirt (Torso)", styleKey: 'tshirt', apply: (p, n) => ({ ...p, wearables: { ...p.wearables, torso: n } }) },
  { label: "Hoodie (Torso)", styleKey: 'hoodie', apply: (p, n) => ({ ...p, wearables: { ...p.wearables, torso: n } }) },
  { label: "Hat (Head)", styleKey: 'hat', apply: (p, n) => ({ ...p, wearables: { ...p.wearables, head: n } }) },
  { label: "Glasses (Face)", styleKey: 'glasses', apply: (p, n) => ({ ...p, wearables: { ...p.wearables, head: n } }) }, // Using 'head' slot for glasses
  { label: "Watch (Left Wrist)", styleKey: 'watch', apply: (p, n) => ({ ...p, wearables: { ...p.wearables, wristLeft: n } }) },
  { label: "Watch (Right Wrist)", styleKey: 'watch', apply: (p, n) => ({ ...p, wearables: { ...p.wearables, wristRight: n } }) },
  { label: "Shoes (Feet)", styleKey: 'shoes', apply: (p, n) => ({ ...p, wearables: { ...p.wearables, feet: n } }) },
  
  // Props
  { label: "Sword (Right Hand)", styleKey: 'sword', apply: (p, n) => ({ ...p, props: { ...p.props, handRight: n } }) },
  { label: "Jar / Prop (Left Hand)", styleKey: 'jar', apply: (p, n) => ({ ...p, props: { ...p.props, handLeft: n } }) },
  { label: "Floating Gem (Prop)", styleKey: 'gem', apply: (p, n) => ({
      ...p,
      props: { ...p.props, floating: [...(p.props.floating || []), n] }
    })
  },
  
  // Companions
  { label: "Pet: Cat", styleKey: 'cat', apply: (p, n) => ({ ...p, pet: n }) },
  { label: "Pet: Panda", styleKey: 'panda', apply: (p, n) => ({ ...p, pet: n }) },
  
  // Seeds (These don't need a styleKey, but we must handle the type conversion)
  { label: "Body Seed (Morph)", styleKey: 'seed', apply: (p, n) => ({ ...p, bodySeed: { chainId: n.chainId, contract: n.contract, tokenId: n.tokenId } }) },
  { label: "Palette Seed (Color)", styleKey: 'seed', apply: (p, n) => ({ ...p, paletteSeed: { chainId: n.chainId, contract: n.contract, tokenId: n.tokenId } }) },
  { label: "Aura Effect", styleKey: 'effect', apply: (p, n) => ({ ...p, aura: { chainId: n.chainId, contract: n.contract, tokenId: n.tokenId } }) },
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
    
  const handleSelectUse = (useOption: UseOption) => {
      onApply((profile) => {
          // Seeds and Aura use NFTRef, others use StyledNFTRef
          if (useOption.styleKey === 'seed' || useOption.styleKey === 'effect') {
              const nftRef: NFTRef = {
                  chainId: nft.chainId,
                  contract: nft.contract,
                  tokenId: nft.tokenId,
              };
              return useOption.apply(profile, nftRef as StyledNFTRef); // Type assertion needed for generic apply function
          }
          
          const styledNft = createStyledNFTRef(nft, useOption.styleKey);
          return useOption.apply(profile, styledNft);
      });
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
                onClick={() => handleSelectUse(u)}
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