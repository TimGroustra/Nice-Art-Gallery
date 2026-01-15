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
import { Loader2, Gem, ArrowLeft, Info, Map as MapIcon, Settings, Eye, Package, Plus, Trash2, Search } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useAvailableGems } from '@/hooks/use-available-gems';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';
import { FurnitureItem } from '@/config/galleryConfig';

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
  locked_until: string;
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

  // Asset Importer state
  const [furniture, setFurniture] = useState<FurnitureItem[]>([]);
  const [newAsset, setNewAsset] = useState<Partial<FurnitureItem & { name_filter: string }>>({
    model_url: '',
    name_filter: '',
    target_width: 2.0,
    floor_level: 'ground',
    position_x: 0,
    position_z: 0,
    rotation_y: 0
  });

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

  const fetchFurniture = useCallback(async () => {
    const { data } = await supabase.from('gallery_furniture').select('*');
    if (data) setFurniture(data as FurnitureItem[]);
  }, []);

  useEffect(() => {
    if (!isGemsLoading && ownedTokens.length >= REQUIRED_GEM_BALANCE) {
      const fetchLocks = async () => {
        const { data } = await supabase.from('panel_locks').select('panel_id, locked_by_address, locked_until, locking_gem_token_id');
        if (data) setPanelLocks(data as PanelLock[]);
      };
      fetchLocks();
      fetchFurniture();
    }
  }, [isGemsLoading, ownedTokens.length, fetchFurniture]);

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

  const handleAddFurniture = async () => {
    if (!newAsset.model_url) {
      toast.error("Please provide a model URL.");
      return;
    }
    const { error } = await supabase.from('gallery_furniture').insert([newAsset]);
    if (error) toast.error("Failed to add asset.");
    else {
      toast.success("3D Asset imported successfully.");
      setNewAsset({ model_url: '', name_filter: '', target_width: 2.0, floor_level: 'ground', position_x: 0, position_z: 0, rotation_y: 0 });
      fetchFurniture();
    }
  };

  const handleDeleteFurniture = async (id: string) => {
    const { error } = await supabase.from('gallery_furniture').delete().eq('id', id);
    if (error) toast.error("Failed to remove asset.");
    else {
      toast.success("Asset removed.");
      fetchFurniture();
    }
  };

  const getFriendlyLabel = (key: string) => {
    const match = key.match(/^(north|south|east|west)-wall-(\d+)-(ground|first)$/);
    if (match) return outerLabel(match[1] as OuterWall, parseInt(match[2]), match[3] as OuterFloor);
    const innerMatch = key.match(/^(north|south|east|west)-inner-wall-(outer|inner)-(\d+)$/);
    if (innerMatch) return `Inner ${innerMatch[1].charAt(0).toUpperCase() + innerMatch[1].slice(1)} Segment ${parseInt(innerMatch[3]) + 1} (${innerMatch[2] === 'outer' ? 'Outer' : 'Inner'} Side)`;
    return key;
  };

  const WallButton = ({ panelKey, className, orientation = "horizontal" }: { panelKey: string, className?: string, orientation?: "horizontal" | "vertical" }) => {
    const isSelected = selectedPanelKey === panelKey;
    const lock = getLockStatus(panelKey);
    const label = getFriendlyLabel(panelKey);
    return (
      <button onClick={() => setSelectedPanelKey(panelKey)} title={label} className={cn("relative flex items-center justify-center transition-all group p-1", orientation === "horizontal" ? "flex-col" : "flex-row", className)}>
        <div className={cn("rounded-full transition-all", orientation === "horizontal" ? "w-full h-[3px]" : "h-full w-[3px]", isSelected ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] scale-y-125" : (lock.isLocked && !lock.isLockedByMe) ? "bg-red-500/60" : "bg-slate-700 group-hover:bg-slate-500")} />
        {isSelected && <div className="absolute inset-0 border border-cyan-400/30 rounded-sm pointer-events-none" />}
      </button>
    );
  };

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
          <h1 className="text-2xl font-bold">Gallery Configuration</h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6">
            <TabsTrigger value="map" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">
              <MapIcon className="h-4 w-4 mr-2" /> Wall Layout
            </TabsTrigger>
            <TabsTrigger value="assets" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">
              <Package className="h-4 w-4 mr-2" /> 3D Asset Importer
            </TabsTrigger>
          </TabsList>

          <TabsContent value="map" className="animate-in fade-in duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-8">
              <Card><CardContent className="p-6 space-y-6">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-bold uppercase tracking-wider">Floor Plan Selector</Label>
                  <div className="bg-white/10 p-0.5 rounded-full flex gap-1">
                    {['ground', 'first'].map(f => (
                      <button key={f} onClick={() => setOuterFloor(f as OuterFloor)} className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${outerFloor === f ? 'bg-primary text-primary-foreground' : 'text-slate-400'}`}>{f.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
                <div className="relative w-full border border-white/5 rounded-lg bg-slate-900 flex justify-center p-12 aspect-square max-w-[480px] mx-auto">
                  <div className="relative w-full h-full border border-dashed border-white/10 rounded-lg">
                    {['north', 'south'].map(w => <div key={w} className={`absolute ${w === 'north' ? '-top-10' : '-bottom-10'} left-0 right-0 flex h-10`}>{OUTER_INDICES.map(i => <WallButton key={`${w}-${i}`} panelKey={`${w}-wall-${i}-${outerFloor}`} className="flex-1" />)}</div>)}
                    {['east', 'west'].map(w => <div key={w} className={`absolute top-0 bottom-0 ${w === 'west' ? '-left-10' : '-right-10'} flex flex-col w-10`}>{OUTER_INDICES.map(i => <WallButton key={`${w}-${i}`} panelKey={`${w}-wall-${i}-${outerFloor}`} className="flex-1" orientation="vertical" />)}</div>)}
                  </div>
                </div>
                {selectedPanelKey && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5"><Label className="text-xs">Contract</Label><Input className="h-9 text-sm" value={currentConfig.contract_address || ''} onChange={e => setCurrentConfig(p => ({...p, contract_address: e.target.value}))} /></div>
                      <div className="space-y-1.5"><Label className="text-xs">Token ID</Label><Input className="h-9 text-sm" type="number" value={currentConfig.default_token_id || 1} onChange={e => setCurrentConfig(p => ({...p, default_token_id: parseInt(e.target.value) || 1}))} /></div>
                    </div>
                    <Button className="w-full" onClick={handleSave} disabled={isLoading}>{isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Apply to Wall'}</Button>
                  </div>
                )}
              </CardContent></Card>
              <NftPreviewPane contractAddress={currentConfig.contract_address || null} tokenId={currentConfig.default_token_id || null} />
            </div>
          </TabsContent>

          <TabsContent value="assets" className="animate-in fade-in duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card>
                <CardHeader><CardTitle className="text-lg">Import New 3D Asset</CardTitle><CardDescription>Normalizes and centers GLB models for placement.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2"><Label className="text-xs">Model URL (.glb)</Label><Input value={newAsset.model_url} onChange={e => setNewAsset(p => ({...p, model_url: e.target.value}))} placeholder="https://..." /></div>
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-2"><Search className="h-3 w-3" /> Name Filter (Optional)</Label>
                    <Input value={newAsset.name_filter} onChange={e => setNewAsset(p => ({...p, name_filter: e.target.value}))} placeholder="e.g. 'table', 'sofa', 'statue'" />
                    <p className="text-[10px] text-muted-foreground">Used to extract a specific object from a scene file.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label className="text-xs">Target Width (meters)</Label><Input type="number" value={newAsset.target_width} onChange={e => setNewAsset(p => ({...p, target_width: Number(e.target.value)}))} /></div>
                    <div className="space-y-2"><Label className="text-xs">Floor</Label><select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" value={newAsset.floor_level} onChange={e => setNewAsset(p => ({...p, floor_level: e.target.value as any}))}><option value="ground">Ground</option><option value="first">First</option></select></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2"><Label className="text-xs">Pos X</Label><Input type="number" value={newAsset.position_x} onChange={e => setNewAsset(p => ({...p, position_x: Number(e.target.value)}))} /></div>
                    <div className="space-y-2"><Label className="text-xs">Pos Z</Label><Input type="number" value={newAsset.position_z} onChange={e => setNewAsset(p => ({...p, position_z: Number(e.target.value)}))} /></div>
                    <div className="space-y-2"><Label className="text-xs">Rot Y</Label><Input type="number" value={newAsset.rotation_y} onChange={e => setNewAsset(p => ({...p, rotation_y: Number(e.target.value)}))} /></div>
                  </div>
                  <Button className="w-full" onClick={handleAddFurniture}><Plus className="h-4 w-4 mr-2" /> Import Asset</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-lg">Managed 3D Assets</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {furniture.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg bg-secondary/10">
                      <div className="truncate pr-4">
                        <div className="text-sm font-bold truncate">{item.model_url.split('/').pop()}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">{item.floor_level} • Width: {item.target_width}m {item.name_filter ? `• Filter: '${item.name_filter}'` : ''}</div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteFurniture(item.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  {furniture.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">No custom assets imported yet.</p>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default GalleryConfig;