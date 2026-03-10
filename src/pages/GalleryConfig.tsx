import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import NftPreviewPane from '@/components/NftPreviewPane';
import { Loader2, Gem, ArrowLeft } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useAvailableGems } from '@/hooks/use-available-gems';
import SettingsPanel from '@/components/gallery-config/SettingsPanel';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { GALLERY_PANEL_CONFIG } from '@/config/gallery-config';

interface GalleryConfigRow {
  panel_key: string;
  collection_name: string | null;
  contract_address: string | null;
  default_token_id: number | null;
  show_collection: boolean | null;
}

/** Mapping of panel keys for the simplified layout */
const OUTER_PANEL_KEYS = Object.keys(GALLERY_PANEL_CONFIG).filter(
  (k) => /-(ground|first)$/.test(k) && !k.includes('inner-wall')
);
const OUTWARD_PLUS_KEYS = Object.keys(GALLERY_PANEL_CONFIG).filter(
  (k) => k.includes('inner-wall-outer')
);
// 40 outer + 8 outward‑facing = 48 total panels available for individual gems
const AVAILABLE_PANEL_KEYS = [...OUTER_PANEL_KEYS, ...OUTWARD_PLUS_KEYS];

// Assume Lumivane token ID is a known special ID (e.g., 999). If not, it will simply receive the inward panels.
const LUMIVANE_TOKEN_ID = 999; // placeholder – replace with real token ID if known

const GalleryConfig = () => {
  const navigate = useNavigate();
  const { address: walletAddress, isConnected } = useAccount();

  const {
    ownedTokens,
    isLoading: isGemsLoading,
    refetch: refetchGems,
  } = useAvailableGems(walletAddress || null);

  const [selectedPanelKey, setSelectedPanelKey] = useState<string>('');
  const [currentConfig, setCurrentConfig] = useState<Partial<GalleryConfigRow>>({});
  const [isLoading, setIsLoading] = useState(false);

  /** Build a deterministic mapping from each owned gem token to a panel key */
  const gemToPanelMap = useMemo(() => {
    const map = new Map<string, string>(); // tokenId -> panelKey
    const sortedTokens = ownedTokens
      .filter((t) => t !== String(LUMIVANE_TOKEN_ID))
      .sort((a, b) => Number(a) - Number(b));

    sortedTokens.forEach((tokenId, idx) => {
      const panelKey = AVAILABLE_PANEL_KEYS[idx % AVAILABLE_PANEL_KEYS.length];
      map.set(tokenId, panelKey);
    });

    // Assign all inward‑facing panels to Lumivane (if owned)
    if (ownedTokens.includes(String(LUMIVANE_TOKEN_ID))) {
      const inwardKeys = Object.keys(GALLERY_PANEL_CONFIG).filter((k) =>
        k.includes('inner-wall-inner')
      );
      inwardKeys.forEach((key) => {
        map.set(String(LUMIVANE_TOKEN_ID), key);
      });
    }

    return map;
  }, [ownedTokens]);

  /** List of panel options the user can configure (derived from owned gems) */
  const panelOptions = useMemo(() => {
    const options: { tokenId: string; panelKey: string }[] = [];

    ownedTokens.forEach((tokenId) => {
      const panelKey = gemToPanelMap.get(tokenId);
      if (panelKey) {
        options.push({ tokenId, panelKey });
      }
    });

    return options;
  }, [ownedTokens, gemToPanelMap]);

  /** Fetch configuration for a given panel key */
  const fetchPanelConfig = useCallback(
    async (panelKey: string) => {
      if (!panelKey) {
        setCurrentConfig({});
        return;
      }
      setIsLoading(true);
      const { data } = await supabase
        .from('gallery_config')
        .select('*')
        .eq('panel_key', panelKey)
        .single();

      setCurrentConfig({
        panel_key: panelKey,
        collection_name: data?.collection_name || '',
        contract_address: data?.contract_address || '',
        default_token_id: data?.default_token_id || 1,
        show_collection: data?.show_collection ?? false,
      });
      setIsLoading(false);
    },
    []
  );

  /** When a panel is selected from the dropdown, load its config */
  useEffect(() => {
    if (selectedPanelKey) {
      fetchPanelConfig(selectedPanelKey);
    } else {
      setCurrentConfig({});
    }
  }, [selectedPanelKey, fetchPanelConfig]);

  /** Guard for non‑connected users or insufficient gems */
  useEffect(() => {
    if (!isConnected || !walletAddress) {
      navigate('/portal');
      return;
    }
    if (!isGemsLoading && ownedTokens.length < 1) {
      toast.error('You do not own any ElectroGems to configure panels.');
      navigate('/portal');
    }
  }, [isConnected, walletAddress, isGemsLoading, ownedTokens.length, navigate]);

  const handleSave = async () => {
    if (isGemsLoading || !selectedPanelKey) return;

    if (!currentConfig.contract_address?.trim()) {
      toast.error('Please enter a contract address.');
      return;
    }

    setIsLoading(true);
    const { error: cfgErr } = await supabase.from('gallery_config').upsert({
      panel_key: selectedPanelKey,
      collection_name: currentConfig.collection_name || null,
      contract_address: currentConfig.contract_address.trim(),
      default_token_id: currentConfig.default_token_id || 1,
      show_collection: currentConfig.show_collection ?? false,
    });

    if (cfgErr) {
      toast.error('Save failed.');
    } else {
      toast.success('Configuration saved.');
      refetchGems();
    }
    setIsLoading(false);
  };

  const getFriendlyLabel = useCallback((key: string) => {
    const match = key.match(
      /^(north|south|east|west)-wall-(\d+)-(ground|first)$/
    );
    if (match) {
      const wall = match[1].charAt(0).toUpperCase() + match[1].slice(1);
      const floor = match[3] === 'ground' ? 'G' : '1F';
      return `${wall} Wall Segment ${Number(match[2]) + 1} (${floor})`;
    }

    const innerMatch = key.match(
      /^(north|south|east|west)-inner-wall-(outer|inner)-(\d+)$/
    );
    if (innerMatch) {
      const wall = innerMatch[1].charAt(0).toUpperCase() + innerMatch[1].slice(1);
      const side = innerMatch[2] === 'outer' ? 'Outer' : 'Inner';
      const idx = Number(innerMatch[3]) + 1;
      return `Inner ${wall} ${side} Segment ${idx}`;
    }

    return key;
  }, []);

  return (
    <div className="fixed inset-0 bg-gray-100 dark:bg-gray-900 overflow-y-auto z-[100] p-3 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/portal')}
            className="px-0 hover:bg-transparent text-sm"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Portal
          </Button>
          <div className="flex items-center gap-3 bg-secondary/30 px-3 py-1.5 rounded-full text-xs">
            <Gem className="h-4 w-4 text-primary" />
            <span>
              Gems: <strong>{ownedTokens.length}</strong>
            </span>
          </div>
        </div>

        <h1 className="text-2xl font-bold">Gallery Configuration</h1>
        <p className="text-sm text-muted-foreground">
          Configure only the panels you own through your ElectroGems.
        </p>

        {/* Panel selection dropdown */}
        <Card className="p-4">
          <Select
            value={selectedPanelKey}
            onValueChange={(v) => setSelectedPanelKey(v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a panel to configure…" />
            </SelectTrigger>
            <SelectContent>
              {panelOptions.map(({ tokenId, panelKey }) => (
                <SelectItem key={panelKey} value={panelKey}>
                  {`Gem #${tokenId} – ${getFriendlyLabel(panelKey)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>

        {/* Configuration and preview */}
        {selectedPanelKey && (
          <Card className="flex flex-col lg:flex-row gap-4">
            <CardContent className="flex-1 p-6">
              <SettingsPanel
                selectedPanelKey={selectedPanelKey}
                friendlyLabel={getFriendlyLabel(selectedPanelKey)}
                currentConfig={currentConfig}
                setCurrentConfig={setCurrentConfig}
                handleSave={handleSave}
                isLoading={isLoading}
              />
            </CardContent>

            <CardContent className="flex-1 p-6 border-l lg:border-t-0 border-t">
              <NftPreviewPane
                contractAddress={currentConfig.contract_address || null}
                tokenId={currentConfig.default_token_id || null}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default GalleryConfig;