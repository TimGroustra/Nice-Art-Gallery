import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftAttribute } from '@/utils/nftFetcher';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2, ImageOff } from 'lucide-react';

interface NftPreviewPaneProps {
  contractAddress: string | null;
  tokenId: number | null;
}

const NftPreviewPane: React.FC<NftPreviewPaneProps> = ({ contractAddress, tokenId }) => {
  const [metadata, setMetadata] = useState<NftMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetadata = useCallback(async (address: string, id: number) => {
    setLoading(true);
    setError(null);
    setMetadata(null);
    setMediaLoading(true);
    
    try {
      const result = await getCachedNftMetadata(address, id);
      if (result) {
        setMetadata(result);
      } else {
        setError("Could not retrieve NFT metadata. Please check the contract address and token ID.");
      }
    } catch (e) {
      console.error("Error fetching NFT metadata:", e);
      setError("An unexpected error occurred while fetching metadata.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contractAddress && contractAddress.trim().startsWith('0x') && tokenId !== null && tokenId >= 0) {
      fetchMetadata(contractAddress, tokenId);
    } else {
      setMetadata(null);
      setError(null);
      setLoading(false);
    }
  }, [contractAddress, tokenId, fetchMetadata]);

  const renderMedia = () => {
    if (!metadata || !metadata.contentUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-64 bg-muted/30 rounded-lg border-2 border-dashed border-muted">
          <ImageOff className="h-10 w-10 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground font-medium">No media found in metadata</p>
        </div>
      );
    }

    const isVideo = metadata.contentType?.startsWith('video/') || metadata.contentUrl.match(/\.(mp4|webm|ogg|mov)$/i);

    return (
      <div className="relative w-full rounded-lg overflow-hidden bg-black min-h-[250px] flex items-center justify-center border shadow-inner">
        {mediaLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/20 backdrop-blur-sm z-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
          </div>
        )}
        
        {isVideo ? (
          <video 
            src={metadata.contentUrl} 
            controls 
            autoPlay 
            loop 
            muted 
            onLoadedData={() => setMediaLoading(false)}
            onError={() => setMediaLoading(false)}
            className="w-full h-auto max-h-[500px] object-contain block mx-auto"
          />
        ) : (
          <img 
            src={metadata.contentUrl} 
            alt={metadata.title} 
            onLoad={() => setMediaLoading(false)}
            onError={() => setMediaLoading(false)}
            className="w-full h-auto max-h-[500px] object-contain block mx-auto"
          />
        )}
      </div>
    );
  };

  const renderAttributes = (attributes: NftAttribute[]) => (
    <div className="grid grid-cols-2 gap-2 mt-4">
      {attributes.map((attr, index) => (
        <div key={index} className="p-3 bg-secondary/50 rounded-lg border border-border/50">
          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1 truncate">{attr.trait_type}</div>
          <div className="text-sm font-semibold truncate" title={String(attr.value)}>{attr.value}</div>
        </div>
      ))}
    </div>
  );

  return (
    <Card className="w-full shadow-lg border-primary/10 overflow-hidden">
      <CardHeader className="bg-secondary/20 pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          Asset Preview
        </CardTitle>
        <CardDescription className="text-xs">Live visualization of the configured Electroneum asset.</CardDescription>
      </CardHeader>
      
      <CardContent className="p-6 space-y-6">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-[300px] w-full rounded-lg" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive" className="bg-destructive/5 border-destructive/20">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm font-bold">Metadata Fetch Failed</AlertTitle>
            <AlertDescription className="text-xs mt-1">{error}</AlertDescription>
          </Alert>
        ) : metadata ? (
          <div className="animate-in fade-in duration-500 space-y-5">
            {renderMedia()}
            
            <div className="space-y-2">
              <h3 className="text-xl font-black tracking-tight leading-tight">{metadata.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{metadata.description}</p>
            </div>
            
            {metadata.attributes && metadata.attributes.length > 0 && (
              <div className="pt-2">
                <h4 className="text-xs font-bold uppercase tracking-widest text-primary/70">Properties</h4>
                {renderAttributes(metadata.attributes)}
              </div>
            )}
            
            <div className="pt-4 border-t border-border/50">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Metadata Source</span>
                <a 
                  href={metadata.source} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-[10px] font-mono text-primary hover:underline break-all block bg-primary/5 p-2 rounded border border-primary/10"
                >
                  {metadata.source}
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 text-muted-foreground opacity-50">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <ImageOff className="h-8 w-8" />
            </div>
            <div className="max-w-[200px] mx-auto">
              <p className="text-sm font-bold">Waiting for details</p>
              <p className="text-xs">Enter a valid contract address and token ID to see the asset.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NftPreviewPane;