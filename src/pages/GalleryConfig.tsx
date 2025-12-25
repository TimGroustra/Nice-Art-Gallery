import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import NftPreviewPane from '@/components/NftPreviewPane';
import { Loader2, Gem, ArrowLeft, Info } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useAvailableGems } from '@/hooks/use-available-gems';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
const FIXED_CONTRACT_ADDRESS = '0x947321143E176DC02FD4Ac82d5688759dCAb83ed';
const OUTER_INDICES = [0, 1, 2, 3, 4] as const;
type OuterFloor = 'ground' | 'first';
type OuterWall = 'north' | 'south' | 'east' | 'west';

const INNER_WALLS = ['north', 'south', 'east', 'west'] as const;
const INNER_TYPES = ['outer', 'inner'] as const;
const INNER_SEGS = [0, 1] as const;

const INNER_WALL_KEYS = [
  'north-inner-wall-outer-0', 'north-inner-wall-inner-0', 'north-inner-wall-outer-1', 'north-inner-wall-inner-1',
  'south-inner-wall-outer-0', 'south-inner-wall-inner-0', 'south-inner-wall-outer-1', 'south-inner-wall-inner-1',
  'east-inner-wall-outer-0', 'east-inner-wall-inner-0', 'east-inner-wall-outer-1', 'east-inner-wall-inner-1',
  'west-inner-wall-outer-0', 'west-inner-wall-inner-0', 'west-inner-wall-outer-1', 'west-inner-wall-inner-1',
] as const;

const PANEL_LABELS: Record<string, string> = {
  'north-inner-wall-outer-0': 'Inner N (West-Out)',
  'north-inner-wall-inner-0': 'Inner N (West-In)',
  'north-inner-wall-outer-1': 'Inner N (East-Out)',
  'north-inner-wall-inner-1': 'Inner N (East-In)',
  'south-inner-wall-outer-0': 'Inner S (West-Out)',
  'south-inner-wall-inner-0': 'Inner S (West-In)',
  'south-inner-wall-outer-1': 'Inner S (East-Out)',
  'south-inner-wall-inner-1': 'Inner S (East-In)',
  'east-inner-wall-outer-0': 'Inner E (North-Out)',
  'east-inner-wall-inner-0': 'Inner E (North-In)',
  'east-inner-wall-outer-1': 'Inner E (South-Out)',
  'east-inner-wall-inner-1': 'Inner E (South-In)',
  'west-inner-wall-outer-0': 'Inner W (North-Out)',
  'west-inner-wall-inner-0': 'Inner W (North-In)',
  'west-inner-wall-outer-1': 'Inner W (South-Out)',
  'west-inner-wall-inner-1': 'Inner W (South-In)',
};

const outerLabel = (wall: OuterWall, index: number, floor: OuterFloor) => {
  const base = wall.charAt(0).toUpperCase() + wall.slice(1);
  const floorLabel = floor === 'ground' ? 'G' : '1F';
  return `${base} S${index + 1} (${floorLabel})`;
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
  const [lockDurationDays, setLockDurationDays] = useState(1);
  const [outerFloor, setOuterFloor] = useState<OuterFloor>('ground');

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

  const getTokenIdForPanel = useCallback((panelKey: string): number => {
    const ordered: string[] = [];
    OUTER_INDICES.forEach((i) => ['north','south','east','west'].forEach(w => ordered.push(`${w}-wall-${i}-ground`, `${w}-wall-${i}-first`)));
    ordered.push(...INNER_WALL_KEYS);
    const unique = Array.from(new Set(ordered));
    const index = unique.indexOf(panelKey);
    return index === -1 ? unique.length + 1 : index + 1;
  }, []);

  const fetchPanelConfig = useCallback(async (panelKey: string) => {
    if (!panelKey) { setCurrentConfig({}); return; }
    setIsLoading(true);
    const { data } = await supabase.from('gallery_config').select('*').eq('panel_key', panelKey).single();
    const mappedId = getTokenIdForPanel(panelKey);
    setCurrentConfig({
      panel_key: panelKey,
      collection_name: data?.collection_name || null,
      contract_address: FIXED_CONTRACT_ADDRESS,
      default_token_id: mappedId,
      show_collection: data?.show_collection ?? false,
    });
    setIsLoading(false);
  }, [getTokenIdForPanel]);

  useEffect(() => {
    if (selectedPanelKey) fetchPanelConfig(selectedPanelKey);
  }, [selectedPanelKey, fetchPanelConfig]);

  const handleSave = async () => {
    if (isGemsLoading || ownedTokens.length < REQUIRED_GEM_BALANCE || !selectedPanelKey) return;
    setIsLoading(true);
    const lockStatus = getLockStatus(selectedPanelKey);
    if (lockStatus.isLocked && !lockStatus.isLockedByMe) {
      toast.error('Panel locked by another user.');
      setIsLoading(false); return;
    }

    const mappedId = getTokenIdForPanel(selectedPanelKey);
    const { error: cfgErr } = await supabase.from('gallery_config').upsert({
      panel_key: selectedPanelKey,
      collection_name: currentConfig.collection_name || null,
      contract_address: FIXED_CONTRACT_ADDRESS,
      default_token_id: mappedId,
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
        panel_id: selectedPanelKey, contract_address: FIXED_CONTRACT_ADDRESS, token_id: String(mappedId),
        locked_by_address: walletAddress!, locked_until: until, locking_gem_token_id: lockGem
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
    if (PANEL_LABELS[key]) return PANEL_LABELS[key];
    const match = key.match(/^(north|south|east|west)-wall-(\d+)-(ground|first)$/);
    if (match) return outerLabel(match[1] as OuterWall, parseInt(match[2]), match[3] as OuterFloor);
    return key;
  };

  const isAuthorized = isConnected && !!walletAddress && !isGemsLoading && ownedTokens.length >= REQUIRED_GEM_BALANCE;
  
  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center space-y-4">
          <Loader2 className="animate-spin text-white h-12 w-12 mx-auto" />
          <p className="text-white/70">Verifying access...</p>
        </div>
      </div>
    );
  }

  const selectedLock = selectedPanelKey ? getLockStatus(selectedPanelKey) : null;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-2 sm:p-4 lg:p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4 lg:gap-8">
        <Card className="flex flex-col h-fit">
          <CardHeader className="py-4 border-b">
            <div className="flex justify-between items-center mb-1">
              <Button variant="ghost" size="sm" onClick={() => navigate('/portal')} className="px-0 h-6 hover:bg-transparent text-xs">
                <ArrowLeft className="mr-1 h-3 w-3" /> Back to Portal
              </Button>
            </div>
            <CardTitle className="text-lg">Gallery Configuration</CardTitle>
            <CardDescription className="text-xs">Select a wall panel to map content from the collection.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 pb-6 overflow-hidden">
            <div className="flex justify-between items-center bg-secondary/30 p-2 rounded-lg text-xs">
              <div className="flex items-center gap-2">
                <Gem className="h-3 w-3 text-primary" />
                <span>Owned: <strong>{ownedTokens.length}</strong></span>
                <span className="text-muted-foreground">|</span>
                <span>Available: <strong>{availableTokens.length}</strong></span>
              </div>
              <p className="font-mono opacity-60 hidden sm:block">{formatWalletAddress(walletAddress)}</p>
            </div>

            <div className="rounded-xl border bg-slate-950 p-4 space-y-4">
               <div className="flex justify-between items-center">
                  <Label className="text-white text-sm">Interactive Floor Plan</Label>
                  <div className="bg-white/10 p-0.5 rounded-full flex gap-1">
                    {['ground', 'first'].map(f => (
                      <button key={f} onClick={() => setOuterFloor(f as OuterFloor)} className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${outerFloor === f ? 'bg-primary text-primary-foreground' : 'text-slate-400'}`}>{f === 'ground' ? 'GROUND' : 'FIRST'}</button>
                    ))}
                  </div>
               </div>

               <div className="relative aspect-[16/10] w-full border border-white/5 rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center">
                  <div className="relative w-full h-full p-8">
                    <div className="relative w-full h-full border border-dashed border-white/10 rounded-lg">
                      {/* Outer Walls */}
                      {['north', 'south'].map(w => (
                        <div key={w} className={`absolute ${w === 'north' ? '-top-6' : '-bottom-6'} left-0 right-0 flex gap-0.5 h-5`}>
                          {OUTER_INDICES.map(i => {
                            const k = `${w}-wall-${i}-${outerFloor}`;
                            const isSel = selectedPanelKey === k;
                            const lock = getLockStatus(k);
                            return (
                              <button 
                                key={k} 
                                onClick={() => setSelectedPanelKey(k)} 
                                title={getFriendlyLabel(k)}
                                className={`flex-1 rounded-[2px] border text-[8px] font-bold flex items-center justify-center transition-all ${isSel ? 'bg-cyan-500 text-black border-cyan-300 scale-105 z-10' : (lock.isLocked && !lock.isLockedByMe) ? 'bg-red-900/50 border-red-500/50 text-red-200' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                              >
                                {i+1}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                      {['east', 'west'].map(w => (
                        <div key={w} className={`absolute top-0 bottom-0 ${w === 'west' ? '-left-6' : '-right-6'} flex flex-col gap-0.5 w-5`}>
                          {OUTER_INDICES.map(i => {
                            const k = `${w}-wall-${i}-${outerFloor}`;
                            const isSel = selectedPanelKey === k;
                            const lock = getLockStatus(k);
                            return (
                              <button 
                                key={k} 
                                onClick={() => setSelectedPanelKey(k)} 
                                title={getFriendlyLabel(k)}
                                className={`flex-1 rounded-[2px] border text-[8px] font-bold flex items-center justify-center transition-all ${isSel ? 'bg-cyan-500 text-black border-cyan-300 scale-105 z-10' : (lock.isLocked && !lock.isLockedByMe) ? 'bg-red-900/50 border-red-500/50 text-red-200' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                              >
                                {i+1}
                              </button>
                            );
                          })}
                        </div>
                      ))}

                      {/* Inner Walls (Ground Floor Only) */}
                      {outerFloor === 'ground' && (
                        <div className="absolute inset-12 border border-white/5 rounded bg-white/5 p-2">
                           {/* Inner North */}
                           <div className="absolute top-0 left-0 right-0 flex h-4 gap-1">
                              {['outer-0', 'inner-0', 'outer-1', 'inner-1'].map((id, i) => {
                                const k = `north-inner-wall-${id}`;
                                const isSel = selectedPanelKey === k;
                                const lock = getLockStatus(k);
                                return <button key={k} onClick={() => setSelectedPanelKey(k)} className={`flex-1 border text-[7px] font-bold transition-all ${isSel ? 'bg-cyan-500 text-black border-white' : (lock.isLocked && !lock.isLockedByMe) ? 'bg-red-900 border-red-800' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>IN{i+1}</button>
                              })}
                           </div>
                           {/* Inner South */}
                           <div className="absolute bottom-0 left-0 right-0 flex h-4 gap-1">
                              {['outer-0', 'inner-0', 'outer-1', 'inner-1'].map((id, i) => {
                                const k = `south-inner-wall-${id}`;
                                const isSel = selectedPanelKey === k;
                                const lock = getLockStatus(k);
                                return <button key={k} onClick={() => setSelectedPanelKey(k)} className={`flex-1 border text-[7px] font-bold transition-all ${isSel ? 'bg-cyan-500 text-black border-white' : (lock.isLocked && !lock.isLockedByMe) ? 'bg-red-900 border-red-800' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>IS{i+1}</button>
                              })}
                           </div>
                           {/* Inner West */}
                           <div className="absolute top-6 bottom-6 left-0 flex flex-col w-4 gap-1">
                              {['outer-0', 'inner-0', 'outer-1', 'inner-1'].map((id, i) => {
                                const k = `west-inner-wall-${id}`;
                                const isSel = selectedPanelKey === k;
                                const lock = getLockStatus(k);
                                return <button key={k} onClick={() => setSelectedPanelKey(k)} className={`flex-1 border text-[7px] font-bold transition-all ${isSel ? 'bg-cyan-500 text-black border-white' : (lock.isLocked && !lock.isLockedByMe) ? 'bg-red-900 border-red-800' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>IW{i+1}</button>
                              })}
                           </div>
                           {/* Inner East */}
                           <div className="absolute top-6 bottom-6 right-0 flex flex-col w-4 gap-1">
                              {['outer-0', 'inner-0', 'outer-1', 'inner-1'].map((id, i) => {
                                const k = `east-inner-wall-${id}`;
                                const isSel = selectedPanelKey === k;
                                const lock = getLockStatus(k);
                                return <button key={k} onClick={() => setSelectedPanelKey(k)} className={`flex-1 border text-[7px] font-bold transition-all ${isSel ? 'bg-cyan-500 text-black border-white' : (lock.isLocked && !lock.isLockedByMe) ? 'bg-red-900 border-red-800' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>IE{i+1}</button>
                              })}
                           </div>
                           <div className="absolute inset-8 flex items-center justify-center opacity-20 pointer-events-none border border-dashed border-white/20">
                             <span className="text-[8px] uppercase font-bold tracking-[0.2em] text-white">Core</span>
                           </div>
                        </div>
                      )}
                      {outerFloor === 'first' && (
                        <div className="absolute inset-16 border border-cyan-500/10 rounded bg-cyan-500/5 flex items-center justify-center">
                          <span className="text-[10px] text-cyan-500/20 uppercase tracking-widest font-bold">1st Floor Void</span>
                        </div>
                      )}
                    </div>
                  </div>
               </div>
               <div className="text-[10px] text-slate-400 flex justify-between items-center px-1">
                <span className="truncate">Selected: <span className="text-white font-bold">{selectedPanelKey ? `${getFriendlyLabel(selectedPanelKey)}` : 'N/A'}</span></span>
                <span className="flex-shrink-0">Token ID: <span className="text-white font-bold">{selectedPanelKey ? `#${getTokenIdForPanel(selectedPanelKey)}` : '-'}</span></span>
               </div>
            </div>

            {selectedPanelKey && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-300">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Panel Display Name</Label>
                    <Input className="h-9 text-sm" value={currentConfig.collection_name || ''} onChange={e => setCurrentConfig(p => ({...p, collection_name: e.target.value}))} placeholder="e.g. Rare Bolt Jar" />
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
                
                <div className="flex items-center justify-between p-3 border rounded-lg bg-secondary/10">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-bold">Show Entire Collection</Label>
                    <p className="text-[10px] text-muted-foreground">Allows visitors to cycle through your tokens on this panel.</p>
                  </div>
                  <Switch checked={currentConfig.show_collection || false} onCheckedChange={v => setCurrentConfig(p => ({...p, show_collection: v}))} />
                </div>

                <Button className="w-full h-10 font-bold" onClick={handleSave} disabled={isLoading || (selectedLock?.isLocked && !selectedLock?.isLockedByMe)}>
                  {isLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : 'Apply Configuration'}
                </Button>
                
                {selectedLock?.isLocked && (
                  <p className="text-[10px] text-center text-amber-500 font-medium">
                    {selectedLock.isLockedByMe ? `Currently locked by you until ${selectedLock.lockedUntil?.toLocaleDateString()}` : "Locked by another curator."}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:sticky lg:top-4 h-fit">
          <NftPreviewPane contractAddress={FIXED_CONTRACT_ADDRESS} tokenId={selectedPanelKey ? getTokenIdForPanel(selectedPanelKey) : null} />
        </div>
      </div>
    </div>
  );
};

export default GalleryConfig;