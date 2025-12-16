import React, { useState, useCallback } from 'react';
import { useAvatarSystem } from '@/hooks/use-avatar-system';
import { NFTRef } from '@/avatar/AvatarState';
import NFTInventory from './NFTInventory';
import AvatarPreview from './AvatarPreview';
import CapabilitySlots from './CapabilitySlots';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { canAttach } from '@/avatar/AttachmentSystem';
import { Loader2 } from 'lucide-react';

// Define the categories and slots for the selection dialog
const CATEGORY_SLOTS: Record<string, string[]> = {
    wearables: ['head', 'face', 'torso', 'wrist', 'waist', 'feet'],
    props: ['handheld', 'floating'],
    companions: ['pet'],
    morphs: ['species', 'bodySeed', 'hair', 'face', 'palette'],
    effects: ['aura', 'trail'],
};

const AvatarEditorUI: React.FC = () => {
  const { avatarState, isLoading, isSaving, saveAvatar, updateSlot } = useAvatarSystem();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedNFT, setSelectedNFT] = useState<NFTRef | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof CATEGORY_SLOTS>('wearables');
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  const handleNFTSelect = useCallback((nft: NFTRef) => {
    setSelectedNFT(nft);
    setSelectedSlot(''); // Reset slot selection
    setIsDialogOpen(true);
  }, []);

  const handleAssignment = useCallback(() => {
    if (!selectedNFT || !selectedSlot) {
      toast.error("Please select both an NFT and a slot.");
      return;
    }
    
    // Basic capability check (simplified for single slot assignment)
    if (selectedCategory === 'wearables' || selectedCategory === 'props') {
        if (!canAttach(avatarState, selectedCategory, selectedSlot)) {
            toast.error(`Cannot attach to ${selectedSlot}. Slot limit reached.`);
            return;
        }
    }

    updateSlot(selectedCategory, selectedSlot, selectedNFT);
    setIsDialogOpen(false);
    setSelectedNFT(null);
    setSelectedSlot('');
    
    toast.info(`NFT assigned to ${selectedSlot}. Remember to save!`);
  }, [selectedNFT, selectedCategory, selectedSlot, avatarState, updateSlot]);
  
  const handleRemove = useCallback((category: keyof typeof CATEGORY_SLOTS, slot: string) => {
      updateSlot(category, slot, null);
      toast.info(`Item removed from ${slot}. Remember to save!`);
  }, [updateSlot]);
  
  const handleSave = useCallback(() => {
      saveAvatar(avatarState);
  }, [avatarState, saveAvatar]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3">Loading Avatar System...</span>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-3xl font-bold">Avatar Editor</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-10rem)]">
        <NFTInventory ownedNFTs={[]} onSelect={handleNFTSelect} />
        <AvatarPreview state={avatarState} />
        <CapabilitySlots 
            avatarState={avatarState} 
            onRemove={handleRemove} 
            onSave={handleSave}
            isSaving={isSaving}
        />
      </div>
      
      {/* Assignment Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign NFT to Slot</DialogTitle>
            <DialogDescription>
              Select where you want to use NFT #{selectedNFT?.tokenId} ({selectedNFT?.contract.substring(0, 6)}...).
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right">Category</label>
              <Select 
                value={selectedCategory} 
                onValueChange={(val) => {
                    setSelectedCategory(val as keyof typeof CATEGORY_SLOTS);
                    setSelectedSlot(''); // Reset slot when category changes
                }}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(CATEGORY_SLOTS).map(cat => (
                    <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right">Slot</label>
              <Select 
                value={selectedSlot} 
                onValueChange={setSelectedSlot}
                disabled={!selectedCategory}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select Slot" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_SLOTS[selectedCategory]?.map(slot => (
                    <SelectItem key={slot} value={slot} className="capitalize">{slot.replace(/([A-Z])/g, ' $1')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <Button onClick={handleAssignment} disabled={!selectedSlot}>
            Confirm Assignment
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AvatarEditorUI;