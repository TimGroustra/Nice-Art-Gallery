"use client";

import React from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { injected } from 'wagmi/connectors';

// 0. Setup queryClient
const queryClient = new QueryClient();

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

// 1. Create wagmiConfig using injected connector
const config = createConfig({
  chains: [electroneum, mainnet],
  connectors: [
    injected(),
    // You can add other connectors here if needed, but injected is usually enough for local testing.
  ],
  transports: {
    [electroneum.id]: http(),
    [mainnet.id]: http(),
  },
});

// NOTE: We are removing createWeb3Modal and relying on custom UI/injected provider.

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}