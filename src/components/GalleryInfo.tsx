import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowUpRight } from 'lucide-react';

interface GalleryInfoProps {
  title?: string;
  description?: string;
  collection?: string;
  tokenId?: string | number;
  onOpenMarketplace?: () => void;
}

export const GalleryInfo: React.FC<GalleryInfoProps> = ({
  title,
  description,
  collection,
  tokenId,
  onOpenMarketplace,
}) => {
  if (!title && !description) {
    return null;
  }

  const shortDesc = description ? description.slice(0, 120) + (description.length > 120 ? '…' : '') : '';

  return (
    <div className="fixed top-4 right-4 z-20 w-72 max-w-xs">
      <Card className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg truncate">{title || 'Untitled NFT'}</CardTitle>
          {collection && tokenId !== undefined && (
            <CardDescription className="text-sm text-muted-foreground">
              {collection.slice(0, 6)}…{collection.slice(-4)} / {tokenId}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">{shortDesc}</p>
          {onOpenMarketplace && (
            <Button
              onClick={onOpenMarketplace}
              className="mt-3 w-full"
              variant="outline"
              size="sm"
            >
              <ArrowUpRight className="mr-2 h-4 w-4" /> Open Marketplace
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};