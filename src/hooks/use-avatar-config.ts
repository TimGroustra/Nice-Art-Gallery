import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from 'wagmi';

export interface AvatarState {
  type: 'silhouette' | 'rpm';
  url?: string;
  enabled: boolean;
}

export function useAvatarConfig() {
  const { address } = useAccount();
  const [avatarState, setAvatarState] = useState<AvatarState>({
    type: 'silhouette',
    enabled: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setIsLoading(false);
      return;
    }

    const fetchConfig = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('avatars')
          .select('avatar_state')
          .eq('wallet_address', address.toLowerCase())
          .maybeSingle();

        if (error) {
          console.error("Error fetching avatar config:", error);
        } else if (data && data.avatar_state) {
          setAvatarState(data.avatar_state as unknown as AvatarState);
        }
      } catch (err) {
        console.error("Unexpected error fetching avatar config:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, [address]);

  const updateAvatarConfig = async (newState: AvatarState) => {
    if (!address) {
      console.warn("Cannot update avatar config: No wallet connected.");
      return false;
    }

    const lowerAddress = address.toLowerCase();

    try {
      // 1. Ensure profile exists first (to satisfy foreign key constraint)
      const { data: profile } = await supabase
        .from('profiles')
        .select('wallet_address')
        .eq('wallet_address', lowerAddress)
        .maybeSingle();

      if (!profile) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({ wallet_address: lowerAddress });
        
        if (profileError) {
          console.error("Error creating initial profile:", profileError);
          return false;
        }
      }

      // 2. Now upsert the avatar configuration
      const { error } = await supabase
        .from('avatars')
        .upsert({
          wallet_address: lowerAddress,
          avatar_state: newState as any,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'wallet_address' });

      if (error) {
        console.error("Supabase error updating avatar config:", error);
        return false;
      }
      
      setAvatarState(newState);
      return true;
    } catch (err) {
      console.error("Unexpected error updating avatar config:", err);
      return false;
    }
  };

  return { avatarState, updateAvatarConfig, isLoading };
}