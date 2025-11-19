import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWallet } from '@/hooks/useWallet';
import { supabase } from '@/integrations/supabase/client';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata } from '@/utils/nftFetcher';
import { showError, showSuccess } from '@/utils/toast';

interface LockPanelModalProps {
  panelId: string;
  open: boolean;
  onClose: () => void;
  onLockSuccess: () => void;
}

export const LockPanelModal = ({ panelId, open, onClose, onLockSuccess }: LockPanelModalProps) => {
  const { account } = useWallet();
  const [contractAddress, setContractAddress] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [days, setDays] = useState('7');
  const [preview, setPreview] = useState<NftMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      // Reset state on close
      setContractAddress('');
      setTokenId('');
      setDays('7');
      setPreview(null);
      return;
    };
    
    const fetchLock = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from('panel_locks')
        .select('*')
        .eq('panel_id', panelId)
        .single();
      
      if (data) {
        const isExpired = new Date(data.locked_until) < new Date();
        if (!isExpired && data.locked_by_address.toLowerCase() === account?.toLowerCase()) {
          setContractAddress(data.contract_address);
          setTokenId(data.token_id);
        }
      }
      setIsLoading(false);
    };
    
    fetchLock();
  }, [open, panelId, account]);

  const handlePreview = useCallback(async () => {
    if (!contractAddress || !tokenId) {
      showError("Please enter a contract address and token ID.");
      return;
    }
    setIsLoading(true);
    setPreview(null);
    const metadata = await getCachedNftMetadata(contractAddress, parseInt(tokenId, 10));
    if (metadata) {
      setPreview(metadata);
    } else {
      showError("Could not fetch NFT metadata. Check inputs.");
    }
    setIsLoading(false);
  }, [contractAddress, tokenId]);

  const handleSubmit = async () => {
    if (!account) {
      showError("Wallet not connected.");
      return;
    }
    const numDays = parseInt(days, 10);
    if (isNaN(numDays) || numDays <= 0 || numDays > 30) {
      showError("Please enter a valid number of days (1-30).");
      return;
    }
    if (!preview) {
      showError("Please preview the NFT before locking.");
      return;
    }

    setIsSubmitting(true);
    const lockedUntil = new Date();
    lockedUntil.setDate(lockedUntil.getDate() + numDays);

    const { error } = await supabase
      .from('panel_locks')
      .upsert({
        panel_id: panelId,
        contract_address: contractAddress,
        token_id: tokenId,
        locked_by_address: account,
        locked_until: lockedUntil.toISOString(),
      });

    setIsSubmitting(false);
    if (error) {
      showError(`Failed to lock panel: ${error.message}`);
    } else {
      showSuccess("Panel locked successfully!");
      onLockSuccess();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 text-white border-gray-700">
        <DialogHeader>
          <DialogTitle>Lock Panel: {panelId}</DialogTitle>
          <DialogDescription>
            Set a custom NFT to be displayed on this panel. Requires 5+ ElectroGems.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="contract" className="text-right">Contract</Label>
            <Input id="contract" value={contractAddress} onChange={(e) => setContractAddress(e.target.value)} className="col-span-3 bg-gray-800 border-gray-600" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="token" className="text-right">Token ID</Label>
            <Input id="token" value={tokenId} onChange={(e) => setTokenId(e.target.value)} className="col-span-3 bg-gray-800 border-gray-600" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="days" className="text-right">Days (1-30)</Label>
            <Input id="days" type="number" min="1" max="30" value={days} onChange={(e) => setDays(e.target.value)} className="col-span-3 bg-gray-800 border-gray-600" />
          </div>
        </div>
        {preview && (
          <div className="border rounded-md p-4 border-gray-700">
            <h4 className="font-bold">{preview.title}</h4>
            <img src={preview.contentUrl} alt={preview.title} className="w-full h-auto rounded-md mt-2 max-h-48 object-contain bg-gray-800" />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handlePreview} disabled={isLoading || isSubmitting}>
            {isLoading ? 'Loading...' : 'Preview'}
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || isSubmitting || !preview}>
            {isSubmitting ? 'Locking...' : 'Lock Panel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};