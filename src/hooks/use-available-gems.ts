import { useState, useEffect, useCallback } from 'react';
import { supabase } from "@/integrations/supabase/client";

interface AvailableGemsResult {
  availableTokens: string[];
  ownedTokens: string[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches the list of ElectroGem token IDs owned by the wallet that are not currently
 * used to lock a gallery panel.
 */
export function useAvailableGems(walletAddress: string | null | undefined): AvailableGemsResult {
  const [availableTokens, setAvailableTokens] = useState<string[]>([]);
  const [ownedTokens, setOwnedTokens] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGems = useCallback(async (address: string) => {
    if (!address) return;

    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('get-owned-gems', {
        method: 'POST',
        body: { walletAddress: address },
      });

      if (invokeError) {
        console.error("Supabase Edge Function invocation error:", invokeError);
        setError(invokeError.message);
        setAvailableTokens([]);
        setOwnedTokens([]);
        return;
      }
      
      const result = data as { availableTokens?: string[], ownedTokens?: string[], error?: string };

      if (result.error) {
        console.error("Edge Function returned error:", result.error);
        setError(result.error);
        setAvailableTokens([]);
        setOwnedTokens([]);
      } else {
        setAvailableTokens(result.availableTokens || []);
        setOwnedTokens(result.ownedTokens || []);
      }

    } catch (e) {
      console.error("Client side error fetching available gems:", e);
      setError("Network error or unexpected client failure.");
      setAvailableTokens([]);
      setOwnedTokens([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (walletAddress) {
      fetchGems(walletAddress);
    } else {
      setAvailableTokens([]);
      setOwnedTokens([]);
      setError(null);
    }
  }, [walletAddress, fetchGems]);

  return {
    availableTokens,
    ownedTokens,
    isLoading,
    error,
    refetch: () => {
      if (walletAddress) fetchGems(walletAddress);
    }
  };
}