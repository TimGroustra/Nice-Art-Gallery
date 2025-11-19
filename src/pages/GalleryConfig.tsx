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
import { useGemBalance } from '@/hooks/use-gem-balance';
import { Loader2, Wallet, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAccount, useDisconnect } from 'wagmi'; // Import Wagmi hooks

interface GalleryConfig {
  panel_key: string;
  collection_name: string | null;
  contract_address: string | null;
  default_token_id: number | null;
  show_collection: boolean | null;
}

interface PanelLock {
  panel_id: string;
  locked_by_address: string;
  locked_until: string; // ISO string
}

const REQUIRED_GEM_BALANCE = 10;
const LOCK_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

const GalleryConfig = () => {
  const navigate = useNavigate();
  
  // Use Wagmi hooks
  const { address: walletAddress, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  
  const { balance, isLoading: isBalanceLoading, error: balanceError } = useGemBalance(walletAddress || null);

  const [panelKeys, setPanelKeys] = useState<string[]>([]);
  const [selectedPanelKey, setSelectedPanelKey] = useState<string>('');
  const [currentConfig, setCurrentConfig] = useState<Partial<GalleryConfig>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [panelLocks, setPanelLocks] = useState<PanelLock[]>([]);

  // Helper function to check lock status
  const getLockStatus = useCallback((panelKey: string) => {
    const lock = panelLocks.find(l => l.panel_id === panelKey);
    if (!lock) return { isLocked: false, isLockedByMe: false, lockedUntil: null };

    const lockedUntilDate = new Date(lock.locked_until);
    const now = new Date();
    
    if (lockedUntilDate > now) {
        const isLockedByMe = lock.locked_by_address.toLowerCase() === walletAddress?.toLowerCase();
        return { 
            isLocked: true, 
            isLockedByMe, 
            lockedUntil: lockedUntilDate 
        };
    }
    // Lock expired, treat as unlocked
    return { isLocked: false, isLockedByMe: false, lockedUntil: null };
  }, [panelLocks, walletAddress]);


  // 1. Authentication and Authorization Check
  useEffect(() => {
    if (!isConnected || !walletAddress) {
      toast.warning("Please connect your wallet to access configuration.");
      navigate('/login');
      return;
    }
    
    if (!isBalanceLoading && balance !== null) {
      if (balance < REQUIRED_GEM_BALANCE) {
        toast.error(`Access denied. You need at least ${REQUIRED_GEM_BALANCE} ElectroGems to configure the gallery.`);
      }
    }
  }, [isConnected, walletAddress, isBalanceLoading, balance, navigate]);

  const isAuthorized = isConnected && walletAddress && !isBalanceLoading && balance !== null && balance >= REQUIRED_GEM_BALANCE;
  
  // 2. Fetch Panel Keys and Locks (only if authorized)
  useEffect(() => {
    if (!isAuthorized) return;

    const fetchPanelData = async () => {
      // Fetch all panel keys
      const { data: keysData, error: keysError } = await supabase.from('gallery_config').select('panel_key');
      if (keysError) {
        toast.error('Failed to fetch panel keys');
        console.error(keysError);
        return;
      }
      setPanelKeys(keysData.map((item) => item.panel_key).sort());
      
      // Fetch all active locks
      const { data: locksData, error: locksError } = await supabase
        .from('panel_locks')
        .select('panel_id, locked_by_address, locked_until');
        
      if (locksError) {
        console.error('Failed to fetch panel locks:', locksError);
        // Continue even if locks fail to fetch
      } else {
        setPanelLocks(locksData.map(lock => ({
            ...lock,
            panel_id: lock.panel_id,
        })));
      }
    };
    fetchPanelData();
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
    
    const lockStatus = getLockStatus(selectedPanelKey);
    
    if (lockStatus.isLocked && !lockStatus.isLockedByMe) {
        toast.error(`Panel is currently locked by another user until ${lockStatus.lockedUntil?.toLocaleTimeString()}.`);
        setIsLoading(false);
        return;
    }

    // Ensure contract address is null if empty string
    const contractAddress = currentConfig.contract_address?.trim() || null;
    
    const dataToUpsert = {
      panel_key: selectedPanelKey,
      collection_name: currentConfig.collection_name || null,
      contract_address: contractAddress,
      default_token_id: currentConfig.default_token_id ? Number(currentConfig.default_token_id) : 1,
      show_collection: currentConfig.show_collection ?? true,
    };

    // 1. Save Gallery Config
    const { error: configError } = await supabase.from('gallery_config').upsert(dataToUpsert, { onConflict: 'panel_key' });

    if (configError) {
      toast.error('Failed to save configuration.');
      console.error(configError);
      setIsLoading(false);
      return;
    }
    
    // 2. Update Panel Lock
    const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
    const lockData = {
        panel_id: selectedPanelKey, // Use panel_key as panel_id
        contract_address: contractAddress || '0x', // Required by schema, use placeholder if null
        token_id: String(dataToUpsert.default_token_id), // Required by schema
        locked_by_address: walletAddress!,
        locked_until: lockedUntil,
    };
    
    // Use upsert to create or update the lock
    const { error: lockError } = await supabase.from('panel_locks').upsert(lockData, { onConflict: 'panel_id' });

    if (lockError) {
        toast.warning('Configuration saved, but failed to update panel lock.');
        console.error(lockError);
    } else {
        toast.success(`Configuration saved and panel locked for 24 hours.`);
        // Optimistically update local state
        setPanelLocks(prev => {
            const existingIndex = prev.findIndex(l => l.panel_id === selectedPanelKey);
            const newLock = { panel_id: selectedPanelKey, locked_by_address: walletAddress!, locked_until: lockedUntil };
            if (existingIndex !== -1) {
                return [...prev.slice(0, existingIndex), newLock, ...prev.slice(existingIndex + 1)];
            }
            return [...prev, newLock];
        });
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
            <Button variant="outline" onClick={() => disconnect()}>
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

  const selectedPanelLockStatus = getLockStatus(selectedPanelKey);
  const isPanelLockedByOther = selectedPanelLockStatus.isLocked && !selectedPanelLockStatus.isLockedByMe;

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
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Balance: {balance} Gems (Required: {REQUIRED_GEM_BALANCE})
              </p>
              <Button variant="outline" onClick={() => disconnect()}>
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
                  {panelKeys.map((key) => {
                    const lockStatus = getLockStatus(key);
                    const isUnavailable = lockStatus.isLocked && !lockStatus.isLockedByMe;
                    
                    let lockText = '';
                    if (lockStatus.isLocked) {
                        const until = lockStatus.lockedUntil!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        lockText = lockStatus.isLockedByMe ? ' (Locked by you)' : ` (Locked until ${until})`;
                    }

                    return (
                        <SelectItem 
                            key={key} 
                            value={key} 
                            disabled={isUnavailable}
                            className={isUnavailable ? 'text-muted-foreground/50' : ''}
                        >
                            {key} {lockText}
                        </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {selectedPanelKey && (
              <>
                {isPanelLockedByOther && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Panel Locked</AlertTitle>
                        <AlertDescription>
                            This panel is currently locked by another user until {selectedPanelLockStatus.lockedUntil?.toLocaleString()}. You cannot edit it now.
                        </AlertDescription>
                    </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="collection_name">Collection Name</Label>
                  <Input
                    id="collection_name"
                    name="collection_name"
                    value={currentConfig.collection_name || ''}
                    onChange={handleInputChange}
                    placeholder="e.g., My Awesome NFTs"
                    disabled={isLoading || isPanelLockedByOther}
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
                    disabled={isLoading || isPanelLockedByOther}
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
                    disabled={isLoading || isPanelLockedByOther}
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
                    disabled={isLoading || isPanelLockedByOther}
                  />
                </div>
                <Button onClick={handleSave} disabled={isLoading || isPanelLockedByOther}>
                  {isLoading ? 'Saving...' : 'Save Configuration & Lock Panel'}
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