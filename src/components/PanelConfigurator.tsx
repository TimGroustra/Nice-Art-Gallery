import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWallet } from '@/context/WalletContext';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import type { NftMetadata } from '@/utils/nftFetcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, X } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';

interface PanelConfiguratorProps {
  panelId: string;
  onClose: () => void;
  onSave: (panelId: string, contractAddress: string, tokenId: number) => void;
}

const PanelConfigurator: React.FC<PanelConfiguratorProps> = ({ panelId, onClose, onSave }) => {
  const { address } = useWallet();
  const [contractAddress, setContractAddress] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [duration, setDuration] = useState(7);
  const [previewMeta, setPreviewMeta] = useState<NftMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Debounce mechanism
  useEffect(() => {
    setIsPreviewLoading(true);
    const handler = setTimeout(() => {
      if (contractAddress && tokenId) {
        getCachedNftMetadata(contractAddress, parseInt(tokenId, 10))
          .then(meta => setPreviewMeta(meta))
          .finally(() => setIsPreviewLoading(false));
      } else {
        setPreviewMeta(null);
        setIsPreviewLoading(false);
      }
    }, 500); // 500ms delay

    return () => clearTimeout(handler);
  }, [contractAddress, tokenId]);

  const handleSave = async () => {
    if (!address || !contractAddress || !tokenId || !duration) {
      showError("Please fill all fields.");
      return;
    }
    if (!previewMeta) {
      showError("Cannot save, NFT preview failed to load.");
      return;
    }

    setIsLoading(true);
    const lockUntil = new Date();
    lockUntil.setDate(lockUntil.getDate() + duration);

    const { error } = await supabase.from('panel_locks').upsert({
      panel_id: panelId,
      contract_address: contractAddress,
      token_id: tokenId,
      locked_by_address: address,
      locked_until: lockUntil.toISOString(),
    });

    setIsLoading(false);
    if (error) {
      showError(`Failed to save configuration: ${error.message}`);
    } else {
      showSuccess("Panel configuration saved!");
      onSave(panelId, contractAddress, parseInt(tokenId, 10));
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <Card className="w-[90vw] max-w-lg bg-gray-900 text-white border-gray-700" onClick={e => e.stopPropagation()}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Configure Panel</CardTitle>
              <CardDescription className="text-gray-400">Set a new NFT for panel: {panelId}</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="contract">Contract Address</Label>
              <Input id="contract" value={contractAddress} onChange={e => setContractAddress(e.target.value)} placeholder="0x..." className="bg-gray-800 border-gray-600" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="token">Token ID</Label>
              <Input id="token" type="number" value={tokenId} onChange={e => setTokenId(e.target.value)} placeholder="123" className="bg-gray-800 border-gray-600" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="duration">Lock Duration (1-30 days)</Label>
            <Input id="duration" type="number" value={duration} onChange={e => setDuration(Math.max(1, Math.min(30, Number(e.target.value))))} className="bg-gray-800 border-gray-600" />
          </div>
          
          <div className="mt-2">
            <Label>Preview</Label>
            <div className="mt-2 w-full h-48 bg-gray-800 rounded-md flex items-center justify-center border border-gray-700">
              {isPreviewLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              ) : previewMeta ? (
                <img src={previewMeta.contentUrl} alt={previewMeta.title} className="max-w-full max-h-full object-contain rounded-md" />
              ) : (
                <p className="text-gray-500">Enter details to see preview</p>
              )}
            </div>
            {previewMeta && <p className="text-center mt-2 text-sm font-semibold">{previewMeta.title}</p>}
          </div>

          <div className="flex justify-end gap-4 mt-4">
            <Button variant="outline" onClick={onClose} className="border-gray-600 text-gray-300 hover:bg-gray-700">Cancel</Button>
            <Button onClick={handleSave} disabled={isLoading || isPreviewLoading || !previewMeta}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Configuration
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PanelConfigurator;