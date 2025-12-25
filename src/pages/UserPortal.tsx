"use client";

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { Loader2, Wallet, LogIn, X, ArrowLeft, Settings, UserCircle, Gem, AlertTriangle, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useGemBalance } from '@/hooks/use-gem-balance';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const REQUIRED_GEMS = 5;

const UserPortal: React.FC = () => {
  const navigate = useNavigate();
  const { address, isConnected, isConnecting } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const { balance, isLoading: isBalanceLoading, error: balanceError } = useGemBalance(address);

  const handleConnect = (connector: any) => {
    connect({ connector });
  };

  const hasEnoughGems = (balance ?? 0) >= REQUIRED_GEMS;

  const handleGalleryConfigClick = () => {
    if (!hasEnoughGems) {
      toast.error(`Access Denied: You need at least ${REQUIRED_GEMS} ElectroGems to configure the gallery. You currently have ${balance ?? 0}.`);
      return;
    }
    navigate('/gallery-config');
  };

  const handleEditAvatarClick = () => {
    navigate('/avatar-config');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary">
        <CardHeader>
          <CardTitle className="text-2xl">User Portal</CardTitle>
          <CardDescription>
            {isConnected 
              ? "Manage your gallery experience and digital identity." 
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
                {connectors.map((connector) => (
                  <Button 
                    key={connector.id}
                    onClick={() => handleConnect(connector)} 
                    className="w-full h-12 text-lg justify-start px-6" 
                    variant={connector.id === 'walletConnect' ? 'outline' : 'default'}
                    disabled={isConnecting}
                  >
                    {connector.id === 'walletConnect' ? (
                      <Smartphone className="mr-3 h-5 w-5" />
                    ) : (
                      <LogIn className="mr-3 h-5 w-5" />
                    )}
                    {connector.name}
                  </Button>
                ))}
              </div>

              <Button variant="ghost" onClick={() => navigate('/')} className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" /> Return to Gallery
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
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

              <div className="grid gap-3">
                <Button 
                  onClick={handleGalleryConfigClick} 
                  variant={hasEnoughGems ? "default" : "secondary"}
                  className="w-full h-14 justify-start px-6 relative overflow-hidden group"
                  disabled={isBalanceLoading}
                >
                  <Settings className="mr-4 h-5 w-5" />
                  <div className="flex flex-col items-start">
                    <span className="font-bold">Gallery Configuration</span>
                    <span className="text-[10px] opacity-70">
                      {isBalanceLoading ? "Checking balance..." : `Owned: ${balance ?? 0} / Need: ${REQUIRED_GEMS}`}
                    </span>
                  </div>
                  {isBalanceLoading && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
                  {!isBalanceLoading && !hasEnoughGems && <AlertTriangle className="ml-auto h-4 w-4 text-amber-500" />}
                </Button>

                <Button 
                  onClick={handleEditAvatarClick} 
                  variant="outline" 
                  className="w-full h-14 justify-start px-6"
                >
                  <UserCircle className="mr-4 h-5 w-5" />
                  <span className="font-bold">Edit Avatar</span>
                </Button>

                <Button 
                  variant="ghost" 
                  onClick={() => navigate('/')} 
                  className="w-full h-14 justify-start px-6"
                >
                  <ArrowLeft className="mr-4 h-5 w-5" />
                  <span className="font-bold">Back to Gallery</span>
                </Button>
              </div>

              {balanceError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Balance Check Failed</AlertTitle>
                  <AlertDescription className="text-xs">
                    Could not verify ElectroGems. Please check your connection or try again.
                  </AlertDescription>
                </Alert>
              )}

              {isConnected && !isBalanceLoading && !hasEnoughGems && !balanceError && (
                <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-900">
                  <Gem className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800 dark:text-amber-400">Gems Required</AlertTitle>
                  <AlertDescription className="text-amber-700 dark:text-amber-500 text-xs">
                    You currently have {balance ?? 0} ElectroGems. You need {REQUIRED_GEMS} to edit the gallery panels.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserPortal;