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
import { Loader2, Wallet, AlertTriangle, Gem } from 'lucide-react';
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

// Fixed contract address to use for all panels
const FIXED_CONTRACT_ADDRESS = '0x947321143E176DC02FD4Ac82d5688759dCAb83ed';

// Outer ring indices
const OUTER_INDICES = [0, 1, 2, 3, 4] as const;
type OuterFloor = 'ground' | 'first';
type OuterWall = 'north' | 'south' | 'east' | 'west';

// Inner 30x30 walls (cross) – ground floor only
const INNER_WALL_KEYS = [
  'north-inner-wall-outer-0',
  'north-inner-wall-inner-0',
  'north-inner-wall-outer-1',
  'north-inner-wall-inner-1',
  'south-inner-wall-outer-0',
  'south-inner-wall-inner-0',
  'south-inner-wall-outer-1',
  'south-inner-wall-inner-1',
  'east-inner-wall-outer-0',
  'east-inner-wall-inner-0',
  'east-inner-wall-outer-1',
  'east-inner-wall-inner-1',
  'west-inner-wall-outer-0',
  'west-inner-wall-inner-0',
  'west-inner-wall-outer-1',
  'west-inner-wall-inner-1',
] as const;

const PANEL_LABELS: Record<string, string> = {
  // Inner cross walls – north
  'north-inner-wall-outer-0': 'Inner North – West Segment (Outer Face)',
  'north-inner-wall-inner-0': 'Inner North – West Segment (Inner Face)',
  'north-inner-wall-outer-1': 'Inner North – East Segment (Outer Face)',
  'north-inner-wall-inner-1': 'Inner North – East Segment (Inner Face)',
  // Inner cross walls – south
  'south-inner-wall-outer-0': 'Inner South – West Segment (Outer Face)',
  'south-inner-wall-inner-0': 'Inner South – West Segment (Inner Face)',
  'south-inner-wall-outer-1': 'Inner South – East Segment (Outer Face)',
  'south-inner-wall-inner-1': 'Inner South – East Segment (Inner Face)',
  // Inner cross walls – east
  'east-inner-wall-outer-0': 'Inner East – North Segment (Outer Face)',
  'east-inner-wall-inner-0': 'Inner East – North Segment (Inner Face)',
  'east-inner-wall-outer-1': 'Inner East – South Segment (Outer Face)',
  'east-inner-wall-inner-1': 'Inner East – South Segment (Inner Face)',
  // Inner cross walls – west
  'west-inner-wall-outer-0': 'Inner West – North Segment (Outer Face)',
  'west-inner-wall-inner-0': 'Inner West – North Segment (Inner Face)',
  'west-inner-wall-outer-1': 'Inner West – South Segment (Outer Face)',
  'west-inner-wall-inner-1': 'Inner West – South Segment (Inner Face)',
};

const outerLabel = (wall: OuterWall, index: number, floor: OuterFloor) => {
  const base =
    wall === 'north'
      ? 'North Outer Wall'
      : wall === 'south'
      ? 'South Outer Wall'
      : wall === 'east'
      ? 'East Outer Wall'
      : 'West Outer Wall';
  const seg = `Segment ${index + 1}`;
  const floorLabel = floor === 'ground' ? 'Ground' : '1st Floor';
  return `${base} – ${seg} (${floorLabel})`;
};

const formatWalletAddress = (address: string | undefined | null) => {
  if (!address) return 'N/A';
  const len = address.length;
  if (len <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(len - 4)}`;
};

// Default visual colors used by the 3D scene – we still persist them, but not editable here
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

  const [panelKeys, setPanelKeys] = useState<string[]>([]);
  const [selectedPanelKey, setSelectedPanelKey] = useState<string>('');
  const [currentConfig, setCurrentConfig] = useState<Partial<GalleryConfigRow>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [panelLocks, setPanelLocks] = useState<PanelLock[]>([]);
  const [lockDurationDays, setLockDurationDays] = useState(1);
  const [outerFloor, setOuterFloor] = useState<OuterFloor>('ground');

  const isAuthorized =
    isConnected && !!walletAddress && !isGemsLoading && ownedTokens.length >= REQUIRED_GEM_BALANCE;

  // Lock helpers
  const getLockStatus = useCallback(
    (panelKey: string) => {
      const lock = panelLocks.find((l) => l.panel_id === panelKey);
      if (!lock) {
        return {
          isLocked: false,
          isLockedByMe: false,
          lockedUntil: null as Date | null,
          lockingGemTokenId: null as string | null,
        };
      }
      const lockedUntilDate = new Date(lock.locked_until);
      const now = new Date();
      if (lockedUntilDate <= now) {
        return {
          isLocked: false,
          isLockedByMe: false,
          lockedUntil: null,
          lockingGemTokenId: null,
        };
      }
      const isLockedByMe =
        !!walletAddress &&
        lock.locked_by_address &&
        lock.locked_by_address.toLowerCase() === walletAddress.toLowerCase();
      return {
        isLocked: true,
        isLockedByMe,
        lockedUntil: lockedUntilDate,
        lockingGemTokenId: lock.locking_gem_token_id,
      };
    },
    [panelLocks, walletAddress],
  );

  // Redirect / auth check
  useEffect(() => {
    if (!isConnected || !walletAddress) {
      toast.warning('Please connect your wallet to access configuration.');
      navigate('/login');
      return;
    }
    if (!isGemsLoading && ownedTokens.length > 0 && ownedTokens.length < REQUIRED_GEM_BALANCE) {
      toast.error(
        `Access denied. You need at least ${REQUIRED_GEM_BALANCE} ElectroGems to configure the gallery.`,
      );
    }
  }, [isConnected, walletAddress, isGemsLoading, ownedTokens.length, navigate]);

  // Fetch panel keys + locks
  useEffect(() => {
    if (!isAuthorized) return;

    const fetchPanelData = async () => {
      const { data: keysData, error: keysError } = await supabase
        .from('gallery_config')
        .select('panel_key');
      if (keysError) {
        console.error(keysError);
        toast.error('Failed to fetch panel keys');
      } else if (keysData) {
        const keys = keysData.map((k) => k.panel_key).sort();
        setPanelKeys(keys);
      }

      const { data: locksData, error: locksError } = await supabase
        .from('panel_locks')
        .select('panel_id, locked_by_address, locked_until, locking_gem_token_id');

      if (locksError) {
        console.error('Failed to fetch panel locks:', locksError);
      } else if (locksData) {
        setPanelLocks(
          locksData.map((lock) => ({
            ...lock,
            panel_id: lock.panel_id,
            locking_gem_token_id: lock.locking_gem_token_id,
          })),
        );
      }
    };

    fetchPanelData();
  }, [isAuthorized]);

  // Deterministically assign a unique token ID per panel key.
  // We define an ordered list of known panel keys and map index -> tokenId = index + 1.
  const getTokenIdForPanel = useCallback((panelKey: string): number => {
    const ordered: string[] = [];

    // Outer walls in a consistent order
    OUTER_INDICES.forEach((i) => ordered.push(`north-wall-${i}`));
    OUTER_INDICES.forEach((i) => ordered.push(`south-wall-${i}`));
    OUTER_INDICES.forEach((i) => ordered.push(`east-wall-${i}`));
    OUTER_INDICES.forEach((i) => ordered.push(`west-wall-${i}`));

    // Inner 30x30 walls
    ordered.push(...INNER_WALL_KEYS);

    // Deduplicate for safety
    const unique = Array.from(new Set(ordered));
    const index = unique.indexOf(panelKey);
    if (index === -1) {
      // Fallback for any unexpected keys: map after known ones
      return unique.length + 1;
    }
    return index + 1; // Token IDs start at 1
  }, []);

  // Fetch config for selected panel, but always enforce fixed contract + unique token mapping
  const fetchPanelConfig = useCallback(
    async (panelKey: string) => {
      if (!panelKey) {
        setCurrentConfig({});
        return;
      }
      setIsLoading(true);
      const { data, error } = await supabase
        .from('gallery_config')
        .select('*')
        .eq('panel_key', panelKey)
        .single();

      const mappedTokenId = getTokenIdForPanel(panelKey);

      if (error && error.code !== 'PGRST116') {
        console.error(error);
        toast.error(`Failed to fetch config for ${panelKey}`);
        setCurrentConfig({
          panel_key: panelKey,
          collection_name: null,
          contract_address: FIXED_CONTRACT_ADDRESS,
          default_token_id: mappedTokenId,
          show_collection: false,
        });
      } else if (data) {
        const row = data as GalleryConfigRow;
        setCurrentConfig({
          panel_key: row.panel_key,
          collection_name: row.collection_name,
          // Enforce our fixed contract + mapped token
          contract_address: FIXED_CONTRACT_ADDRESS,
          default_token_id: mappedTokenId,
          show_collection: row.show_collection ?? false,
        });
      } else {
        // No existing row, initialize with fixed contract + token mapping
        setCurrentConfig({
          panel_key: panelKey,
          collection_name: null,
          contract_address: FIXED_CONTRACT_ADDRESS,
          default_token_id: mappedTokenId,
          show_collection: false,
        });
      }
      setIsLoading(false);
    },
    [getTokenIdForPanel],
  );

  useEffect(() => {
    if (isAuthorized && selectedPanelKey) {
      fetchPanelConfig(selectedPanelKey);
    }
  }, [isAuthorized, selectedPanelKey, fetchPanelConfig]);

  // Blueprint helpers
  const getOuterPanelKey = (wall: OuterWall, index: number) =>
    `${wall}-wall-${index}`;

  const isOuterSelected = (wall: OuterWall, index: number) =>
    selectedPanelKey === getOuterPanelKey(wall, index);

  const getFriendlyLabel = (panelKey: string): string => {
    if (PANEL_LABELS[panelKey]) return PANEL_LABELS[panelKey];
    const match = panelKey.match(/^(north|south|east|west)-wall-(\d+)$/);
    if (match) {
      const [, wall, idxStr] = match;
      const idx = parseInt(idxStr, 10);
      return outerLabel(wall as OuterWall, idx, outerFloor);
    }
    return panelKey;
  };

  const outerWalls = useMemo(
    () => ['north', 'south', 'east', 'west'] as OuterWall[],
    [],
  );

  const handleSelectPanel = (panelKey: string) => {
    if (panelKey === selectedPanelKey) return;
    setSelectedPanelKey(panelKey);
  };

  // Save handler – uses existing upsert, but forces our contract + token mapping
  const handleSave = async () => {
    if (!isAuthorized) {
      toast.error('You are not authorized to save configurations.');
      return;
    }
    if (!selectedPanelKey) {
      toast.error('Please select a panel to configure from the blueprint.');
      return;
    }

    setIsLoading(true);
    const lockStatus = getLockStatus(selectedPanelKey);

    if (lockStatus.isLocked && !lockStatus.isLockedByMe) {
      toast.error(
        `Panel is currently locked by another user until ${lockStatus.lockedUntil?.toLocaleTimeString()}.`,
      );
      setIsLoading(false);
      return;
    }

    let days = Number(lockDurationDays);
    days = Math.max(0, Math.min(30, days));

    const mappedTokenId = getTokenIdForPanel(selectedPanelKey);

    // We let users change collection_name and show_collection,
    // but contract + token are always our fixed mapping.
    const dataToUpsert = {
      panel_key: selectedPanelKey,
      collection_name: currentConfig.collection_name || null,
      contract_address: FIXED_CONTRACT_ADDRESS,
      default_token_id: mappedTokenId,
      show_collection: currentConfig.show_collection ?? false,
      wall_color: DEFAULT_WALL_COLOR,
      text_color: DEFAULT_TEXT_COLOR,
    };

    const { error: configError } = await supabase
      .from('gallery_config')
      .upsert(dataToUpsert, { onConflict: 'panel_key' });

    if (configError) {
      console.error(configError);
      toast.error('Failed to save configuration.');
      setIsLoading(false);
      return;
    }

    const lockStatusNow = getLockStatus(selectedPanelKey);

    if (days === 0) {
      if (lockStatusNow.isLockedByMe) {
        const { error: deleteError } = await supabase
          .from('panel_locks')
          .delete()
          .eq('panel_id', selectedPanelKey);

        if (deleteError) {
          console.error(deleteError);
          toast.error('Configuration saved, but failed to unlock panel.');
        } else {
          toast.success(
            `Configuration saved and panel unlocked. ElectroGem #${
              lockStatusNow.lockingGemTokenId || 'N/A'
            } is now available.`,
          );
          setPanelLocks((prev) => prev.filter((l) => l.panel_id !== selectedPanelKey));
          refetchGems();
        }
      } else {
        toast.success('Configuration saved. Panel remains unlocked.');
      }
      setIsLoading(false);
      return;
    }

    // Locking path
    let lockingGemTokenId: string | null = null;

    if (lockStatusNow.isLockedByMe) {
      lockingGemTokenId = lockStatusNow.lockingGemTokenId || null;
      if (!lockingGemTokenId && availableTokens.length > 0) {
        lockingGemTokenId = availableTokens[0];
      }
    } else {
      if (availableTokens.length === 0) {
        toast.error(
          'No available ElectroGem tokens to lock this panel. You must own an unused gem.',
        );
        setIsLoading(false);
        return;
      }
      lockingGemTokenId = availableTokens[0];
    }

    const calculatedLockDurationMs = days * 24 * 60 * 60 * 1000;
    const lockedUntil = new Date(Date.now() + calculatedLockDurationMs).toISOString();

    const lockData = {
      panel_id: selectedPanelKey,
      contract_address: FIXED_CONTRACT_ADDRESS,
      token_id: String(mappedTokenId),
      locked_by_address: walletAddress!,
      locked_until: lockedUntil,
      locking_gem_token_id: lockingGemTokenId,
    };

    const { error: lockError } = await supabase
      .from('panel_locks')
      .upsert(lockData, { onConflict: 'panel_id' });

    if (lockError) {
      console.error(lockError);
      toast.warning('Configuration saved, but failed to update panel lock.');
    } else {
      const gemMessage = lockingGemTokenId ? ` using Gem #${lockingGemTokenId}` : '';
      toast.success(
        `Configuration saved and panel locked for ${days} day${days > 1 ? 's' : ''}${gemMessage}.`,
      );

      setPanelLocks((prev) => {
        const idx = prev.findIndex((l) => l.panel_id === selectedPanelKey);
        const newLock: PanelLock = {
          panel_id: selectedPanelKey,
          locked_by_address: walletAddress!,
          locked_until,
          locking_gem_token_id: lockingGemTokenId,
        };
        if (idx !== -1) {
          const copy = [...prev];
          copy[idx] = newLock;
          return copy;
        }
        return [...prev, newLock];
      });
      refetchGems();
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

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Access Required</CardTitle>
            <CardDescription>
              Gallery configuration requires a connected wallet with sufficient ElectroGem balance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isGemsLoading && (
              <div className="flex items-center space-x-2 text-primary">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Checking ElectroGem ownership for {formatWalletAddress(walletAddress)}...</span>
              </div>
            )}
            {gemsError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Ownership Check Error</AlertTitle>
                <AlertDescription>Could not verify ownership: {gemsError}</AlertDescription>
              </Alert>
            )}
            {ownedTokens.length > 0 && ownedTokens.length < REQUIRED_GEM_BALANCE && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Insufficient Balance</AlertTitle>
                <AlertDescription>
                  You currently hold {ownedTokens.length} ElectroGems. You need at least{' '}
                  {REQUIRED_GEM_BALANCE} to access configuration.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex justify-between items-center pt-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Connected: {formatWalletAddress(walletAddress)}
              </p>
              <Button variant="outline" onClick={() => disconnect()}>
                Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedPanelLockStatus = selectedPanelKey ? getLockStatus(selectedPanelKey) : null;
  const isPanelLockedByOther =
    !!selectedPanelLockStatus?.isLocked && !selectedPanelLockStatus.isLockedByMe;
  const gemUsedForLock = selectedPanelLockStatus?.lockingGemTokenId || null;
  const nextAvailableGem = availableTokens[0];

  const saveButtonText =
    lockDurationDays === 0
      ? 'Save Configuration & Unlock Panel'
      : `Save Configuration & Lock Panel for ${lockDurationDays} Day${
          lockDurationDays > 1 ? 's' : ''
        }`;

  const isSaveDisabled =
    isLoading ||
    isPanelLockedByOther ||
    (!selectedPanelLockStatus?.isLockedByMe &&
      availableTokens.length === 0 &&
      lockDurationDays > 0);

  // Helper for inner 30x30 buttons
  const innerButtonClasses = (key: string) => {
    const lockStatus = getLockStatus(key);
    const isSelected = key === selectedPanelKey;
    const lockedByOther = lockStatus.isLocked && !lockStatus.isLockedByMe;
    return [
      'rounded-sm border text-[9px] flex items-center justify-center transition-colors px-1 py-0.5',
      isSelected
        ? 'bg-cyan-500 text-slate-900 border-cyan-300'
        : lockedByOther
        ? 'bg-red-900/40 border-red-500/60 text-red-100'
        : 'bg-slate-800/80 border-slate-600/80 text-slate-100 hover:bg-slate-700',
    ].join(' ');
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8">
        {/* LEFT */}
        <Card className="space-y-0 overflow-hidden">
          <CardHeader className="border-b pb-4">
            <CardTitle>Gallery Configuration</CardTitle>
            <CardDescription>
              Select a wall panel from the blueprint and edit its display name, scope, and lock.
              All panels show unique tokens from the same contract.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Gem className="h-4 w-4 text-primary" />
                Owned Gems: {ownedTokens.length} | Available for Lock: {availableTokens.length}
              </p>
              <Button variant="outline" onClick={() => disconnect()}>
                Disconnect Wallet
              </Button>
            </div>

            {availableTokens.length === 0 &&
              !isPanelLockedByOther &&
              !selectedPanelLockStatus?.isLockedByMe &&
              lockDurationDays > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>No Gems Available</AlertTitle>
                  <AlertDescription>
                    You must have at least one ElectroGem token that is not currently locking
                    another panel to save a new configuration.
                  </AlertDescription>
                </Alert>
              )}

            {/* Blueprint */}
            <div className="rounded-lg border bg-background p-4 space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <Label className="text-sm font-medium">Gallery Blueprint</Label>
                  <p className="text-xs text-muted-foreground">
                    Outer walls can be toggled between Ground and 1st floor. The inner 30×30 cross
                    is only on the Ground floor.
                  </p>
                </div>
                <div className="inline-flex items-center rounded-full bg-secondary p-1 text-xs">
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-full ${
                      outerFloor === 'ground'
                        ? 'bg-background text-foreground shadow'
                        : 'text-muted-foreground'
                    }`}
                    onClick={() => setOuterFloor('ground')}
                  >
                    Ground
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 rounded-full ${
                      outerFloor === 'first'
                        ? 'bg-background text-foreground shadow'
                        : 'text-muted-foreground'
                    }`}
                    onClick={() => setOuterFloor('first')}
                  >
                    1st Floor
                  </button>
                </div>
              </div>

              <div className="relative mx-auto aspect-[4/3] max-w-2xl border border-dashed border-muted rounded-md bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                {/* 30x30 core outline (only meaningful for ground) */}
                {outerFloor === 'ground' && (
                  <div className="absolute inset-[28%] border border-cyan-400/40 rounded-md" />
                )}

                {/* OUTER WALL PANELS – oriented like the room */}
                {/* North outer wall */}
                <div className="absolute top-3 left-[15%] right-[15%] flex justify-between gap-1">
                  {OUTER_INDICES.map((idx) => {
                    const key = getOuterPanelKey('north', idx);
                    const lockStatus = getLockStatus(key);
                    const isSelected = isOuterSelected('north', idx);
                    const lockedByOther = lockStatus.isLocked && !lockStatus.isLockedByMe;
                    const label = outerFloor === 'first' ? `N${idx + 1} 1F` : `N${idx + 1} G`;
                    return (
                      <button
                        key={key + outerFloor}
                        type="button"
                        onClick={() => handleSelectPanel(key)}
                        className={[
                          'h-6 flex-1 rounded-sm border text-[10px] flex items-center justify-center transition-colors',
                          isSelected
                            ? 'bg-cyan-500 text-slate-900 border-cyan-300'
                            : lockedByOther
                            ? 'bg-red-900/40 border-red-500/60 text-red-100'
                            : 'bg-slate-800/80 border-slate-600/80 text-slate-100 hover:bg-slate-700',
                        ].join(' ')}
                        title={outerLabel('north', idx, outerFloor)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* South outer wall */}
                <div className="absolute bottom-3 left-[15%] right-[15%] flex justify-between gap-1">
                  {OUTER_INDICES.map((idx) => {
                    const key = getOuterPanelKey('south', idx);
                    const lockStatus = getLockStatus(key);
                    const isSelected = isOuterSelected('south', idx);
                    const lockedByOther = lockStatus.isLocked && !lockStatus.isLockedByMe;
                    const label = outerFloor === 'first' ? `S${idx + 1} 1F` : `S${idx + 1} G`;
                    return (
                      <button
                        key={key + outerFloor}
                        type="button"
                        onClick={() => handleSelectPanel(key)}
                        className={[
                          'h-6 flex-1 rounded-sm border text-[10px] flex items-center justify-center transition-colors',
                          isSelected
                            ? 'bg-cyan-500 text-slate-900 border-cyan-300'
                            : lockedByOther
                            ? 'bg-red-900/40 border-red-500/60 text-red-100'
                            : 'bg-slate-800/80 border-slate-600/80 text-slate-100 hover:bg-slate-700',
                        ].join(' ')}
                        title={outerLabel('south', idx, outerFloor)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* West outer wall */}
                <div className="absolute top-[20%] bottom-[20%] left-3 flex flex-col justify-between gap-1">
                  {OUTER_INDICES.map((idx) => {
                    const key = getOuterPanelKey('west', idx);
                    const lockStatus = getLockStatus(key);
                    const isSelected = isOuterSelected('west', idx);
                    const lockedByOther = lockStatus.isLocked && !lockStatus.isLockedByMe;
                    const label = outerFloor === 'first' ? `W${idx + 1} 1F` : `W${idx + 1} G`;
                    return (
                      <button
                        key={key + outerFloor}
                        type="button"
                        onClick={() => handleSelectPanel(key)}
                        className={[
                          'w-7 flex-1 rounded-sm border text-[10px] flex items-center justify-center transition-colors',
                          isSelected
                            ? 'bg-cyan-500 text-slate-900 border-cyan-300'
                            : lockedByOther
                            ? 'bg-red-900/40 border-red-500/60 text-red-100'
                            : 'bg-slate-800/80 border-slate-600/80 text-slate-100 hover:bg-slate-700',
                        ].join(' ')}
                        title={outerLabel('west', idx, outerFloor)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* East outer wall */}
                <div className="absolute top-[20%] bottom-[20%] right-3 flex flex-col justify-between gap-1">
                  {OUTER_INDICES.map((idx) => {
                    const key = getOuterPanelKey('east', idx);
                    const lockStatus = getLockStatus(key);
                    const isSelected = isOuterSelected('east', idx);
                    const lockedByOther = lockStatus.isLocked && !lockStatus.isLockedByMe;
                    const label = outerFloor === 'first' ? `E${idx + 1} 1F` : `E${idx + 1} G`;
                    return (
                      <button
                        key={key + outerFloor}
                        type="button"
                        onClick={() => handleSelectPanel(key)}
                        className={[
                          'w-7 flex-1 rounded-sm border text-[10px] flex items-center justify-center transition-colors',
                          isSelected
                            ? 'bg-cyan-500 text-slate-900 border-cyan-300'
                            : lockedByOther
                            ? 'bg-red-900/40 border-red-500/60 text-red-100'
                            : 'bg-slate-800/80 border-slate-600/80 text-slate-100 hover:bg-slate-700',
                        ].join(' ')}
                        title={outerLabel('east', idx, outerFloor)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* INNER 30x30 CROSS – Ground floor only */}
                {outerFloor === 'ground' && (
                  <>
                    {/* North inner wall */}
                    <div className="absolute top-[30%] left-[30%] right-[30%] flex justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('north-inner-wall-outer-0')}
                        className={innerButtonClasses('north-inner-wall-outer-0')}
                        title={PANEL_LABELS['north-inner-wall-outer-0']}
                      >
                        N‑O W
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('north-inner-wall-inner-0')}
                        className={innerButtonClasses('north-inner-wall-inner-0')}
                        title={PANEL_LABELS['north-inner-wall-inner-0']}
                      >
                        N‑I W
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('north-inner-wall-inner-1')}
                        className={innerButtonClasses('north-inner-wall-inner-1')}
                        title={PANEL_LABELS['north-inner-wall-inner-1']}
                      >
                        N‑I E
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('north-inner-wall-outer-1')}
                        className={innerButtonClasses('north-inner-wall-outer-1')}
                        title={PANEL_LABELS['north-inner-wall-outer-1']}
                      >
                        N‑O E
                      </button>
                    </div>

                    {/* South inner wall */}
                    <div className="absolute bottom-[30%] left-[30%] right-[30%] flex justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('south-inner-wall-outer-0')}
                        className={innerButtonClasses('south-inner-wall-outer-0')}
                        title={PANEL_LABELS['south-inner-wall-outer-0']}
                      >
                        S‑O W
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('south-inner-wall-inner-0')}
                        className={innerButtonClasses('south-inner-wall-inner-0')}
                        title={PANEL_LABELS['south-inner-wall-inner-0']}
                      >
                        S‑I W
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('south-inner-wall-inner-1')}
                        className={innerButtonClasses('south-inner-wall-inner-1')}
                        title={PANEL_LABELS['south-inner-wall-inner-1']}
                      >
                        S‑I E
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('south-inner-wall-outer-1')}
                        className={innerButtonClasses('south-inner-wall-outer-1')}
                        title={PANEL_LABELS['south-inner-wall-outer-1']}
                      >
                        S‑O E
                      </button>
                    </div>

                    {/* West inner wall */}
                    <div className="absolute top-[35%] bottom-[35%] left-[30%] flex flex-col justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('west-inner-wall-outer-0')}
                        className={innerButtonClasses('west-inner-wall-outer-0')}
                        title={PANEL_LABELS['west-inner-wall-outer-0']}
                      >
                        W‑O N
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('west-inner-wall-inner-0')}
                        className={innerButtonClasses('west-inner-wall-inner-0')}
                        title={PANEL_LABELS['west-inner-wall-inner-0']}
                      >
                        W‑I N
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('west-inner-wall-inner-1')}
                        className={innerButtonClasses('west-inner-wall-inner-1')}
                        title={PANEL_LABELS['west-inner-wall-inner-1']}
                      >
                        W‑I S
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('west-inner-wall-outer-1')}
                        className={innerButtonClasses('west-inner-wall-outer-1')}
                        title={PANEL_LABELS['west-inner-wall-outer-1']}
                      >
                        W‑O S
                      </button>
                    </div>

                    {/* East inner wall */}
                    <div className="absolute top-[35%] bottom-[35%] right-[30%] flex flex-col justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('east-inner-wall-outer-0')}
                        className={innerButtonClasses('east-inner-wall-outer-0')}
                        title={PANEL_LABELS['east-inner-wall-outer-0']}
                      >
                        E‑O N
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('east-inner-wall-inner-0')}
                        className={innerButtonClasses('east-inner-wall-inner-0')}
                        title={PANEL_LABELS['east-inner-wall-inner-0']}
                      >
                        E‑I N
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('east-inner-wall-inner-1')}
                        className={innerButtonClasses('east-inner-wall-inner-1')}
                        title={PANEL_LABELS['east-inner-wall-inner-1']}
                      >
                        E‑I S
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPanel('east-inner-wall-outer-1')}
                        className={innerButtonClasses('east-inner-wall-outer-1')}
                        title={PANEL_LABELS['east-inner-wall-outer-1']}
                      >
                        E‑O S
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="pt-2 border-t border-border mt-3 text-xs text-muted-foreground">
                Selected panel:{' '}
                {selectedPanelKey ? (
                  <span className="font-medium text-foreground">
                    {getFriendlyLabel(selectedPanelKey)} — Token #
                    {getTokenIdForPanel(selectedPanelKey)}
                  </span>
                ) : (
                  <span>None selected. Click a panel above.</span>
                )}
              </div>
            </div>

            {/* Lock status */}
            {selectedPanelKey && selectedPanelLockStatus && (
              <Alert variant="default" className="bg-secondary">
                <Gem className="h-4 w-4" />
                <AlertTitle>Lock Status</AlertTitle>
                <AlertDescription>
                  {selectedPanelLockStatus.isLockedByMe && gemUsedForLock
                    ? `This panel is currently locked by you using ElectroGem Token ID #${gemUsedForLock}. Set duration to 0 to unlock.`
                    : selectedPanelLockStatus.isLockedByMe && !gemUsedForLock && nextAvailableGem
                    ? `This panel is locked by you (legacy lock). Saving will assign available Gem #${nextAvailableGem} and extend the lock. Set duration to 0 to unlock.`
                    : selectedPanelLockStatus.isLockedByMe && !gemUsedForLock && !nextAvailableGem
                    ? `This panel is locked by you (legacy lock). Saving will extend the lock without assigning a new Gem ID. Set duration to 0 to unlock.`
                    : !selectedPanelLockStatus.isLocked && nextAvailableGem
                    ? `Saving will lock this panel using your available ElectroGem Token ID #${nextAvailableGem}.`
                    : 'Select a panel to view lock details.'}
                </AlertDescription>
              </Alert>
            )}

            {selectedPanelKey && (
              <>
                {isPanelLockedByOther && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Panel Locked</AlertTitle>
                    <AlertDescription>
                      This panel is currently locked by another user until{' '}
                      {selectedPanelLockStatus?.lockedUntil?.toLocaleString()}. You cannot edit it
                      now.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="collection_name">Display Name</Label>
                  <Input
                    id="collection_name"
                    name="collection_name"
                    value={currentConfig.collection_name || ''}
                    onChange={handleInputChange}
                    placeholder="e.g., My Awesome Gallery Display"
                    disabled={isLoading || isPanelLockedByOther}
                  />
                </div>

                {/* Show the fixed contract + token as read-only info */}
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    Contract:{' '}
                    <span className="font-mono break-all">
                      {FIXED_CONTRACT_ADDRESS}
                    </span>
                  </p>
                  <p>
                    Token ID:{' '}
                    <span className="font-mono">
                      {selectedPanelKey ? getTokenIdForPanel(selectedPanelKey) : '—'}
                    </span>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lock_duration">
                    Lock Duration (Days, 0 to Unlock, Max 30)
                  </Label>
                  <Input
                    id="lock_duration"
                    name="lock_duration"
                    type="number"
                    min={0}
                    max={30}
                    value={lockDurationDays}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isNaN(value) && value >= 0) {
                        setLockDurationDays(value);
                      }
                    }}
                    placeholder="1"
                    disabled={isLoading || isPanelLockedByOther}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="show_collection" className="text-base">
                      Show Entire Collection
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      If enabled, users can browse all tokens from this contract on this panel. If
                      disabled, only the mapped token is shown.
                    </p>
                  </div>
                  <Switch
                    id="show_collection"
                    checked={currentConfig.show_collection ?? false}
                    onCheckedChange={handleSwitchChange}
                    disabled={isLoading || isPanelLockedByOther}
                  />
                </div>

                <Button onClick={handleSave} disabled={isSaveDisabled}>
                  {isLoading ? 'Saving...' : saveButtonText}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* RIGHT: Preview */}
        <div className="lg:sticky lg:top-8 lg:h-[calc(100vh-4rem)]">
          <NftPreviewPane
            contractAddress={FIXED_CONTRACT_ADDRESS}
            tokenId={
              selectedPanelKey ? getTokenIdForPanel(selectedPanelKey) : null
            }
          />
        </div>
      </div>
    </div>
  );
};

export default GalleryConfig;