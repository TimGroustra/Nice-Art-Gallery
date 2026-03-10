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
// IMPORTANT: You MUST set VITE_WALLETCONNECT_PROJECT_ID in your environment variables.
// Get yours from https://cloud.walletconnect.com
// Without this environment variable, WalletConnect will not work.
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const connectors = [
  injected(),
];

// Only add WalletConnect if project ID is properly configured
if (WALLETCONNECT_PROJECT_ID && !WALLETCONNECT_PROJECT_ID.includes('your-walletconnect-project-id')) {
  connectors.push(
    walletConnect({
      projectId: WALLETCONNECT_PROJECT_ID,
      showQrModal: true,
    })
  );
} else {
  console.warn("WalletConnect Project ID missing or using placeholder. WalletConnect will be disabled.");
}

export const wagmiConfig = createConfig({
  chains: [electroneum],
  connectors,
  transports: {
    [electroneum.id]: http(),
  },
});