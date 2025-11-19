import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { isAddress } from 'ethers';
import { toast } from 'sonner';

interface WalletContextType {
  walletAddress: string | null;
  isConnected: boolean;
  connectWallet: (address: string) => void;
  disconnectWallet: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  const connectWallet = useCallback((address: string) => {
    if (!isAddress(address)) {
      toast.error("Invalid wallet address format.");
      return;
    }
    setWalletAddress(address);
    toast.success("Wallet connected successfully.");
  }, []);

  const disconnectWallet = useCallback(() => {
    setWalletAddress(null);
    toast.info("Wallet disconnected.");
  }, []);

  const isConnected = !!walletAddress;

  return (
    <WalletContext.Provider value={{ walletAddress, isConnected, connectWallet, disconnectWallet }}>
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