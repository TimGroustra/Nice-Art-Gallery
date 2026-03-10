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
// Using a default WalletConnect project ID that should work
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "4fd6a0632e861916567c57f4ede48ee4";

const connectors = [
  injected(),
];

// Always add WalletConnect with the default project ID
connectors.push(
  walletConnect({
    projectId: WALLETCONNECT_PROJECT_ID,
    showQrModal: true,
  })
);

export const wagmiConfig = createConfig({
  chains: [electroneum],
  connectors,
  transports: {
    [electroneum.id]: http(),
  },
});