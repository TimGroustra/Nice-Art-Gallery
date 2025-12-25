import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import NftPreviewPane from '@/components/NftPreviewPane';
import { Loader2, Wallet, AlertTriangle, Gem, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAccount, useDisconnect } from 'wagmi';
import { useAvailableGems } from '@/hooks/use-available-gems';

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

const INNER_WALL_KEYS = [
  'north-inner-wall-outer-0', 'north-inner-wall-inner-0', 'north-inner-wall-outer-1', 'north-inner-wall-inner-1',
  'south-inner-wall-outer-0', 'south-inner-wall-inner-0', 'south-inner-wall-outer-1', 'south-inner-wall-inner-1',
  'east-inner-wall-outer-0', 'east-inner-wall-inner-0', 'east-inner-wall-outer-1', 'east-inner-wall-inner-1',
  'west-inner-wall-outer-0', 'west-inner-wall-inner-0', 'west-inner-wall-outer-1', 'west-inner-wall-inner-1',
] as const;

const PANEL_LABELS: Record<string, string> = {
  'north-inner-wall-outer-0': 'Inner North – West Segment (Outer)',
  'north-inner-wall-inner-0': 'Inner North – West Segment (Inner)',
  'north-inner-wall-outer-1': 'Inner North – East Segment (Outer)',
  'north-inner-wall-inner-1': 'Inner North – East Segment (Inner)',
  'south-inner-wall-outer-0': 'Inner South – West Segment (Outer)',
  'south-inner-wall-inner-0': 'Inner South – West Segment (Inner)',
  'south-inner-wall-outer-1': 'Inner South – East Segment (Outer)',
  'south-inner-wall-inner-1': 'Inner South – East Segment (Inner)',
  'east-inner-wall-outer-0': 'Inner East – North Segment (Outer)',
  'east-inner-wall-inner-0': 'Inner East – North Segment (Inner)',
  'east-inner-wall-outer-1': 'Inner East – South Segment (Outer)',
  'east-inner-wall-inner-1': 'Inner East – South Segment (Inner)',
  'west-inner-wall-outer-0': 'Inner West – North Segment (Outer)',
  'west-inner-wall-inner-0': 'Inner West – North Segment (Inner)',
  'west-inner-wall-outer-1': 'Inner West – South Segment (Outer)',
  'west-inner-wall-inner-1': 'Inner West – South Segment (Inner)',
};

const outerLabel = (wall: OuterWall, index: number, floor: OuterFloor) => {
  const base = wall.charAt(0).toUpperCase() + wall.slice(1) + ' Wall';
  const floorLabel = floor === 'ground' ? 'Ground' : '1st Floor';
  return `${base} – Seg ${index + 1} (${floorLabel})`;
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
  const { disconnect } = useDisconnect();

  const {
    availableTokens,
    ownedTokens,
    isLoading: isGemsLoading,
    error: gemsError,
    refetch: refetchGems,
  } = useAvailableGems(walletAddress || null);

  const [selectedPanelKey, setSelectedPanelKey] = useState<string>('');
  const [currentConfig, setCurrentConfig] = useState<Partial<GalleryConfigRow>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [panelLocks, setPanelLocks] = useState<PanelLock[]>([]);
  const [lockDurationDays, setLockDurationDays] = useState(1);
  const [outerFloor, setOuterFloor] = useState<OuterFloor>('ground');

  const isAuthorized = isConnected && !!walletAddress && !isGemsLoading && ownedTokens.length >= REQUIRED_GEM_BALANCE;

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
    if (!isAuthorized) return;
    const fetchLocks = async () => {
      const { data } = await supabase.from('panel_locks').select('panel_id, locked_by_address, locked_until, locking_gem_token_id');
      if (data) setPanelLocks(data as PanelLock[]);
    };
    fetchLocks();
  }, [isAuthorized]);

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
    if (isAuthorized && selectedPanelKey) fetchPanelConfig(selectedPanelKey);
  }, [isAuthorized, selectedPanelKey, fetchPanelConfig]);

  const handleSave = async () => {
    if (!isAuthorized || !selectedPanelKey) return;
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

  if (!isAuthorized) return <div className="min-h-screen flex items-center justify-center bg-gray-900"><Loader2 className="animate-spin text-white" /></div>;

  const selectedLock = selectedPanelKey ? getLockStatus(selectedPanelKey) : null;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8">
        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex justify-between items-center mb-2">
              <Button variant="ghost" size="sm" onClick={() => navigate('/portal')} className="px-0 hover:bg-transparent">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Portal
              </Button>
            </div>
            <CardTitle>Gallery Configuration</CardTitle>
            <CardDescription>Select a panel to map unique content from the Bolt Jar collection.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="flex justify-between items-center bg-secondary/30 p-3 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <Gem className="h-4 w-4 text-primary" />
                <span>Gems: <strong>{ownedTokens.length}</strong></span>
                <span className="text-muted-foreground">|</span>
                <span>Available: <strong>{availableTokens.length}</strong></span>
              </div>
              <p className="text-xs font-mono">{formatWalletAddress(walletAddress)}</p>
            </div>

            <div className="rounded-xl border bg-slate-950 p-6 space-y-4">
               <div className="flex justify-between items-center">
                  <Label className="text-white">Floor View</Label>
                  <div className="bg-white/10 p-1 rounded-full flex gap-1">
                    {['ground', 'first'].map(f => (
                      <button key={f} onClick={() => setOuterFloor(f as OuterFloor)} className={`px-4 py-1 rounded-full text-xs transition-all ${outerFloor === f ? 'bg-primary text-primary-foreground' : 'text-slate-400'}`}>{f === 'ground' ? 'Ground' : '1st Floor'}</button>
                    ))}
                  </div>
               </div>

               <div className="relative aspect-[4/3] w-full border border-white/10 rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center p-8">
                  <div className="relative w-full h-full border border-dashed border-white/20 rounded-lg">
                    {/* Simplified Blueprint UI */}
                    {['north', 'south'].map(w => (
                      <div key={w} className={`absolute ${w === 'north' ? 'top-2' : 'bottom-2'} left-2 right-2 flex gap-1 h-6`}>
                        {OUTER_INDICES.map(i => {
                          const k = `${w}-wall-${i}-${outerFloor}`;
                          const isSel = selectedPanelKey === k;
                          const lock = getLockStatus(k);
                          return <button key={k} onClick={() => setSelectedPanelKey(k)} className={`flex-1 rounded-sm border text-[8px] flex items-center justify-center ${isSel ? 'bg-cyan-500 text-black border-cyan-300' : (lock.isLocked && !lock.isLockedByMe) ? 'bg-red-900 border-red-500' : 'bg-slate-800 border-slate-700 text-white'}`}>{w.charAt(0).toUpperCase()}{i+1}</button>
                        })}
                      </div>
                    ))}
                    {['east', 'west'].map(w => (
                      <div key={w} className={`absolute top-10 bottom-10 ${w === 'west' ? 'left-2' : 'right-2'} flex flex-col gap-1 w-6`}>
                        {OUTER_INDICES.map(i => {
                          const k = `${w}-wall-${i}-${outerFloor}`;
                          const isSel = selectedPanelKey === k;
                          const lock = getLockStatus(k);
                          return <button key={k} onClick={() => setSelectedPanelKey(k)} className={`flex-1 rounded-sm border text-[8px] flex items-center justify-center ${isSel ? 'bg-cyan-500 text-black border-cyan-300' : (lock.isLocked && !lock.isLockedByMe) ? 'bg-red-900 border-red-500' : 'bg-slate-800 border-slate-700 text-white'}`}>{w.charAt(0).toUpperCase()}{i+1}</button>
                        })}
                      </div>
                    ))}
                    {outerFloor === 'ground' && (
                      <div className="absolute inset-16 border border-cyan-500/20 rounded bg-cyan-500/5 flex items-center justify-center">
                        <span className="text-[10px] text-cyan-500/50 uppercase tracking-widest font-bold">Inner Walls</span>
                      </div>
                    )}
                  </div>
               </div>
               <div className="text-xs text-slate-400">
                Selected: <span className="text-white font-medium">{selectedPanelKey ? `${getFriendlyLabel(selectedPanelKey)} (#${getTokenIdForPanel(selectedPanelKey)})` : 'None'}</span>
               </div>
            </div>

            {selectedPanelKey && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>Panel Display Name</Label>
                    <Input value={currentConfig.collection_name || ''} onChange={e => setCurrentConfig(p => ({...p, collection_name: e.target.value}))} placeholder="My Display Name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Lock Duration (Days, 0 to Unlock)</Label>
                    <Input type="number" min={0} max={30} value={lockDurationDays} onChange={e => setLockDurationDays(Number(e.target.value))} />
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <Label className="text-sm font-bold">Show Entire Collection</Label>
                      <p className="text-xs text-muted-foreground">Allows users to cycle tokens on this wall.</p>
                    </div>
                    <Switch checked={currentConfig.show_collection || false} onCheckedChange={v => setCurrentConfig(p => ({...p, show_collection: v}))} />
                  </div>
                </div>
                <Button className="w-full" onClick={handleSave} disabled={isLoading || (selectedLock?.isLocked && !selectedLock?.isLockedByMe)}>
                  {isLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : 'Save & Update Gallery'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:sticky lg:top-8 h-fit">
          <NftPreviewPane contractAddress={FIXED_CONTRACT_ADDRESS} tokenId={selectedPanelKey ? getTokenIdForPanel(selectedPanelKey) : null} />
        </div>
      </div>
    </div>
  );
};

export default GalleryConfig;