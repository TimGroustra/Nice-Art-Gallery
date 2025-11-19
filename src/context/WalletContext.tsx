import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { ethers } from 'ethers';

const TOKEN_CONTRACT_ADDRESS = '0xcff0d88Ed5311bAB09178b6ec19A464100880984';
const MIN_BALANCE = 5;

const ERC721_ABI = [
  "function balanceOf(address owner) view returns (uint256)"
];

interface WalletContextType {
  address: string | null;
  balance: number;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  canEnter: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const checkBalance = async (provider: ethers.BrowserProvider, walletAddress: string) => {
    try {
      const contract = new ethers.Contract(TOKEN_CONTRACT_ADDRESS, ERC721_ABI, provider);
      const balanceBigInt = await contract.balanceOf(walletAddress);
      const balanceNum = Number(balanceBigInt);
      setBalance(balanceNum);
      if (balanceNum < MIN_BALANCE) {
        setError(`You need at least ${MIN_BALANCE} tokens to enter. You have ${balanceNum}.`);
      }
    } catch (e) {
      console.error("Error checking balance:", e);
      setError("Could not verify your token balance.");
      setBalance(0);
    }
  };

  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      setError("Please install MetaMask!");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const walletAddress = await signer.getAddress();
      
      setAddress(walletAddress);
      await checkBalance(provider, walletAddress);
    } catch (e: any) {
      console.error("Error connecting wallet:", e);
      setError(e.message || "Failed to connect wallet.");
      setAddress(null);
      setBalance(0);
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectWallet = () => {
    setAddress(null);
    setBalance(0);
    setError(null);
  };

  useEffect(() => {
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else if (accounts[0] !== address) {
        connectWallet();
      }
    };

    if (window.ethereum) {
      // @ts-ignore
      window.ethereum.on('accountsChanged', handleAccountsChanged);
    }

    return () => {
      if (window.ethereum) {
        // @ts-ignore
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    };
  }, [address]);

  const isConnected = !!address;
  const canEnter = isConnected && balance >= MIN_BALANCE;

  return (
    <WalletContext.Provider value={{ address, balance, isConnected, isLoading, error, canEnter, connectWallet, disconnectWallet }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};