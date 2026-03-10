import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from 'sonner';
import NftPreviewPane from '@/components/NftPreviewPane';
import { Loader2, Gem, ArrowLeft, Map as MapIcon, Settings, Eye } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useAvailableGems } from '@/hooks/use-available-gems';
import FloorPlan from '@/components/gallery-config/FloorPlan';
import SettingsPanel from '@/components/gallery-config/SettingsPanel';

interface GalleryConfigRow {
  panel_key: string;
  collection_name: string | null;
  contract_address: string | null;
  default_token_id: number | null;
  show_collection: boolean | null;
  wall_color: string | null;
  text_color: string | null;
}

interface PanelLock {
  panel_id: string;
  locked_by_address: string;
  locked_until: string; // ISO
  locking_gem_token_id: string | null;
}

const REQUIRED_GEM_BALANCE = 1;
type OuterFloor = 'ground' | 'first';
type OuterWall = 'north' | 'south' | 'east' | 'west';

const outerLabel = (wall: OuterWall, index: number, floor: OuterFloor) => {
  const base = wall.charAt(0).toUpperCase() + wall.slice(1);
  const floorLabel = floor === 'ground' ? 'G' : '1F';
  return `${base} Wall Segment ${index + 1} (${floorLabel})`;
};

const formatWalletAddress = (address: string | undefined | null) => {
  if (!address) return 'N/A';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const DEFAULT_WALL_COLOR = '#36454F';
const DEFAULT_TEXT_COLOR = '#40E0D0';

const GalleryConfig = () => {
  const navigate = useNavigate();
  const { address: walletAddress, isConnected } = useAccount();

  const {
    availableTokens,
    ownedTokens,
    isLoading: isGemsLoading,
    refetch: refetchGems,
  } = useAvailableGems(walletAddress || null);

  const [selectedPanelKey, setSelectedPanelKey] = useState<string>('');
  const [currentConfig, setCurrentConfig] = useState<Partial<GalleryConfigRow>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [panelLocks, setPanelLocks] = useState<PanelLock[]>([]);
  const [lockDurationDays, setLockDurationDays] = useState(0);
  const [outerFloor, setOuterFloor] = useState<OuterFloor>('ground');
  const [activeTab, setActiveTab] = useState<string>("map");

  useEffect(() => {
    if (!isConnected || !walletAddress) {
      navigate('/portal');
      return;
    }
    if (!isGemsLoading && ownedTokens.length < REQUIRED_GEM_BALANCE) {
      toast.error(`Insufficient ElectroGems (${ownedTokens.length}/${REQUIRED_GEM_BALANCE})`);
      navigate('/portal');
    }
  }, [isConnected, walletAddress, isGemsLoading, ownedTokens.length, navigate]);

  useEffect(() => {
    if (!isGemsLoading && ownedTokens.length >= REQUIRED_GEM_BALANCE) {
      const fetchLocks = async () => {
        const { data } = await supabase.from('panel_locks').select('panel_id, locked_by_address, locked_until, locking_gem_token_id');
        if (data) setPanelLocks(data as PanelLock[]);
      };
      fetchLocks();
    }
  }, [isGemsLoading, ownedTokens.length]);

  const getLockStatus = useCallback((panelKey: string) => {
    const lock = panelLocks.find((l) => l.panel_id === panelKey);
    if (!lock) return { isLocked: false, isLockedByMe: false, lockedUntil: null, lockingGemTokenId: null };
    const until = new Date(lock.locked_until);
    if (until <= new Date()) return { isLocked: false, isLockedByMe: false, lockedUntil: null, lockingGemTokenId: null };
    const isByMe = !!walletAddress && lock.locked_by_address.toLowerCase() === walletAddress.toLowerCase();
    return { isLocked: true, isLockedByMe: isByMe, lockedUntil: until, lockingGemTokenId: lock.locking_gem_token_id };
  }, [panelLocks, walletAddress]);

  const selectedLock = useMemo(() => {
    if (!selectedPanelKey) return { isLocked: false, isLockedByMe: false, lockedUntil: null, lockingGemTokenId: null };
    return getLockStatus(selectedPanelKey);
  }, [selectedPanelKey, getLockStatus]);

  const fetchPanelConfig = useCallback(async (panelKey: string) => {
    if (!panelKey) { setCurrentConfig({}); return; }
    setIsLoading(true);
    const { data } = await supabase.from('gallery_config').select('*').eq('panel_key', panelKey).single();
    
    setCurrentConfig({
      panel_key: panelKey,
      collection_name: data?.collection_name || '',
      contract_address: data?.contract_address || '',
      default_token_id: data?.default_token_id || 1,
      show_collection: data?.show_collection ?? false,
    });
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (selectedPanelKey) {
      fetchPanelConfig(selectedPanelKey);
      if (window.innerWidth < 1024 && activeTab === 'map') {
        setActiveTab("settings");
      }
    }
  }, [selectedPanelKey, fetchPanelConfig]);

  const handleSave = async () => {
    if (isGemsLoading || ownedTokens.length < REQUIRED_GEM_BALANCE || !selectedPanelKey) return;
    
    if (!currentConfig.contract_address || currentConfig.contract_address.trim() === '') {
      toast.error('Please enter a contract address.');
      return;
    }

    setIsLoading(true);
    const lockStatus = getLockStatus(selectedPanelKey);
    if (lockStatus.isLocked && !lockStatus.isLockedByMe) {
      toast.error('Panel locked by another user.');
      setIsLoading(false); return;
    }

    const { error: cfgErr } = await supabase.from('gallery_config').upsert({
      panel_key: selectedPanelKey,
      collection_name: currentConfig.collection_name || null,
      contract_address: currentConfig.contract_address.trim(),
      default_token_id: currentConfig.default_token_id || 1,
      show_collection: currentConfig.show_collection ?? false,
      wall_color: DEFAULT_WALL_COLOR,
      text_color: DEFAULT_TEXT_COLOR,
    });

    if (cfgErr) { toast.error('Save failed.'); setIsLoading(false); return; }

    const days = Math.max(0, Math.min(30, Number(lockDurationDays)));
    if (days === 0) {
      if (lockStatus.isLockedByMe) {
        await supabase.from('panel_locks').delete().eq('panel_id', selectedPanelKey);
        setPanelLocks(prev => prev.filter(l => l.panel_id !== selectedPanelKey));
        toast.success('Configuration saved & Panel unlocked.');
        refetchGems();
      } else toast.success('Configuration saved.');
    } else {
      const lockGem = lockStatus.isLockedByMe ? lockStatus.lockingGemTokenId : availableTokens[0];
      if (!lockGem) { toast.error('No gems available.'); setIsLoading(false); return; }
      const until = new Date(Date.now() + days * 86400000).toISOString();
      const { error: lockErr } = await supabase.from('panel_locks').upsert({
        panel_id: selectedPanelKey, 
        contract_address: currentConfig.contract_address.trim(), 
        token_id: String(currentConfig.default_token_id || 1),
        locked_by_address: walletAddress!, 
        locked_until: until, 
        locking_gem_token_id: lockGem
      });
      if (!lockErr) {
        setPanelLocks(prev => [...prev.filter(l => l.panel_id !== selectedPanelKey), { panel_id: selectedPanelKey, locked_by_address: walletAddress!, locked_until: until, locking_gem_token_id: lockGem }]);
        toast.success(`Saved & Locked for ${days} days.`);
        refetchGems();
      }
    }
    setIsLoading(false);
  };

  const getFriendlyLabel = useCallback((key: string) => {
    const match = key.match(/^(north|south|east|west)-wall-(\d+)-(ground|first)$/);
    if (match) return outerLabel(match[1] as OuterWall, parseInt(match[2]), match[3] as OuterFloor);
    
    const innerMatch = key.match(/^(north|south|east|west)-inner-wall-(outer|inner)-(\d+)$/);
    if (innerMatch) {
        const wall = innerMatch[1].charAt(0).toUpperCase() + innerMatch[1].slice(1);
        const side = innerMatch[2] === 'outer' ? 'Outer' : 'Inner';
        const index = parseInt(innerMatch[3]) + 1;
        return `Inner ${wall} Segment ${index} (${side} Side)`;
    }
    
    return key;
  }, []);

  const friendlyLabel = useMemo(() => getFriendlyLabel(selectedPanelKey), [selectedPanelKey, getFriendlyLabel]);

  return (
    <div className="fixed inset-0 bg-gray-100 dark:bg-gray-900 overflow-y-auto z-[100] p-3 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <Button variant="ghost" size="sm" onClick={() => navigate('/portal')} className="px-0 hover:bg-transparent text-sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Portal
            </Button>
            <div className="flex items-center gap-3 bg-secondary/30 px-3 py-1.5 rounded-full text-xs">
              <Gem className="h-4 w-4 text-primary" />
              <span>Gems: <strong>{ownedTokens.length}</strong></span>
              <span className="text-muted-foreground">|</span>
              <span className="opacity-60">{formatWalletAddress(walletAddress)}</span>
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Gallery Configuration</h1>
            <p className="text-sm text-muted-foreground">Customise any wall panel with content from any Electroneum collection.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-8">
          <Card className="flex flex-col h-fit">
            <CardContent className="p-6">
              <div className="lg:hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-6">
                    <TabsTrigger value="map" className="flex items-center gap-2">
                      <MapIcon className="h-4 w-4" /> Selector
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="flex items-center gap-2">
                      <Settings className="h-4 w-4" /> Settings
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="flex items-center gap-2">
                      <Eye className="h-4 w-4" /> Preview
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="map">
                    <FloorPlan 
                      outerFloor={outerFloor}
                      setOuterFloor={setOuterFloor}
                      selectedPanelKey={selectedPanelKey}
                      setSelectedPanelKey={setSelectedPanelKey}
                      getLockStatus={getLockStatus}
                      getFriendlyLabel={getFriendlyLabel}
                    />
                  </TabsContent>
                  <TabsContent value="settings">
                    <SettingsPanel 
                      selectedPanelKey={selectedPanelKey}
                      friendlyLabel={friendlyLabel}
                      currentConfig={currentConfig}
                      setCurrentConfig={setCurrentConfig}
                      lockDurationDays={lockDurationDays}
                      setLockDurationDays={setLockDurationDays}
                      handleSave={handleSave}
                      isLoading={isLoading}
                      selectedLock={selectedLock}
                      onOpenMap={() => setActiveTab("map")}
                    />
                  </TabsContent>
                  <TabsContent value="preview">
                    <div className="pt-4">
                      <NftPreviewPane contractAddress={currentConfig.contract_address || null} tokenId={currentConfig.default_token_id || null} />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
              <div className="hidden lg:block space-y-6">
                <FloorPlan 
                  outerFloor={outerFloor}
                  setOuterFloor={setOuterFloor}
                  selectedPanelKey={selectedPanelKey}
                  setSelectedPanelKey={setSelectedPanelKey}
                  getLockStatus={getLockStatus}
                  getFriendlyLabel={getFriendlyLabel}
                />
                <SettingsPanel 
                  selectedPanelKey={selectedPanelKey}
                  friendlyLabel={friendlyLabel}
                  currentConfig={currentConfig}
                  setCurrentConfig={setCurrentConfig}
                  lockDurationDays={lockDurationDays}
                  setLockDurationDays={setLockDurationDays}
                  handleSave={handleSave}
                  isLoading={isLoading}
                  selectedLock={selectedLock}
                />
              </div>
            </CardContent>
          </Card>
          <div className="hidden lg:block lg:sticky lg:top-8 h-fit space-y-6">
            <NftPreviewPane contractAddress={currentConfig.contract_address || null} tokenId={currentConfig.default_token_id || null} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GalleryConfig;