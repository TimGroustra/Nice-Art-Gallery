import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

// Add this declaration to inform TypeScript about the window.ethereum object
declare global {
  interface Window {
    ethereum?: any;
  }
}

// Electroneum Network Details
const ELECTRONEUM_MAINNET = {
  chainId: '0x539', // 1337
  chainName: 'Electroneum Mainnet',
  nativeCurrency: {
    name: 'Electroneum',
    symbol: 'ETN',
    decimals: 18,
  },
  rpcUrls: ['https://rpc.ankr.com/electroneum'],
  blockExplorerUrls: ['https://blockexplorer.electroneum.com'],
};

export function useEthers() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
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
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      
      // Check network
      const network = await browserProvider.getNetwork();
      if (network.chainId !== BigInt(ELECTRONEUM_MAINNET.chainId)) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: ELECTRONEUM_MAINNET.chainId }],
          });
        } catch (switchError: any) {
          // This error code indicates that the chain has not been added to MetaMask.
          if (switchError.code === 4902) {
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [ELECTRONEUM_MAINNET],
              });
            } catch (addError: any) {
              console.error('Error adding Electroneum network:', addError);
              setError('Failed to add Electroneum network. Please check your wallet for a conflicting network configuration and try again.');
              // Re-throw to stop the connection process
              throw addError;
            }
          } else {
            // Re-throw other errors from switching chain
            throw switchError;
          }
        }
      }
      
      // Re-initialize provider after potential network switch
      const finalProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await finalProvider.send('eth_requestAccounts', []);
      const currentSigner = await finalProvider.getSigner();
      
      setProvider(finalProvider);
      setSigner(currentSigner);
      setAccount(accounts[0]);

    } catch (err: any) {
      console.error('Failed to connect wallet:', err);
      // If an error message hasn't already been set by our specific catch blocks, set a generic one.
      if (!error) {
        setError(err.message || 'An unknown error occurred while connecting the wallet.');
      }
    }
  }, [error]);

  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          setAccount(null);
          setSigner(null);
        } else {
          setAccount(accounts[0]);
          if (provider) {
            provider.getSigner().then(setSigner);
          }
        }
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      };
    }
  }, [provider]);

  return { provider, signer, account, error, connectWallet };
}