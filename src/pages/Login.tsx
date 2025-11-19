import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@/contexts/WalletContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { isAddress } from 'ethers';
import { toast } from 'sonner';

const Login: React.FC = () => {
  const { connectWallet, isConnected } = useWallet();
  const navigate = useNavigate();
  const [inputAddress, setInputAddress] = useState('');

  React.useEffect(() => {
    if (isConnected) {
      // If already connected, redirect to config page (where balance check will happen)
      navigate('/gallery-config');
    }
  }, [isConnected, navigate]);

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    const address = inputAddress.trim();
    if (!isAddress(address)) {
      toast.error("Please enter a valid Ethereum-style wallet address.");
      return;
    }
    connectWallet(address);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect Wallet</CardTitle>
          <CardDescription>
            Connect your wallet to access the gallery configuration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleConnect} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wallet-address">Wallet Address</Label>
              <Input
                id="wallet-address"
                placeholder="0x..."
                value={inputAddress}
                onChange={(e) => setInputAddress(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">
              Connect
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              (This simulates a wallet connection by accepting an address.)
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;