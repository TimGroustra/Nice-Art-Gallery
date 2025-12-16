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
  apply: (profile: AvatarProfile, styledNft: StyledNFTRef | NFTRef) => AvatarProfile;
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
  { 
    label: "T-Shirt (Torso)", 
    styleKey: 'tshirt', 
    apply: (p, n) => ({
      ...p,
      wearables: {
        ...p.wearables,
        torso: n as StyledNFTRef
      }
    })
  },
  { 
    label: "Hoodie (Torso)", 
    styleKey: 'hoodie', 
    apply: (p, n) => ({
      ...p,
      wearables: {
        ...p.wearables,
        torso: n as StyledNFTRef
      }
    })
  },
  { 
    label: "Hat (Head)", 
    styleKey: 'hat', 
    apply: (p, n) => ({
      ...p,
      wearables: {
        ...p.wearables,
        head: n as StyledNFTRef
      }
    })
  },
  { 
    label: "Glasses (Face)", 
    styleKey: 'glasses', 
    apply: (p, n) => ({
      ...p,
      wearables: {
        ...p.wearables,
        head: n as StyledNFTRef
      }
    })
  },
  { 
    label: "Watch (Left Wrist)", 
    styleKey: 'watch', 
    apply: (p, n) => ({
      ...p,
      wearables: {
        ...p.wearables,
        wristLeft: n as StyledNFTRef
      }
    })
  },
  { 
    label: "Watch (Right Wrist)", 
    styleKey: 'watch', 
    apply: (p, n) => ({
      ...p,
      wearables: {
        ...p.wearables,
        wristRight: n as StyledNFTRef
      }
    })
  },
  { 
    label: "Shoes (Feet)", 
    styleKey: 'shoes', 
    apply: (p, n) => ({
      ...p,
      wearables: {
        ...p.wearables,
        feet: n as StyledNFTRef
      }
    })
  },
  // Props
  { 
    label: "Sword (Right Hand)", 
    styleKey: 'sword', 
    apply: (p, n) => ({
      ...p,
      props: {
        ...p.props,
        handRight: n as StyledNFTRef
      }
    })
  },
  { 
    label: "Jar / Prop (Left Hand)", 
    styleKey: 'jar', 
    apply: (p, n) => ({
      ...p,
      props: {
        ...p.props,
        handLeft: n as StyledNFTRef
      }
    })
  },
  { 
    label: "Floating Gem (Prop)", 
    styleKey: 'gem', 
    apply: (p, n) => ({
      ...p,
      props: {
        ...p.props,
        floating: [...(p.props.floating || []), n as StyledNFTRef]
      }
    })
  },
  // Companions
  { 
    label: "Pet: Cat", 
    styleKey: 'cat', 
    apply: (p, n) => ({
      ...p,
      pet: n as StyledNFTRef
    })
  },
  { 
    label: "Pet: Panda", 
    styleKey: 'panda', 
    apply: (p, n) => ({
      ...p,
      pet: n as StyledNFTRef
    })
  },
  // Seeds (These don't need a styleKey, but we must handle the type conversion)
  { 
    label: "Body Seed (Morph)", 
    styleKey: 'seed', 
    apply: (p, n) => ({
      ...p,
      bodySeed: n as NFTRef
    })
  },
  { 
    label: "Palette Seed (Color)", 
    styleKey: 'seed', 
    apply: (p, n) => ({
      ...p,
      paletteSeed: n as NFTRef
    })
  },
  { 
    label: "Aura Effect", 
    styleKey: 'effect', 
    apply: (p, n) => ({
      ...p,
      aura: n as NFTRef
    })
  },
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
        return useOption.apply(profile, nftRef);
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