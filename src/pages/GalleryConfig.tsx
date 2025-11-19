import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import NftPreviewPane from '@/components/NftPreviewPane';
import { useWallet } from '@/contexts/WalletContext';
import { useGemBalance } from '@/hooks/use-gem-balance';
import { Loader2, Wallet, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface GalleryConfig {
  panel_key: string;
  collection_name: string | null;
  contract_address: string | null;
  default_token_id: number | null;
  show_collection: boolean | null;
}

const REQUIRED_GEM_BALANCE = 10;

const GalleryConfig = () => {
  const navigate = useNavigate();
  const { walletAddress, isConnected, disconnectWallet } = useWallet();
  const { balance, isLoading: isBalanceLoading, error: balanceError } = useGemBalance(walletAddress);

  const [panelKeys, setPanelKeys] = useState<string[]>([]);
  const [selectedPanelKey, setSelectedPanelKey] = useState<string>('');
  const [currentConfig, setCurrentConfig] = useState<Partial<GalleryConfig>>({});
  const [isLoading, setIsLoading] = useState(false);

  // 1. Authentication and Authorization Check
  useEffect(() => {
    if (!isConnected) {
      toast.warning("Please connect your wallet to access configuration.");
      navigate('/login');
      return;
    }
    
    if (!isBalanceLoading && balance !== null) {
      if (balance < REQUIRED_GEM_BALANCE) {
        toast.error(`Access denied. You need at least ${REQUIRED_GEM_BALANCE} ElectroGems to configure the gallery.`);
      }
    }
  }, [isConnected, isBalanceLoading, balance, navigate]);

  const isAuthorized = isConnected && !isBalanceLoading && balance !== null && balance >= REQUIRED_GEM_BALANCE;
  
  // 2. Fetch Panel Keys (only if authorized)
  useEffect(() => {
    if (!isAuthorized) return;

    const fetchPanelKeys = async () => {
      const { data, error } = await supabase.from('gallery_config').select('panel_key');
      if (error) {
        toast.error('Failed to fetch panel keys');
        console.error(error);
      } else {
        setPanelKeys(data.map((item) => item.panel_key).sort());
      }
    };
    fetchPanelKeys();
  }, [isAuthorized]);

  const fetchPanelConfig = useCallback(async (panelKey: string) => {
    if (!panelKey) {
      setCurrentConfig({});
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase.from('gallery_config').select('*').eq('panel_key', panelKey).single();
    if (error && error.code !== 'PGRST116') { // PGRST116 means 'no rows found'
      toast.error(`Failed to fetch config for ${panelKey}`);
      console.error(error);
      setCurrentConfig({ panel_key: panelKey, show_collection: true }); // Set key so user can create a new one
    } else if (data) {
      setCurrentConfig(data);
    } else {
      // No existing config found, initialize with defaults
      setCurrentConfig({ panel_key: panelKey, show_collection: true, default_token_id: 1 });
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isAuthorized && selectedPanelKey) {
      fetchPanelConfig(selectedPanelKey);
    }
  }, [selectedPanelKey, fetchPanelConfig, isAuthorized]);

  const handleSave = async () => {
    if (!isAuthorized) {
      toast.error('You are not authorized to save configurations.');
      return;
    }
    if (!selectedPanelKey) {
      toast.error('Please select a panel to configure.');
      return;
    }
    setIsLoading(true);
    
    // Ensure contract address is null if empty string
    const contractAddress = currentConfig.contract_address?.trim() || null;
    
    const dataToUpsert = {
      panel_key: selectedPanelKey,
      collection_name: currentConfig.collection_name || null,
      contract_address: contractAddress,
      default_token_id: currentConfig.default_token_id ? Number(currentConfig.default_token_id) : 1,
      show_collection: currentConfig.show_collection ?? true,
    };

    const { error } = await supabase.from('gallery_config').upsert(dataToUpsert, { onConflict: 'panel_key' });

    if (error) {
      toast.error('Failed to save configuration.');
      console.error(error);
    } else {
      toast.success('Configuration saved successfully! Restart the gallery to see changes.');
    }
    setIsLoading(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCurrentConfig((prev) => ({ ...prev, [name]: value }));
  };

  const handleSwitchChange = (checked: boolean) => {
    setCurrentConfig((prev) => ({ ...prev, show_collection: checked }));
  };

  const renderUnauthorizedState = () => (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Access Required</CardTitle>
          <CardDescription>Gallery configuration requires a connected wallet with sufficient ElectroGem balance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isBalanceLoading && (
            <div className="flex items-center space-x-2 text-primary">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Checking ElectroGem balance for {walletAddress?.substring(0, 6)}...</span>
            </div>
          )}
          {balanceError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Balance Check Error</AlertTitle>
              <AlertDescription>Could not verify balance: {balanceError}</AlertDescription>
            </Alert>
          )}
          {balance !== null && balance < REQUIRED_GEM_BALANCE && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Insufficient Balance</AlertTitle>
              <AlertDescription>
                You currently hold {balance} ElectroGems. You need at least {REQUIRED_GEM_BALANCE} to access configuration.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex justify-between items-center pt-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Connected: {walletAddress?.substring(0, 6)}...{walletAddress?.substring(walletAddress.length - 4)}
            </p>
            <Button variant="outline" onClick={disconnectWallet}>
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (!isAuthorized) {
    return renderUnauthorizedState();
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Configuration Card (Left Column) */}
        <Card>
          <CardHeader>
            <CardTitle>Gallery Configuration</CardTitle>
            <CardDescription>
              Editing panel configuration for wallet: {walletAddress?.substring(0, 6)}...
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-end">
              <Button variant="outline" onClick={disconnectWallet}>
                Disconnect Wallet
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="panel-select">Panel Key</Label>
              <Select onValueChange={setSelectedPanelKey} value={selectedPanelKey}>
                <SelectTrigger id="panel-select">
                  <SelectValue placeholder="Select a panel..." />
                </SelectTrigger>
                <SelectContent>
                  {panelKeys.map((key) => (
                    <SelectItem key={key} value={key}>
                      {key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedPanelKey && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="collection_name">Collection Name</Label>
                  <Input
                    id="collection_name"
                    name="collection_name"
                    value={currentConfig.collection_name || ''}
                    onChange={handleInputChange}
                    placeholder="e.g., My Awesome NFTs"
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contract_address">Contract Address</Label>
                  <Input
                    id="contract_address"
                    name="contract_address"
                    value={currentConfig.contract_address || ''}
                    onChange={handleInputChange}
                    placeholder="0x..."
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default_token_id">Default Token ID</Label>
                  <Input
                    id="default_token_id"
                    name="default_token_id"
                    type="number"
                    value={currentConfig.default_token_id || ''}
                    onChange={handleInputChange}
                    placeholder="e.g., 1"
                    disabled={isLoading}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="show_collection" className="text-base">Show Entire Collection</Label>
                    <p className="text-sm text-muted-foreground">
                      If enabled, users can browse all tokens. If disabled, only the default token will be shown.
                    </p>
                  </div>
                  <Switch
                    id="show_collection"
                    checked={currentConfig.show_collection ?? true}
                    onCheckedChange={handleSwitchChange}
                    disabled={isLoading}
                  />
                </div>
                <Button onClick={handleSave} disabled={isLoading}>
                  {isLoading ? 'Saving...' : 'Save Configuration'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
        
        {/* Preview Pane (Right Column) */}
        <div className="lg:sticky lg:top-8 lg:h-[calc(100vh-4rem)]">
          <NftPreviewPane
            contractAddress={currentConfig.contract_address || null}
            tokenId={currentConfig.default_token_id ? Number(currentConfig.default_token_id) : null}
          />
        </div>
      </div>
    </div>
  );
};

export default GalleryConfig;