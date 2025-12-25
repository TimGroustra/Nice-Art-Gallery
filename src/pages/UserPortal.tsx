import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { Loader2, Wallet, LogIn, X, ArrowLeft, Settings, UserCircle, Gem, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAvailableGems } from '@/hooks/use-available-gems';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const REQUIRED_GEMS = 5;

const UserPortal: React.FC = () => {
  const navigate = useNavigate();
  const { address, isConnected, isConnecting } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const { ownedTokens, isLoading: isGemsLoading } = useAvailableGems(address);

  const handleConnect = (connectorId: string) => {
    const connector = connectors.find(c => c.id === connectorId);
    if (connector) {
      connect({ connector });
    }
  };

  const hasEnoughGems = ownedTokens.length >= REQUIRED_GEMS;

  const handleGalleryConfigClick = () => {
    if (!hasEnoughGems) {
      toast.error(`Access Denied: You need at least ${REQUIRED_GEMS} ElectroGems to configure the gallery.`);
      return;
    }
    navigate('/gallery-config');
  };

  const handleEditAvatarClick = () => {
    navigate('/avatar-config');
  };

  const injectedConnector = connectors.find(c => c.id === 'injected');

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
              {injectedConnector && (
                <Button 
                  onClick={() => handleConnect(injectedConnector.id)} 
                  className="w-full h-12 text-lg" 
                  disabled={isConnecting}
                >
                  <LogIn className="mr-2 h-5 w-5" /> Connect Wallet
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate('/')} className="w-full">
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
                  disabled={isGemsLoading}
                >
                  <Settings className="mr-4 h-5 w-5" />
                  <div className="flex flex-col items-start">
                    <span className="font-bold">Gallery Configuration</span>
                    <span className="text-[10px] opacity-70">Requires 5+ ElectroGems</span>
                  </div>
                  {isGemsLoading && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
                  {!isGemsLoading && !hasEnoughGems && <AlertTriangle className="ml-auto h-4 w-4 text-amber-500" />}
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

              {isConnected && !isGemsLoading && !hasEnoughGems && (
                <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-900">
                  <Gem className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800 dark:text-amber-400">Gems Required</AlertTitle>
                  <AlertDescription className="text-amber-700 dark:text-amber-500 text-xs">
                    You currently have {ownedTokens.length} ElectroGems. You need {REQUIRED_GEMS} to edit the gallery panels.
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