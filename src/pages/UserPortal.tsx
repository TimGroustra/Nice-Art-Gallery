"use client";

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { Loader2, Wallet, X, ArrowLeft, Settings, Gem, AlertTriangle, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useAvailableGems } from '@/hooks/use-available-gems';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const REQUIRED_GEMS = 1;

const UserPortal: React.FC = () => {
  const navigate = useNavigate();
  const { address, isConnected, isConnecting } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const { ownedTokens, isLoading: isGemsLoading, error: gemsError } = useAvailableGems(address);

  const handleConnect = (connector: any) => {
    connect({ connector });
  };

  const gemCount = ownedTokens.length;
  const hasEnoughGems = gemCount >= REQUIRED_GEMS;

  const handleGalleryConfigClick = () => {
    if (!hasEnoughGems) {
      toast.error(`Access Denied: You need at least ${REQUIRED_GEMS} ElectroGem to configure the gallery. You currently have ${gemCount}.`);
      return;
    }
    navigate('/gallery-config');
  };

  const uniqueConnectors = React.useMemo(() => {
    type ConnectorWithUI = typeof connectors[number] & { 
      displayName: string; 
      icon: React.ReactNode; 
      variant: "default" | "outline"; 
    };
    const finalConnectors: ConnectorWithUI[] = [];
    let injectedAdded = false;

    for (const connector of connectors) {
      const isMetaMask = connector.id === 'metaMask';
      const isInjected = connector.id === 'injected';
      const isWalletConnect = connector.id === 'walletConnect';

      if (isInjected || isMetaMask) {
        if (!injectedAdded) {
          finalConnectors.push({
            ...connector,
            displayName: 'Browser Extension Wallet',
            icon: <Wallet className="mr-3 h-5 w-5" />,
            variant: 'default',
          } as ConnectorWithUI);
          injectedAdded = true;
        }
      } else if (isWalletConnect) {
        finalConnectors.push({
          ...connector,
          displayName: 'WalletConnect (Mobile/QR)',
          icon: <Smartphone className="mr-3 h-5 w-5" />,
          variant: 'outline',
        } as ConnectorWithUI);
      }
    }

    const wcIndex = finalConnectors.findIndex(c => c.id === 'walletConnect');
    if (wcIndex > -1 && wcIndex !== finalConnectors.length - 1) {
      const wc = finalConnectors.splice(wcIndex, 1)[0];
      finalConnectors.push(wc);
    }

    return finalConnectors;
  }, [connectors]);


  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-lg shadow-xl border-t-4 border-t-primary">
        <CardHeader>
          <CardTitle className="text-2xl">User Portal</CardTitle>
          <CardDescription>
            {isConnected 
              ? "Manage your gallery experience and digital assets." 
              : "Connect your wallet to access your dashboard."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isConnected ? (
            <div className="space-y-4">
              {isConnecting && (
                <div className="flex items-center justify-center space-x-2 text-primary py-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Awaiting connection...</span>
                </div>
              )}
              
              <div className="grid gap-3">
                {uniqueConnectors.map((connector) => (
                  <Button 
                    key={connector.id}
                    onClick={() => handleConnect(connector)} 
                    className="w-full h-14 sm:h-12 text-base sm:text-lg justify-start px-4 sm:px-6" 
                    variant={connector.variant}
                    disabled={isConnecting}
                  >
                    {connector.icon}
                    {connector.displayName}
                  </Button>
                ))}
              </div>

              <Button variant="ghost" onClick={() => navigate('/')} className="w-full h-12">
                <ArrowLeft className="mr-2 h-4 w-4" /> Return to Gallery
              </Button>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="flex items-center justify-between p-4 border rounded-xl bg-secondary/50">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Connected Wallet</span>
                  <span className="font-mono text-sm">
                    {address?.substring(0, 6)}...{address?.substring(address.length - 4)}
                  </span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => disconnect()} title="Disconnect">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-4">
                <Button 
                  onClick={handleGalleryConfigClick} 
                  variant={hasEnoughGems ? "default" : "secondary"}
                  className="w-full h-16 justify-start px-6 relative overflow-hidden group border shadow-sm"
                  disabled={isGemsLoading}
                >
                  <Settings className="mr-4 h-6 w-6 text-primary group-hover:rotate-45 transition-transform" />
                  <div className="flex flex-col items-start">
                    <span className="font-black text-lg">Gallery Configuration</span>
                    <span className="text-xs opacity-70">
                      {isGemsLoading ? "Retrieving token IDs..." : `Owned: ${gemCount} / Need: ${REQUIRED_GEMS} Gem`}
                    </span>
                  </div>
                  {isGemsLoading && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
                  {!isGemsLoading && !hasEnoughGems && <AlertTriangle className="ml-auto h-5 w-5 text-amber-500" />}
                </Button>

                <Button 
                  variant="outline" 
                  onClick={() => navigate('/')} 
                  className="w-full h-14 justify-start px-6"
                >
                  <ArrowLeft className="mr-4 h-5 w-5" />
                  <span className="font-bold">Back to Gallery</span>
                </Button>
              </div>

              {gemsError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Gem Check Failed</AlertTitle>
                  <AlertDescription className="text-xs">
                    Could not verify ElectroGems. Please check your connection or try again.
                  </AlertDescription>
                </Alert>
              )}

              {isConnected && !isGemsLoading && !hasEnoughGems && !gemsError && (
                <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-900">
                  <Gem className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800 dark:text-amber-400">Gem Required</AlertTitle>
                  <AlertDescription className="text-amber-700 dark:text-amber-500 text-xs">
                    You currently have {gemCount} ElectroGems. You need at least {REQUIRED_GEMS} to edit the gallery panels.
                  </AlertDescription>
                </Alert>
              )}

              {isConnected && !isGemsLoading && gemCount > 0 && (
                <div className="p-4 border rounded-xl bg-primary/5 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Gem className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-tight">Owned Token IDs</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ownedTokens.map(id => (
                      <span key={id} className="px-2 py-1 bg-primary/10 rounded text-[10px] font-mono font-bold">
                        #{id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserPortal;