import { useState, useEffect, useCallback } from 'react';
import { supabase } from "@/integrations/supabase/client";

interface BalanceResult {
  balance: number | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Checks the ElectroGem balance for a given wallet address using a serverless Edge Function.
 */
export function useGemBalance(walletAddress: string | null): BalanceResult {
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async (address: string) => {
    if (!address) return;

    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('check-gem-balance', {
        method: 'POST',
        body: { walletAddress: address },
      });

      if (invokeError) {
        console.error("Supabase Edge Function invocation error:", invokeError);
        setError(invokeError.message);
        setBalance(null);
        return;
      }
      
      const result = data as { balance?: number, error?: string };

      if (result.error) {
        console.error("Edge Function returned error:", result.error);
        setError(result.error);
        setBalance(null);
      } else if (result.balance !== undefined) {
        setBalance(result.balance);
      } else {
        setError("Unexpected response from server.");
        setBalance(null);
      }

    } catch (e) {
      console.error("Client side error checking balance:", e);
      setError("Network error or unexpected client failure.");
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (walletAddress) {
      fetchBalance(walletAddress);
    } else {
      setBalance(null);
      setError(null);
    }
  }, [walletAddress, fetchBalance]);

  return {
    balance,
    isLoading,
    error,
    refetch: () => {
      if (walletAddress) fetchBalance(walletAddress);
    }
  };
}