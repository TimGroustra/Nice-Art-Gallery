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
      const { data, error } = await supabase
        .from('avatars')
        .select('avatar_state')
        .eq('wallet_address', address)
        .single();

      if (data && data.avatar_state) {
        setAvatarState(data.avatar_state as unknown as AvatarState);
      }
      setIsLoading(false);
    };

    fetchConfig();
  }, [address]);

  const updateAvatarConfig = async (newState: AvatarState) => {
    if (!address) return;

    const { error } = await supabase
      .from('avatars')
      .upsert({
        wallet_address: address,
        avatar_state: newState as any,
        updated_at: new Date().toISOString(),
      });

    if (!error) {
      setAvatarState(newState);
      return true;
    }
    return false;
  };

  return { avatarState, updateAvatarConfig, isLoading };
}