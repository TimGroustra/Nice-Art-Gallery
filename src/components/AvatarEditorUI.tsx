import React, { useState, useCallback } from 'react';
import { useAvatarSystem } from '@/hooks/use-avatar-system';
import { AvatarProfile } from '@/avatar/AvatarState';
import NFTInventory from './NFTInventory';
import AvatarPreview from './AvatarPreview';
import { SlotInspector } from './SlotInspector';
import { NFTUseModal } from './NFTUseModal';
import { OwnedNFT } from '@/hooks/use-owned-nfts';
import { useOwnedNFTs } from '@/hooks/use-owned-nfts';
import { Button } from '@/components/ui/button';
import { Loader2, Undo2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';

const AvatarEditorUI: React.FC = () => {
  const { address: walletAddress, isConnected } = useAccount();
  const { 
      avatarProfile, 
      isLoading, 
      isSaving, 
      saveAvatar, 
      updateProfile, 
      undo, 
      canUndo 
  } = useAvatarSystem();
  
  const ownedNFTs = useOwnedNFTs();
  
  const [selectedNFT, setSelectedNFT] = useState<OwnedNFT | null>(null);

  const handleNFTSelect = useCallback((nft: OwnedNFT) => {
    setSelectedNFT(nft);
  }, []);

  const handleAssignment = useCallback((applyFn: (profile: AvatarProfile) => AvatarProfile) => {
    if (!walletAddress) {
      toast.error("Wallet not connected.");
      return;
    }
    
    const newProfile = applyFn(avatarProfile);
    updateProfile(newProfile);
    
    setSelectedNFT(null);
  }, [avatarProfile, walletAddress, updateProfile]);
  
  const handleSave = useCallback(() => {
      saveAvatar();
  }, [saveAvatar]);

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
        <AvatarPreview profile={avatarProfile} />
        
        {/* Slots */}
        <SlotInspector profile={avatarProfile} onChange={updateProfile} />
      </div>
      
      {/* Assignment Modal */}
      {selectedNFT && (
        <NFTUseModal
          nft={selectedNFT}
          onApply={handleAssignment}
          onClose={() => setSelectedNFT(null)}
        />
      )}
    </div>
  );
};

export default AvatarEditorUI;