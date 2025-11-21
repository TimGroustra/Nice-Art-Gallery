import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAccount, useDisconnect, useSwitchChain } from 'wagmi';
import { Loader2, Wallet, LogIn, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { electroneum } from '@/integrations/wagmi/config';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { address, isConnected, isConnecting, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  // This effect handles redirection and chain switching AFTER a connection is established.
  useEffect(() => {
    if (isConnected && address) {
      if (chain?.id !== electroneum.id) {
        // If connected but on the wrong chain, trigger the switch.
        // This is now a separate user action from the initial connect.
        switchChain({ chainId: electroneum.id });
      } else {
        // If connected and on the correct chain, proceed to the config page.
        toast.success("Wallet connected successfully!");
        navigate('/gallery-config');
      }
    }
  }, [isConnected, address, chain, navigate, switchChain]);

  // Minimal connect handler using the raw provider API to avoid extra permissions.
  const handleConnect = async () => {
    if (window.ethereum) {
      try {
        // This is the minimal, read-only request for the user's address.
        // It should only trigger the "View accounts" permission.
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        // Wagmi's `useAccount` hook will automatically detect the connection state change,
        // which then triggers the `useEffect` above.
      } catch (error: any) {
        // Handle user rejection
        if (error.code === 4001) {
          toast.info("Connection request was rejected by the user.");
        } else {
          console.error("Connection failed:", error);
          toast.error("Failed to connect wallet.");
        }
      }
    } else {
      toast.error("No browser wallet detected. Please install a wallet like MetaMask.");
    }
  };

  const handleDisconnect = () => {
    disconnect();
    toast.info("Wallet disconnected.");
  };

  const isWrongNetwork = isConnected && chain?.id !== electroneum.id;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect Wallet</CardTitle>
          <CardDescription>
            Connect your wallet to view your address and check permissions.
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

              {isWrongNetwork && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Wrong Network</AlertTitle>
                  <AlertDescription>
                    Please switch to the Electroneum network in your wallet to continue.
                  </AlertDescription>
                  <Button 
                    onClick={() => switchChain({ chainId: electroneum.id })} 
                    className="w-full mt-3"
                    disabled={isSwitchingChain}
                  >
                    {isSwitchingChain ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Switch to Electroneum
                  </Button>
                </Alert>
              )}

              {!isWrongNetwork && (
                <Button onClick={() => navigate('/gallery-config')} className="w-full">
                  Continue to Configuration
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {(isConnecting || isSwitchingChain) && (
                <div className="flex items-center justify-center space-x-2 text-primary">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>
                    {isConnecting ? 'Awaiting connection...' : 'Switching network...'}
                  </span>
                </div>
              )}
              
              <Button 
                onClick={handleConnect} 
                className="w-full" 
                disabled={isConnecting || isSwitchingChain}
              >
                <LogIn className="mr-2 h-4 w-4" /> Connect Browser Wallet
              </Button>
              
              <p className="text-xs text-muted-foreground text-center pt-2">
                This will only request permission to view your wallet address.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;