import { useWallet } from '@/hooks/useWallet';
import { Button } from '@/components/ui/button';

export const ConnectWalletButton = () => {
  const { connectWallet, disconnectWallet, account, isConnected } = useWallet();

  const truncateAddress = (address: string) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (isConnected && account) {
    return (
      <Button onClick={disconnectWallet} variant="secondary" className="bg-black/50 hover:bg-black/70 text-white border border-gray-700">
        {truncateAddress(account)}
      </Button>
    );
  }

  return (
    <Button onClick={connectWallet} className="bg-blue-600 hover:bg-blue-700 text-white">
      Connect Wallet
    </Button>
  );
};