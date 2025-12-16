import { useState, useEffect, useCallback } from 'react';
import { AvatarState, INITIAL_AVATAR_STATE, NFTRef } from '@/avatar/AvatarState';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { validateOwnership } from '@/avatar/OwnershipValidator';
import { useAvatarStateEditor } from './use-avatar-state-editor';

interface AvatarSystemResult {
  avatarState: AvatarState;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  saveAvatar: () => Promise<void>;
  updateSlot: (category: keyof AvatarState, slot: string, nft: NFTRef | null) => void;
  undo: () => void;
  canUndo: boolean;
  // The state setter is now exposed via the updateSlot/saveAvatar methods
}

export function useAvatarSystem(): AvatarSystemResult {
  const { address: walletAddress, isConnected } = useAccount();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Use the editor state hook internally
  const { 
      state: avatarState, 
      update: updateState, 
      undo, 
      canUndo 
  } = useAvatarStateEditor(INITIAL_AVATAR_STATE);

  const saveAvatarToDB = useCallback(async (state: AvatarState, address: string) => {
    setIsSaving(true);
    
    const { error: saveError } = await supabase
      .from('avatars')
      .upsert({
        wallet_address: address,
        avatar_state: state,
      }, { onConflict: 'wallet_address' });

    setIsSaving(false);

    if (saveError) {
      console.error("Failed to save avatar state:", saveError);
      toast.error("Failed to save avatar configuration.");
      return;
    }
    
    // Update the local state after successful save (already done by updateState, but ensures consistency)
    updateState(state);
    toast.success("Avatar configuration saved!");
  }, [updateState]);

  const fetchAvatar = useCallback(async (address: string) => {
    setIsLoading(true);
    setError(null);
    
    const { data, error: fetchError } = await supabase
      .from('avatars')
      .select('avatar_state')
      .eq('wallet_address', address)
      .single();

    let loadedState = INITIAL_AVATAR_STATE;

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "No rows found"
      console.error("Failed to fetch avatar state:", fetchError);
      setError("Failed to load avatar configuration.");
    } else if (data) {
      loadedState = data.avatar_state as AvatarState;
    }
    
    // Validate ownership upon loading
    const validatedState = await validateOwnership(loadedState, address);
    updateState(validatedState);
    
    if (validatedState !== loadedState) {
        // If validation changed the state, save the corrected state back
        await saveAvatarToDB(validatedState, address);
    }
    
    setIsLoading(false);
  }, [saveAvatarToDB, updateState]);
  
  useEffect(() => {
    if (walletAddress && isConnected) {
      fetchAvatar(walletAddress);
    } else {
      updateState(INITIAL_AVATAR_STATE);
      setIsLoading(false);
    }
  }, [walletAddress, isConnected, fetchAvatar, updateState]);
  
  const updateSlot = useCallback((category: keyof AvatarState, slot: string, nft: NFTRef | null) => {
      const newState = JSON.parse(JSON.stringify(avatarState)) as AvatarState;
      
      if (category === 'morphs' || category === 'companions' || category === 'effects') {
          (newState[category] as any)[slot] = nft;
      } else if (category === 'wearables' || category === 'props') {
          (newState[category] as any)[slot] = nft;
      }
      
      updateState(newState);
      toast.info(`Item assigned to ${slot}. Remember to save!`);
  }, [avatarState, updateState]);
  
  const handleSave = useCallback(async () => {
      if (walletAddress) {
          await saveAvatarToDB(avatarState, walletAddress);
      } else {
          toast.error("Wallet not connected. Cannot save.");
      }
  }, [avatarState, walletAddress, saveAvatarToDB]);

  return {
    avatarState,
    isLoading,
    isSaving,
    error,
    saveAvatar: handleSave,
    updateSlot,
    undo,
    canUndo,
  };
}