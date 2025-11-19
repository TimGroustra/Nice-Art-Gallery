import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftAttribute } from '@/utils/nftFetcher';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface NftPreviewPaneProps {
  contractAddress: string | null;
  tokenId: number | null;
}

const NftPreviewPane: React.FC<NftPreviewPaneProps> = ({ contractAddress, tokenId }) => {
  const [metadata, setMetadata] = useState<NftMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetadata = useCallback(async (address: string, id: number) => {
    setLoading(true);
    setError(null);
    setMetadata(null);
    
    try {
      const result = await getCachedNftMetadata(address, id);
      if (result) {
        setMetadata(result);
      } else {
        setError("Failed to load NFT metadata. Check contract address and token ID, or network status.");
      }
    } catch (e) {
      console.error("Error fetching NFT metadata:", e);
      setError("An unexpected error occurred during fetch.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch if both address is valid and token ID is a positive number
    if (contractAddress && contractAddress.trim() !== '' && tokenId !== null && tokenId >= 0) {
      fetchMetadata(contractAddress, tokenId);
    } else {
      setMetadata(null);
      setError(null);
      setLoading(false);
    }
  }, [contractAddress, tokenId, fetchMetadata]);

  const isVideo = metadata?.contentType.startsWith('video/');

  const renderMedia = () => {
    if (!metadata || !metadata.contentUrl) {
      return (
        <div className="flex items-center justify-center h-64 bg-muted/50 rounded-md">
          <p className="text-muted-foreground">No media URL found.</p>
        </div>
      );
    }

    if (isVideo) {
      return (
        <video 
          src={metadata.contentUrl} 
          controls 
          autoPlay 
          loop 
          muted 
          className="w-full h-auto max-h-96 object-contain rounded-md bg-black"
        />
      );
    }
    
    // Handle image/GIF
    return (
      <img 
        src={metadata.contentUrl} 
        alt={metadata.title} 
        className="w-full h-auto max-h-96 object-contain rounded-md bg-black"
      />
    );
  };

  const renderAttributes = (attributes: NftAttribute[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
      {attributes.map((attr, index) => (
        <div key={index} className="p-2 bg-secondary rounded-md">
          <div className="font-semibold text-secondary-foreground">{attr.trait_type}</div>
          <div className="text-muted-foreground break-words">{attr.value}</div>
        </div>
      ))}
    </div>
  );

  return (
    <Card className="w-full h-fit sticky top-4">
      <CardHeader>
        <CardTitle>NFT Preview</CardTitle>
        <CardDescription>Displays the metadata fetched for the configured contract and token ID.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex flex-col space-y-3 p-4">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            <Skeleton className="h-4 w-[250px] mx-auto" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {error && !loading && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error Loading NFT</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {metadata && !loading && (
          <div className="space-y-4">
            {renderMedia()}
            <h3 className="text-xl font-bold">{metadata.title}</h3>
            <p className="text-sm text-muted-foreground">{metadata.description}</p>
            
            {metadata.attributes && metadata.attributes.length > 0 && (
              <div>
                <h4 className="text-lg font-semibold mb-2">Attributes</h4>
                {renderAttributes(metadata.attributes)}
              </div>
            )}
            
            <p className="text-xs text-gray-500 break-all pt-2 border-t">Source URL: <a href={metadata.source} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{metadata.source}</a></p>
          </div>
        )}
        
        {!contractAddress && !loading && (
             <div className="flex items-center justify-center h-32 bg-muted/50 rounded-md">
                <p className="text-muted-foreground">Enter a Contract Address and Token ID to preview.</p>
            </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NftPreviewPane;