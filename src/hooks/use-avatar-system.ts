import { useState, useEffect, useCallback } from 'react';
import { AvatarProfile, INITIAL_AVATAR_PROFILE, NFTRef } from '@/avatar/AvatarState';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { validateOwnership } from '@/avatar/OwnershipValidator';
import { useAvatarStateEditor } from './use-avatar-state-editor';

interface AvatarSystemResult {
  avatarProfile: AvatarProfile;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  saveAvatar: () => Promise<void>;
  updateProfile: (newProfile: AvatarProfile) => void;
  undo: () => void;
  canUndo: boolean;
}

export function useAvatarSystem(): AvatarSystemResult {
  const { address: walletAddress, isConnected } = useAccount();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Use the editor state hook internally
  const { 
      state: avatarProfile, 
      update: updateState, 
      undo, 
      canUndo 
  } = useAvatarStateEditor(INITIAL_AVATAR_PROFILE);

  const saveAvatarToDB = useCallback(async (state: AvatarProfile, address: string) => {
    setIsSaving(true);
    
    const { error: saveError } = await supabase
      .from('avatars')
      .upsert({
        wallet_address: address,
        avatar_state: state, // Note: DB column is still 'avatar_state'
      }, { onConflict: 'wallet_address' });

    setIsSaving(false);

    if (saveError) {
      console.error("Failed to save avatar state:", saveError);
      toast.error("Failed to save avatar configuration.");
      return;
    }
    
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

    let loadedProfile = INITIAL_AVATAR_PROFILE;

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "No rows found"
      console.error("Failed to fetch avatar state:", fetchError);
      setError("Failed to load avatar configuration.");
    } else if (data) {
      // Cast the loaded data to the new profile type
      loadedProfile = data.avatar_state as AvatarProfile;
    }
    
    // Validate ownership upon loading
    const validatedProfile = await validateOwnership(loadedProfile, address);
    updateState(validatedProfile);
    
    if (validatedProfile !== loadedProfile) {
        // If validation changed the state, save the corrected state back
        await saveAvatarToDB(validatedProfile, address);
    }
    
    setIsLoading(false);
  }, [saveAvatarToDB, updateState]);
  
  useEffect(() => {
    if (walletAddress && isConnected) {
      fetchAvatar(walletAddress);
    } else {
      updateState(INITIAL_AVATAR_PROFILE);
      setIsLoading(false);
    }
  }, [walletAddress, isConnected, fetchAvatar, updateState]);
  
  const handleSave = useCallback(async () => {
      if (walletAddress) {
          await saveAvatarToDB(avatarProfile, walletAddress);
      } else {
          toast.error("Wallet not connected. Cannot save.");
      }
  }, [avatarProfile, walletAddress, saveAvatarToDB]);

  return {
    avatarProfile,
    isLoading,
    isSaving,
    error,
    saveAvatar: handleSave,
    updateProfile: updateState, // Expose the full update function
    undo,
    canUndo,
  };
}