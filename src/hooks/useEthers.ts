import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

// Add this declaration to inform TypeScript about the window.ethereum object
declare global {
  interface Window {
    ethereum?: any;
  }
}

// Electroneum RPC endpoint
const ELECTRONEUM_RPC_URL = 'https://rpc.ankr.com/electroneum';

// A static, read-only provider connected to the Electroneum network.
// This is used for all read operations, regardless of the network selected in the user's wallet.
const jsonRpcProvider = new ethers.JsonRpcProvider(ELECTRONEUM_RPC_URL);

export function useEthers() {
  // The provider for read-only operations is now static and always connected to Electroneum.
  const [provider] = useState<ethers.JsonRpcProvider>(jsonRpcProvider);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectWallet = useCallback(async () => {
    setError(null);
    if (typeof window.ethereum === 'undefined') {
      setError('MetaMask is not installed. Please install it to continue.');
      return;
    }

    try {
      // 1. Request account access. This is the only interaction needed.
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const userAccount = accounts[0];
      
      if (!userAccount) {
        throw new Error("No account selected.");
      }

      // 2. Get a signer for potential transactions.
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const currentSigner = await browserProvider.getSigner();
      
      setSigner(currentSigner);
      setAccount(userAccount);

    } catch (err: any) {
      console.error('Failed to connect wallet:', err);
      setError(err.message || 'An unknown error occurred while connecting the wallet.');
    }
  }, []);

  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          // User disconnected
          setAccount(null);
          setSigner(null);
        } else {
          // User changed account
          setAccount(accounts[0]);
          const browserProvider = new ethers.BrowserProvider(window.ethereum);
          browserProvider.getSigner().then(setSigner);
        }
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      };
    }
  }, []);

  return { provider, signer, account, error, connectWallet };
}