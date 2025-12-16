import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AvatarState, NFTRef } from '@/avatar/AvatarState';
import { Button } from '@/components/ui/button';
import { X, Gem, Shirt, Watch, Zap, Footprints, Hand, Heart } from 'lucide-react';

interface CapabilitySlotsProps {
  avatarState: AvatarState;
  onRemove: (category: keyof AvatarState, slot: string) => void;
  onSave: () => void;
  isSaving: boolean;
}

const getIcon = (slot: string) => {
    switch (slot) {
        case 'torso': return <Shirt className="h-4 w-4" />;
        case 'wrist': return <Watch className="h-4 w-4" />;
        case 'feet': return <Footprints className="h-4 w-4" />;
        case 'handheld': return <Hand className="h-4 w-4" />;
        case 'pet': return <Heart className="h-4 w-4" />;
        case 'aura':
        case 'trail': return <Zap className="h-4 w-4" />;
        default: return <Gem className="h-4 w-4" />;
    }
}

const formatNFTRef = (nft: NFTRef) => {
    return `Token #${nft.tokenId} (${nft.contract.substring(0, 6)}...)`;
}

const CapabilitySlots: React.FC<CapabilitySlotsProps> = ({ avatarState, onRemove, onSave, isSaving }) => {
  
  const renderSlots = (category: keyof AvatarState, title: string) => {
    const slots = avatarState[category] as Record<string, NFTRef | null>;
    
    return (
      <div className="space-y-2">
        <h3 className="text-md font-semibold mt-4 mb-2">{title}</h3>
        {Object.entries(slots).map(([slot, nft]) => (
          <div key={slot} className="flex items-center justify-between p-3 border rounded-lg bg-background">
            <div className="flex items-center space-x-3">
              {getIcon(slot)}
              <div>
                <p className="font-medium text-sm capitalize">{slot.replace(/([A-Z])/g, ' $1')}</p>
                <p className="text-xs text-muted-foreground">
                  {nft ? formatNFTRef(nft) : 'Empty'}
                </p>
              </div>
            </div>
            {nft && (
              <Button variant="ghost" size="icon" onClick={() => onRemove(category, slot)}>
                <X className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Avatar Slots</CardTitle>
        <CardDescription>Drag and drop NFTs from your inventory to configure your avatar.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-full max-h-[600px]">
          <div className="p-4 space-y-4">
            {renderSlots('wearables', 'Wearables')}
            {renderSlots('props', 'Props')}
            {renderSlots('companions', 'Companions')}
            {renderSlots('effects', 'Effects')}
            {renderSlots('morphs', 'Morphs')}
          </div>
        </ScrollArea>
      </CardContent>
      <div className="p-4 border-t">
        <Button onClick={onSave} disabled={isSaving} className="w-full">
          {isSaving ? 'Saving...' : 'Save Avatar Configuration'}
        </Button>
      </div>
    </Card>
  );
};

export default CapabilitySlots;