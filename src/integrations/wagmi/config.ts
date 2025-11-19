import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { defineChain } from 'viem';

// 1. Define the Electroneum chain
export const electroneum = defineChain({
  id: 111111,
  name: 'Electroneum',
  nativeCurrency: {
    decimals: 18,
    name: 'Electroneum',
    symbol: 'ETN',
  },
  rpcUrls: {
    default: { http: ['https://rpc.ankr.com/electroneum'] },
  },
  blockExplorers: {
    default: { name: 'Electroneum Explorer', url: 'https://blockexplorer.electroneum.com' },
  },
});

// 2. Create Wagmi config
export const wagmiConfig = createConfig({
  chains: [electroneum],
  connectors: [
    injected(),
    // WalletConnect connector removed as it requires a valid project ID
  ],
  transports: {
    [electroneum.id]: http(),
  },
});