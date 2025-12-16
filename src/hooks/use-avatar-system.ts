import { useState, useEffect, useCallback } from 'react';
import { AvatarState, INITIAL_AVATAR_STATE, NFTRef } from '@/avatar/AvatarState';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';

interface AvatarSystemResult {
  avatarState: AvatarState;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  saveAvatar: (newState: AvatarState) => Promise<void>;
  updateSlot: (category: keyof AvatarState, slot: string, nft: NFTRef | null) => void;
  validateAndRefetch: () => void;
}

/**
 * Placeholder for ownership check (since we don't have a server-side function for this yet).
 * In a real system, this would be an Edge Function call.
 */
async function ownsNFT(walletAddress: string, nft: NFTRef): Promise<boolean> {
    // For now, assume ownership is true if an NFT is referenced.
    // This needs to be replaced with actual blockchain check later.
    if (!nft) return true;
    
    // TODO: Implement actual blockchain ownership check here.
    // For now, we trust the client input during assignment.
    return true; 
}

/**
 * Validates the current avatar state against the user's wallet ownership.
 * Removes any items the user no longer owns.
 */
async function validateAvatar(
  state: AvatarState,
  walletAddress: string
): Promise<AvatarState> {
  const newState = JSON.parse(JSON.stringify(state)) as AvatarState;
  let changed = false;

  const checkCategory = async (category: 'wearables' | 'props') => {
    for (const slot in newState[category]) {
      const nft = newState[category][slot];
      if (nft) {
        const owned = await ownsNFT(walletAddress, nft);
        if (!owned) {
          (newState[category] as any)[slot] = null;
          changed = true;
          console.warn(`NFT in slot ${slot} removed due to failed ownership check.`);
        }
      }
    }
  };

  await checkCategory('wearables');
  await checkCategory('props');
  
  // Also check morphs/companions/effects if they use NFTRef
  if (newState.companions.pet && !(await ownsNFT(walletAddress, newState.companions.pet))) {
      newState.companions.pet = null;
      changed = true;
  }

  return changed ? newState : state;
}


export function useAvatarSystem(): AvatarSystemResult {
  const { address: walletAddress, isConnected } = useAccount();
  const [avatarState, setAvatarState] = useState<AvatarState>(INITIAL_AVATAR_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAvatar = useCallback(async (address: string) => {
    setIsLoading(true);
    setError(null);
    
    const { data, error: fetchError } = await supabase
      .from('avatars')
      .select('avatar_state')
      .eq('wallet_address', address)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "No rows found"
      console.error("Failed to fetch avatar state:", fetchError);
      setError("Failed to load avatar configuration.");
      setAvatarState(INITIAL_AVATAR_STATE);
    } else if (data) {
      const loadedState = data.avatar_state as AvatarState;
      // Validate ownership upon loading
      const validatedState = await validateAvatar(loadedState, address);
      setAvatarState(validatedState);
      if (validatedState !== loadedState) {
          // If validation changed the state, save the corrected state back
          await saveAvatar(validatedState, address);
      }
    } else {
      // No existing state, use initial state
      setAvatarState(INITIAL_AVATAR_STATE);
    }
    setIsLoading(false);
  }, []);
  
  const saveAvatar = useCallback(async (state: AvatarState, address: string) => {
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
    
    setAvatarState(state);
    toast.success("Avatar configuration saved!");
  }, []);

  useEffect(() => {
    if (walletAddress && isConnected) {
      fetchAvatar(walletAddress);
    } else {
      setAvatarState(INITIAL_AVATAR_STATE);
      setIsLoading(false);
    }
  }, [walletAddress, isConnected, fetchAvatar]);
  
  const updateSlot = useCallback((category: keyof AvatarState, slot: string, nft: NFTRef | null) => {
      setAvatarState(prev => {
          const newState = JSON.parse(JSON.stringify(prev)) as AvatarState;
          
          if (category === 'morphs' || category === 'companions' || category === 'effects') {
              (newState[category] as any)[slot] = nft;
          } else if (category === 'wearables' || category === 'props') {
              (newState[category] as any)[slot] = nft;
          }
          
          return newState;
      });
  }, []);
  
  const handleSave = useCallback(async (newState: AvatarState) => {
      if (walletAddress) {
          await saveAvatar(newState, walletAddress);
      } else {
          toast.error("Wallet not connected. Cannot save.");
      }
  }, [walletAddress, saveAvatar]);
  
  const validateAndRefetch = useCallback(() => {
      if (walletAddress) {
          fetchAvatar(walletAddress);
      }
  }, [walletAddress, fetchAvatar]);

  return {
    avatarState,
    isLoading,
    isSaving,
    error,
    saveAvatar: handleSave,
    updateSlot,
    validateAndRefetch,
  };
}