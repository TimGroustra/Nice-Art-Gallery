import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from 'sonner';
import NftPreviewPane from '@/components/NftPreviewPane';
import { Loader2, Gem, ArrowLeft, Info, Map as MapIcon, Settings, Eye } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useAvailableGems } from '@/hooks/use-available-gems';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';

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

const REQUIRED_GEM_BALANCE = 5;
const OUTER_INDICES = [0, 1, 2, 3, 4] as const;
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

  const getFriendlyLabel = (key: string) => {
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
  };

  const WallButton = ({ panelKey, className, orientation = "horizontal" }: { panelKey: string, className?: string, orientation?: "horizontal" | "vertical" }) => {
    const isSelected = selectedPanelKey === panelKey;
    const lock = getLockStatus(panelKey);
    const label = getFriendlyLabel(panelKey);
    
    return (
      <button 
        onClick={() => setSelectedPanelKey(panelKey)} 
        title={label}
        className={cn(
          "relative flex items-center justify-center transition-all group p-1",
          orientation === "horizontal" ? "flex-col" : "flex-row",
          className
        )}
      >
        <div className={cn(
          "rounded-full transition-all",
          orientation === "horizontal" ? "w-full h-[3px]" : "h-full w-[3px]",
          isSelected ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] scale-y-125" : 
          (lock.isLocked && !lock.isLockedByMe) ? "bg-red-500/60" : "bg-slate-700 group-hover:bg-slate-500"
        )} />
        {isSelected && (
           <div className="absolute inset-0 border border-cyan-400/30 rounded-sm pointer-events-none" />
        )}
      </button>
    );
  };

  const FloorPlan = () => (
    <div className="rounded-xl border bg-slate-950 p-4 space-y-4">
      <div className="flex justify-between items-center">
        <Label className="text-white text-xs font-bold uppercase tracking-wider">Interactive Floor Plan</Label>
        <div className="bg-white/10 p-0.5 rounded-full flex gap-1">
          {['ground', 'first'].map(f => (
            <button key={f} onClick={() => setOuterFloor(f as OuterFloor)} className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${outerFloor === f ? 'bg-primary text-primary-foreground' : 'text-slate-400'}`}>{f === 'ground' ? 'GROUND' : 'FIRST'}</button>
          ))}
        </div>
      </div>

      <div className="relative w-full border border-white/5 rounded-lg bg-slate-900 flex justify-center overflow-hidden">
        <div className="w-full max-w-[480px] aspect-square relative p-12">
          <div className="relative w-full h-full border border-dashed border-white/10 rounded-lg">
            {['north', 'south'].map(w => (
              <div key={w} className={`absolute ${w === 'north' ? '-top-10' : '-bottom-10'} left-0 right-0 flex h-10`}>
                {OUTER_INDICES.map(i => (
                  <WallButton key={`${w}-${i}`} panelKey={`${w}-wall-${i}-${outerFloor}`} className="flex-1" />
                ))}
              </div>
            ))}
            {['east', 'west'].map(w => (
              <div key={w} className={`absolute top-0 bottom-0 ${w === 'west' ? '-left-10' : '-right-10'} flex flex-col w-10`}>
                {OUTER_INDICES.map(i => (
                  <WallButton key={`${w}-${i}`} panelKey={`${w}-wall-${i}-${outerFloor}`} className="flex-1" orientation="vertical" />
                ))}
              </div>
            ))}
            {outerFloor === 'ground' && (
              <div className="absolute inset-0">
                <div className="absolute top-[40%] left-[20%] w-[20%] h-12 -translate-y-1/2 flex flex-col gap-1">
                  <WallButton panelKey="north-inner-wall-outer-0" className="h-1/2" />
                  <WallButton panelKey="north-inner-wall-inner-0" className="h-1/2" />
                </div>
                <div className="absolute top-[40%] left-[60%] w-[20%] h-12 -translate-y-1/2 flex flex-col gap-1">
                  <WallButton panelKey="north-inner-wall-outer-1" className="h-1/2" />
                  <WallButton panelKey="north-inner-wall-inner-1" className="h-1/2" />
                </div>
                <div className="absolute top-[60%] left-[20%] w-[20%] h-12 -translate-y-1/2 flex flex-col gap-1">
                  <WallButton panelKey="south-inner-wall-inner-0" className="h-1/2" />
                  <WallButton panelKey="south-inner-wall-outer-0" className="h-1/2" />
                </div>
                <div className="absolute top-[60%] left-[60%] w-[20%] h-12 -translate-y-1/2 flex flex-col gap-1">
                  <WallButton panelKey="south-inner-wall-inner-1" className="h-1/2" />
                  <WallButton panelKey="south-inner-wall-outer-1" className="h-1/2" />
                </div>
                <div className="absolute left-[40%] top-[20%] h-[20%] w-12 -translate-x-1/2 flex gap-1">
                  <WallButton panelKey="west-inner-wall-outer-0" className="w-1/2" orientation="vertical" />
                  <WallButton panelKey="west-inner-wall-inner-0" className="w-1/2" orientation="vertical" />
                </div>
                <div className="absolute left-[40%] top-[60%] h-[20%] w-12 -translate-x-1/2 flex gap-1">
                  <WallButton panelKey="west-inner-wall-outer-1" className="w-1/2" orientation="vertical" />
                  <WallButton panelKey="west-inner-wall-inner-1" className="w-1/2" orientation="vertical" />
                </div>
                <div className="absolute left-[60%] top-[20%] h-[20%] w-12 -translate-x-1/2 flex gap-1">
                  <WallButton panelKey="east-inner-wall-inner-0" className="w-1/2" orientation="vertical" />
                  <WallButton panelKey="east-inner-wall-outer-0" className="w-1/2" orientation="vertical" />
                </div>
                <div className="absolute left-[60%] top-[60%] h-[20%] w-12 -translate-x-1/2 flex gap-1">
                  <WallButton panelKey="east-inner-wall-inner-1" className="w-1/2" orientation="vertical" />
                  <WallButton panelKey="east-inner-wall-outer-1" className="w-1/2" orientation="vertical" />
                </div>
                <div className="absolute inset-[48%] border border-white/20 rounded-full flex items-center justify-center pointer-events-none">
                   <div className="w-1 h-1 bg-white/40 rounded-full" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="text-[10px] text-slate-400 flex justify-between items-center px-1">
        <span className="truncate">Selected: <span className="text-white font-bold">{selectedPanelKey ? getFriendlyLabel(selectedPanelKey) : 'Select a wall segment'}</span></span>
      </div>
    </div>
  );

  const SettingsPanel = () => (
    <div className="space-y-4 pt-4">
      {!selectedPanelKey ? (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 opacity-60 border-2 border-dashed rounded-xl">
          <MapIcon className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm">Please select a wall panel on the floor plan first.</p>
          {window.innerWidth < 1024 && (
            <Button variant="outline" size="sm" onClick={() => setActiveTab("map")}>Open Floor Plan</Button>
          )}
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-1 duration-300">
          <div className="flex items-center justify-between p-3 border rounded-lg bg-secondary/10">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight">Active Selection</span>
              <span className="text-sm font-bold">{getFriendlyLabel(selectedPanelKey)}</span>
            </div>
            {window.innerWidth < 1024 && (
              <Button variant="ghost" size="sm" onClick={() => setActiveTab("map")}>Change Selection</Button>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Contract Address</Label>
              <Input className="h-9 text-sm font-mono" value={currentConfig.contract_address || ''} onChange={e => setCurrentConfig(p => ({...p, contract_address: e.target.value}))} placeholder="0x..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Default Token ID</Label>
                <Input className="h-9 text-sm" type="number" value={currentConfig.default_token_id || 1} onChange={e => setCurrentConfig(p => ({...p, default_token_id: parseInt(e.target.value) || 1}))} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs">Lock for (Days)</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent><p className="text-xs">Locking consumes 1 available ElectroGem. Set to 0 to unlock.</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input className="h-9 text-sm" type="number" min={0} max={30} value={lockDurationDays} onChange={e => setLockDurationDays(Number(e.target.value))} />
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 border rounded-lg bg-secondary/10">
            <div className="space-y-0.5">
              <Label className="text-xs font-bold">Show Entire Collection</Label>
              <p className="text-[10px] text-muted-foreground">Allows visitors to cycle through all tokens in this contract.</p>
            </div>
            <Switch checked={currentConfig.show_collection || false} onCheckedChange={v => setCurrentConfig(p => ({...p, show_collection: v}))} />
          </div>

          <Button className="w-full h-12 text-md font-bold" onClick={handleSave} disabled={isLoading || (selectedLock?.isLocked && !selectedLock?.isLockedByMe)}>
            {isLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : 'Apply Configuration'}
          </Button>
          
          {selectedLock?.isLocked && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-center">
              <p className="text-xs text-amber-500 font-medium">
                {selectedLock.isLockedByMe ? `Locked by you until ${selectedLock.lockedUntil?.toLocaleDateString()}` : "Locked by another curator."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );

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
                    <FloorPlan />
                  </TabsContent>
                  <TabsContent value="settings">
                    <SettingsPanel />
                  </TabsContent>
                  <TabsContent value="preview">
                    <div className="pt-4">
                      <NftPreviewPane contractAddress={currentConfig.contract_address || null} tokenId={currentConfig.default_token_id || null} />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
              <div className="hidden lg:block space-y-6">
                <FloorPlan />
                <SettingsPanel />
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