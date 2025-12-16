import React, { useState, useCallback, useMemo } from 'react';
import { useAvatarSystem } from '@/hooks/use-avatar-system';
import { NFTRef, AvatarState } from '@/avatar/AvatarState';
import NFTInventory from './NFTInventory';
import AvatarPreview from './AvatarPreview';
import { SlotPanel } from './SlotPanel';
import { NFTUseModal } from './NFTUseModal';
import { OwnedNFT, NFTUse } from '@/avatar/editorTypes';
import { useOwnedNFTs } from '@/hooks/use-owned-nfts';
import { Button } from '@/components/ui/button';
import { Loader2, Undo2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';

// Define the mapping from NFTUse (user choice) to AvatarState category and slot
const USE_TO_SLOT_MAP: Record<NFTUse, { category: keyof AvatarState, slot: string }> = {
    tshirt: { category: 'wearables', slot: 'torso' },
    hoodie: { category: 'wearables', slot: 'torso' }, // Assuming hoodie uses the same slot as tshirt
    watch: { category: 'wearables', slot: 'wrist' }, // Simplified to 'wrist'
    hat: { category: 'wearables', slot: 'head' },
    glasses: { category: 'wearables', slot: 'face' },
    sword: { category: 'props', slot: 'handheld' },
    jar: { category: 'props', slot: 'handheld' },
    ball: { category: 'props', slot: 'handheld' },
    pet: { category: 'companions', slot: 'pet' },
    floating: { category: 'props', slot: 'floating' },
    palette: { category: 'morphs', slot: 'palette' },
    aura: { category: 'effects', slot: 'aura' },
};

const AvatarEditorUI: React.FC = () => {
  const { address: walletAddress, isConnected } = useAccount();
  const { 
      avatarState, 
      isLoading, 
      isSaving, 
      saveAvatar, 
      updateSlot, 
      undo, 
      canUndo 
  } = useAvatarSystem();
  
  const ownedNFTs = useOwnedNFTs();
  
  const [selectedNFT, setSelectedNFT] = useState<OwnedNFT | null>(null);

  const handleNFTSelect = useCallback((nft: OwnedNFT) => {
    setSelectedNFT(nft);
  }, []);

  const handleAssignment = useCallback((useAs: NFTUse) => {
    if (!selectedNFT || !walletAddress) {
      toast.error("Wallet not connected or NFT selection failed.");
      return;
    }
    
    const mapping = USE_TO_SLOT_MAP[useAs];
    if (!mapping) {
        toast.error("Invalid usage type selected.");
        return;
    }
    
    // Convert OwnedNFT (from inventory) to NFTRef (for state)
    const nftRef: NFTRef = {
        chainId: selectedNFT.chainId,
        contract: selectedNFT.contract,
        tokenId: selectedNFT.tokenId,
    };

    // Update the state via the hook
    updateSlot(mapping.category, mapping.slot, nftRef);
    
    setSelectedNFT(null);
  }, [selectedNFT, walletAddress, updateSlot]);
  
  const handleRemove = useCallback((category: keyof AvatarState, slot: string) => {
      updateSlot(category, slot, null);
  }, [updateSlot]);
  
  const handleSave = useCallback(() => {
      saveAvatar();
  }, [saveAvatar]);

  const renderSlotPanel = (category: keyof AvatarState, title: string) => {
    const slots = avatarState[category] as Record<string, NFTRef | null>;
    return (
        <SlotPanel
            title={title}
            slots={slots}
            onClear={(slot) => handleRemove(category, slot)}
        />
    );
  };

  if (!isConnected || !walletAddress) {
    return (
        <div className="flex items-center justify-center h-96">
            <p className="text-muted-foreground">Please connect your wallet to access the Avatar Editor.</p>
        </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3">Loading Avatar Configuration...</span>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-3xl font-bold">Avatar Editor</h1>
      
      <div className="flex justify-between items-center border-b pb-4">
        <div className="text-sm text-muted-foreground">
            Wallet: {walletAddress.substring(0, 6)}...{walletAddress.substring(walletAddress.length - 4)}
        </div>
        <div className="space-x-2">
            <Button onClick={undo} disabled={!canUndo || isSaving} variant="outline">
                <Undo2 className="h-4 w-4 mr-2" /> Undo
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Avatar'}
            </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-10rem)]">
        {/* Inventory */}
        <NFTInventory ownedNFTs={ownedNFTs} onSelect={handleNFTSelect} />
        
        {/* Preview */}
        <AvatarPreview state={avatarState} />
        
        {/* Slots */}
        <div className="space-y-4 overflow-y-auto">
            {renderSlotPanel('wearables', 'Wearables')}
            {renderSlotPanel('props', 'Props')}
            {renderSlotPanel('companions', 'Companions')}
            {renderSlotPanel('effects', 'Effects')}
            {renderSlotPanel('morphs', 'Morphs')}
        </div>
      </div>
      
      {/* Assignment Modal */}
      {selectedNFT && (
        <NFTUseModal
          nft={selectedNFT}
          onChoose={handleAssignment}
          onClose={() => setSelectedNFT(null)}
        />
      )}
    </div>
  );
};

export default AvatarEditorUI;