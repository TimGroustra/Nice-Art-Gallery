import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { getCachedNftMetadata } from '@/utils/metadataCache';

interface GalleryConfig {
  panel_key: string;
  collection_name: string | null;
  contract_address: string | null;
  default_token_id: number | null;
  show_collection: boolean | null;
}

const GalleryConfig = () => {
  const [panelKeys, setPanelKeys] = useState<string[]>([]);
  const [selectedPanelKey, setSelectedPanelKey] = useState<string>('');
  const [currentConfig, setCurrentConfig] = useState<Partial<GalleryConfig>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isNameLoading, setIsNameLoading] = useState(false);

  useEffect(() => {
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
  }, []);

  const fetchPanelConfig = useCallback(async (panelKey: string) => {
    if (!panelKey) {
      setCurrentConfig({});
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase.from('gallery_config').select('*').eq('panel_key', panelKey).single();
    if (error) {
      toast.error(`Failed to fetch config for ${panelKey}`);
      console.error(error);
      setCurrentConfig({ panel_key: panelKey, show_collection: true }); // Set key so user can create a new one
    } else {
      setCurrentConfig(data);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (selectedPanelKey) {
      fetchPanelConfig(selectedPanelKey);
    }
  }, [selectedPanelKey, fetchPanelConfig]);

  useEffect(() => {
    const fetchCollectionName = async () => {
      if (currentConfig.contract_address && /^(0x)?[0-9a-fA-F]{40}$/.test(currentConfig.contract_address)) {
        setIsNameLoading(true);
        const metadata = await getCachedNftMetadata(currentConfig.contract_address, 1);
        if (metadata) {
          let collectionName = metadata.title;
          // Strip token-specific parts like " #123"
          if (collectionName) {
            collectionName = collectionName.replace(/\s*#\d+$/, '').trim();
          }
          setCurrentConfig(prev => ({ ...prev, collection_name: collectionName }));
        } else {
          setCurrentConfig(prev => ({ ...prev, collection_name: 'Unknown Collection' }));
          toast.warning('Could not retrieve collection name for this address.');
        }
        setIsNameLoading(false);
      } else if (selectedPanelKey) {
        setCurrentConfig(prev => ({ ...prev, collection_name: '' }));
      }
    };

    const timer = setTimeout(() => {
      fetchCollectionName();
    }, 500); // Debounce the fetch to avoid spamming requests while typing

    return () => clearTimeout(timer);
  }, [currentConfig.contract_address, selectedPanelKey]);

  const handleSave = async () => {
    if (!selectedPanelKey) {
      toast.error('Please select a panel to configure.');
      return;
    }
    setIsLoading(true);
    const dataToUpsert = {
      panel_key: selectedPanelKey,
      collection_name: currentConfig.collection_name || null,
      contract_address: currentConfig.contract_address || null,
      default_token_id: currentConfig.default_token_id ? Number(currentConfig.default_token_id) : 1,
      show_collection: currentConfig.show_collection ?? true,
    };

    const { error } = await supabase.from('gallery_config').upsert(dataToUpsert);

    if (error) {
      toast.error('Failed to save configuration.');
      console.error(error);
    } else {
      toast.success('Configuration saved successfully!');
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

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Gallery Configuration</CardTitle>
            <CardDescription>Select a panel to edit its NFT collection and token.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
                    placeholder={isNameLoading ? 'Fetching name...' : 'Auto-fetched from contract'}
                    disabled
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
      </div>
    </div>
  );
};

export default GalleryConfig;