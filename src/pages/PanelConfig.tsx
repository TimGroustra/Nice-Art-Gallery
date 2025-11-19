import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useEthers } from '@/hooks/useEthers';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const ADMIN_NFT_CONTRACT = '0xcff0d88Ed5311bAB09178b6ec19A464100880984';
const MINIMUM_NFT_BALANCE = 5;
const ERC721_ABI = ['function balanceOf(address owner) view returns (uint256)'];

type PanelConfig = {
  panel_key: string;
  collection_name: string;
  contract_address: string;
  default_token_id: number;
};

const PanelConfigPage = () => {
  const { account, connectWallet, provider, error: walletError } = useEthers();
  const [status, setStatus] = useState<'idle' | 'checking' | 'unauthorized' | 'authorized' | 'loading' | 'saving' | 'error'>('idle');
  const [config, setConfig] = useState<PanelConfig[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkAuthorization = useCallback(async () => {
    if (!account || !provider) return;

    setStatus('checking');
    setErrorMessage(null);

    try {
      const contract = new ethers.Contract(ADMIN_NFT_CONTRACT, ERC721_ABI, provider);
      const balance = await contract.balanceOf(account);
      
      if (Number(balance) >= MINIMUM_NFT_BALANCE) {
        setStatus('authorized');
      } else {
        setErrorMessage(`Access denied. You need at least ${MINIMUM_NFT_BALANCE} ElectroGems NFTs to access this page.`);
        setStatus('unauthorized');
      }
    } catch (err) {
      console.error('Error checking NFT balance:', err);
      setErrorMessage('Could not verify your NFT balance. Please ensure you are on the Electroneum network.');
      setStatus('error');
    }
  }, [account, provider]);

  const fetchConfig = useCallback(async () => {
    setStatus('loading');
    const { data, error } = await supabase
      .from('gallery_config')
      .select('*')
      .order('panel_key', { ascending: true });

    if (error) {
      console.error('Error fetching config:', error);
      setErrorMessage('Failed to load gallery configuration from the database.');
      setStatus('error');
    } else {
      setConfig(data as PanelConfig[]);
      setStatus('authorized'); // Back to authorized state after loading
    }
  }, []);

  useEffect(() => {
    if (account && provider) {
      checkAuthorization();
    }
  }, [account, provider, checkAuthorization]);

  useEffect(() => {
    if (status === 'authorized' && config.length === 0) {
      fetchConfig();
    }
  }, [status, config.length, fetchConfig]);

  const handleInputChange = (index: number, field: keyof PanelConfig, value: string) => {
    const newConfig = [...config];
    const parsedValue = field === 'default_token_id' ? parseInt(value, 10) || 1 : value;
    (newConfig[index] as any)[field] = parsedValue;
    setConfig(newConfig);
  };

  const handleSave = async () => {
    setStatus('saving');
    const { error } = await supabase.from('gallery_config').upsert(config);

    if (error) {
      console.error('Error saving config:', error);
      toast.error('Failed to save configuration.', { description: error.message });
      setStatus('error');
      setErrorMessage('An error occurred while saving.');
    } else {
      toast.success('Configuration saved successfully!');
      setStatus('authorized');
    }
  };

  const renderContent = () => {
    if (!account) {
      return (
        <div className="text-center">
          <p className="mb-4">Please connect your wallet to continue.</p>
          <Button onClick={connectWallet}>Connect Wallet</Button>
          {walletError && <p className="text-red-500 mt-4">{walletError}</p>}
        </div>
      );
    }

    if (status === 'checking' || status === 'loading') {
      return <p>Loading...</p>;
    }
    
    if (status === 'unauthorized' || status === 'error') {
      return <p className="text-red-500">{errorMessage}</p>;
    }

    if (status === 'authorized' || status === 'saving') {
      return (
        <>
          <div className="space-y-4">
            {config.map((panel, index) => (
              <Card key={panel.panel_key}>
                <CardHeader>
                  <CardTitle>{panel.panel_key}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`name-${index}`}>Collection Name</Label>
                    <Input id={`name-${index}`} value={panel.collection_name} onChange={(e) => handleInputChange(index, 'collection_name', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`contract-${index}`}>Contract Address</Label>
                    <Input id={`contract-${index}`} value={panel.contract_address} onChange={(e) => handleInputChange(index, 'contract_address', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`token-${index}`}>Default Token ID</Label>
                    <Input id={`token-${index}`} type="number" value={panel.default_token_id} onChange={(e) => handleInputChange(index, 'default_token_id', e.target.value)} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <Button onClick={handleSave} disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Gallery Panel Configuration</h1>
        <p className="text-gray-400 mb-6">Manage the NFTs displayed in the gallery. You must hold at least 5 ElectroGems to make changes.</p>
        {renderContent()}
      </div>
    </div>
  );
};

export default PanelConfigPage;