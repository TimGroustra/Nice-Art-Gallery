import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { defineChain } from 'viem';
import { walletConnect } from '@wagmi/connectors/walletConnect';

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
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "4fd6a0632e861916567c57f4ede48ee4";

const connectors = [
  injected(),
  walletConnect({
    projectId: WALLETCONNECT_PROJECT_ID,
    showQrModal: true,
  })
];

export const wagmiConfig = createConfig({
  chains: [electroneum],
  connectors,
  transports: {
    [electroneum.id]: http(),
  },
});