import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Image } from 'lucide-react';
import { NFTRef } from '@/avatar/AvatarState';

interface SlotPanelProps {
  title: string;
  slots: Record<string, NFTRef | null>;
  onClear: (slot: string) => void;
}

const formatNFTRef = (nft: NFTRef) => {
    return `Token #${nft.tokenId} (${nft.contract.substring(0, 6)}...)`;
}

export function SlotPanel({ title, slots, onClear }: SlotPanelProps) {
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(slots).map(([slot, nft]) => (
          <div key={slot} className="flex items-center justify-between p-2 border rounded-lg bg-secondary">
            <div className="flex items-center space-x-2">
              <Image className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="font-medium text-sm capitalize">{slot.replace(/([A-Z])/g, ' $1')}</span>
                <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                  {nft ? formatNFTRef(nft) : 'Empty'}
                </p>
              </div>
            </div>
            {nft && (
              <Button variant="ghost" size="icon" onClick={() => onClear(slot)}>
                <X className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}