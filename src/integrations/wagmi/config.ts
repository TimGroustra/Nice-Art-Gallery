import { createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
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
// Note: You should replace the placeholder Project ID with your own from https://cloud.walletconnect.com
const WALLETCONNECT_PROJECT_ID = 'd8e06968909c98b4f4d3e89eea8e5a06';

export const wagmiConfig = createConfig({
  chains: [electroneum],
  connectors: [
    injected(),
    walletConnect({
      projectId: WALLETCONNECT_PROJECT_ID,
      showQrModal: true,
    }),
  ],
  transports: {
    [electroneum.id]: http(),
  },
});