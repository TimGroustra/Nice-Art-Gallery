"use client";

import React from 'react';
import { createWeb3Modal } from '@web3modal/wagmi/react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 0. Setup queryClient
const queryClient = new QueryClient();

// 1. Get projectId from https://cloud.walletconnect.com
const projectId = "a5853e742e5536f6f3798a87e3f65562"; // Replace with your own Project ID

// 2. Create wagmiConfig
const metadata = {
  name: 'Nice Art Gallery',
  description: 'Create your own custom NFT gallery rooms.',
  url: 'https://web3modal.com', // origin must match your domain & subdomain
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

// Define custom chain for Electroneum
const electroneum = {
  id: 52014,
  name: 'Electroneum',
  nativeCurrency: { name: 'Electroneum', symbol: 'ETN', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.ankr.com/electroneum'] },
  },
  blockExplorers: {
    default: { name: 'Electroneum Explorer', url: 'https://blockexplorer.electroneum.com' },
  },
} as const;

const config = createConfig({
  chains: [electroneum, mainnet],
  transports: {
    [electroneum.id]: http(),
    [mainnet.id]: http(),
  },
});

createWeb3Modal({
  wagmiConfig: config,
  projectId,
  enableAnalytics: true,
});

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}