import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { ethers } from 'ethers';
import { showError } from '@/utils/toast';

const ELECTROGEMS_ADDRESS = "0xcff0d88Ed5311bAB09178b6ec19A464100880984";
const MIN_GEMS_REQUIRED = 5;
const ERC721_ABI = ["function balanceOf(address owner) view returns (uint256)"];

interface WalletState {
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  account: string | null;
  isConnected: boolean;
  electrogemBalance: number;
  hasEnoughGems: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

const WalletContext = createContext<WalletState | undefined>(undefined);

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [electrogemBalance, setElectrogemBalance] = useState(0);

  const disconnectWallet = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setElectrogemBalance(0);
  }, []);

  const checkBalance = useCallback(async (prov: ethers.BrowserProvider, acc: string) => {
    try {
      const contract = new ethers.Contract(ELECTROGEMS_ADDRESS, ERC721_ABI, prov);
      const balance = await contract.balanceOf(acc);
      const balanceNum = Number(balance);
      setElectrogemBalance(balanceNum);
    } catch (error) {
      console.error("Error checking ElectroGems balance:", error);
      setElectrogemBalance(0);
    }
  }, []);

  const connectWallet = useCallback(async () => {
    if (typeof window.ethereum === 'undefined') {
      showError("Please install a wallet like MetaMask!");
      return;
    }
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send("eth_requestAccounts", []);
      const currentSigner = await browserProvider.getSigner();
      
      setProvider(browserProvider);
      setSigner(currentSigner);
      setAccount(accounts[0]);
      await checkBalance(browserProvider, accounts[0]);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      disconnectWallet();
    }
  }, [checkBalance, disconnectWallet]);

  useEffect(() => {
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else if (accounts[0] !== account) {
        setAccount(accounts[0]);
        if (provider) {
          checkBalance(provider, accounts[0]);
        }
      }
    };

    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    };
  }, [account, provider, checkBalance, disconnectWallet]);

  const value = {
    provider,
    signer,
    account,
    isConnected: !!account,
    electrogemBalance,
    hasEnoughGems: electrogemBalance >= MIN_GEMS_REQUIRED,
    connectWallet,
    disconnectWallet,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};