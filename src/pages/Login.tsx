import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { Loader2, Wallet, LogIn, X } from 'lucide-react';
import { toast } from 'sonner';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { address, isConnected, isConnecting } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  // Redirect logic
  useEffect(() => {
    if (isConnected && address) {
      // If connected, redirect to config page (where balance check will happen)
      navigate('/gallery-config');
    }
  }, [isConnected, address, navigate]);

  const handleConnect = (connectorId: string) => {
    const connector = connectors.find(c => c.id === connectorId);
    if (connector) {
      connect({ connector });
    } else {
      toast.error("Connector not found.");
    }
  };

  const handleDisconnect = () => {
    disconnect();
    toast.info("Wallet disconnected.");
  };

  const injectedConnector = connectors.find(c => c.id === injected.id);
  const walletConnectConnector = connectors.find(c => c.id === walletConnect.id);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect Wallet</CardTitle>
          <CardDescription>
            Connect your wallet to verify ElectroGem ownership and access configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isConnected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-md bg-secondary">
                <div className="flex items-center space-x-2">
                  <Wallet className="h-5 w-5 text-primary" />
                  <span className="font-medium">
                    Connected: {address?.substring(0, 6)}...{address?.substring(address.length - 4)}
                  </span>
                </div>
                <Button variant="ghost" size="icon" onClick={handleDisconnect} title="Disconnect">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Button onClick={() => navigate('/gallery-config')} className="w-full">
                Continue to Configuration
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {isConnecting && (
                <div className="flex items-center justify-center space-x-2 text-primary">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Awaiting connection...</span>
                </div>
              )}
              
              {injectedConnector && (
                <Button 
                  onClick={() => handleConnect(injectedConnector.id)} 
                  className="w-full" 
                  disabled={isConnecting}
                >
                  <LogIn className="mr-2 h-4 w-4" /> Connect Injected Wallet (e.g., MetaMask)
                </Button>
              )}
              
              {walletConnectConnector && (
                <Button 
                  onClick={() => handleConnect(walletConnectConnector.id)} 
                  variant="outline" 
                  className="w-full" 
                  disabled={isConnecting}
                >
                  <Wallet className="mr-2 h-4 w-4" /> Connect WalletConnect
                </Button>
              )}

              <p className="text-xs text-muted-foreground text-center pt-2">
                Please ensure your wallet is set to the Electroneum network.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;