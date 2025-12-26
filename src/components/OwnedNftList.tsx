import React from 'react';
import { useAvailableGems } from '@/hooks/use-available-gems';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata } from '@/utils/nftFetcher';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, PackageOpen } from 'lucide-react';

const ELECTRO_GEMS_ADDRESS = "0xcff0d88Ed5311bAB09178b6ec19A464100880984";

const NftCard = ({ tokenId }: { tokenId: string }) => {
  const [metadata, setMetadata] = React.useState<NftMetadata | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetch = async () => {
      try {
        const data = await getCachedNftMetadata(ELECTRO_GEMS_ADDRESS, parseInt(tokenId));
        setMetadata(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [tokenId]);

  if (loading) return <Skeleton className="aspect-square w-full rounded-lg" />;

  return (
    <Card className="overflow-hidden group hover:ring-2 hover:ring-primary transition-all duration-300 bg-secondary/20 border-primary/5">
      <div className="aspect-square relative overflow-hidden bg-black">
        {metadata?.contentUrl ? (
          <img 
            src={metadata.contentUrl} 
            alt={metadata.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            No Image
          </div>
        )}
      </div>
      <CardContent className="p-3">
        <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">ElectroGem</p>
        <p className="text-sm font-black truncate">#{tokenId}</p>
      </CardContent>
    </Card>
  );
};

export const OwnedNftList = ({ address }: { address: string }) => {
  const { ownedTokens, isLoading, error } = useAvailableGems(address);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="aspect-[4/5] w-full" />)}
      </div>
    );
  }

  if (error) return <div className="text-destructive text-xs py-4 text-center">{error}</div>;

  if (ownedTokens.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 opacity-50 bg-secondary/10 rounded-xl border border-dashed">
        <PackageOpen className="h-8 w-8" />
        <p className="text-xs font-medium">No NFTs found in this wallet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">My ElectroGems ({ownedTokens.length})</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ownedTokens.map(id => (
          <NftCard key={id} tokenId={id} />
        ))}
      </div>
    </div>
  );
};