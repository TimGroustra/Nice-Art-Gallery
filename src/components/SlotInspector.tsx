import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Image } from 'lucide-react';
import { NFTRef, AvatarProfile } from '@/avatar/AvatarState';
import { Separator } from '@/components/ui/separator';

interface SlotRowProps {
  label: string;
  nft: NFTRef | undefined;
  onClear: () => void;
}

const formatNFTRef = (nft: NFTRef) => {
    return `Token #${nft.tokenId} (${nft.contract.substring(0, 6)}...)`;
}

function SlotRow({ label, nft, onClear }: SlotRowProps) {
  return (
    <div className="flex items-center justify-between p-2 border rounded-lg bg-secondary">
      <div className="flex items-center space-x-2">
        <Image className="h-4 w-4 text-muted-foreground" />
        <div>
          <span className="font-medium text-sm capitalize">{label.replace(/([A-Z])/g, ' $1')}</span>
          <p className="text-xs text-muted-foreground truncate max-w-[150px]">
            {nft ? formatNFTRef(nft) : 'Empty'}
          </p>
        </div>
      </div>
      {nft && (
        <Button variant="ghost" size="icon" onClick={onClear}>
          <X className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </div>
  );
}

interface SlotInspectorProps {
  profile: AvatarProfile;
  onChange: (p: AvatarProfile) => void;
}

export function SlotInspector({ profile, onChange }: SlotInspectorProps) {
  
  const handleClearWearable = (slot: keyof AvatarProfile['wearables']) => {
    onChange({
      ...profile,
      wearables: { ...profile.wearables, [slot]: undefined }
    });
  };
  
  const handleClearProp = (slot: keyof AvatarProfile['props'], index?: number) => {
    if (slot === 'floating' && profile.props.floating && index !== undefined) {
        const newFloating = profile.props.floating.filter((_, i) => i !== index);
        onChange({
            ...profile,
            props: { ...profile.props, floating: newFloating }
        });
    } else {
        onChange({
            ...profile,
            props: { ...profile.props, [slot]: undefined }
        });
    }
  };
  
  const handleClearCompanion = () => {
      onChange({ ...profile, pet: undefined });
  };
  
  const handleClearEffect = () => {
      onChange({ ...profile, aura: undefined });
  };
  
  const handleClearMorph = (slot: 'bodySeed' | 'paletteSeed') => {
      onChange({ ...profile, [slot]: undefined });
  };

  return (
    <div className="space-y-4 overflow-y-auto">
      
      <Card>
        <CardHeader>
          <CardTitle>Wearables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(profile.wearables).map(([slot, nft]) => (
            <SlotRow
              key={slot}
              label={slot}
              nft={nft}
              onClear={() => handleClearWearable(slot as keyof AvatarProfile['wearables'])}
            />
          ))}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Props</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SlotRow
            label="Hand Right"
            nft={profile.props.handRight}
            onClear={() => handleClearProp('handRight')}
          />
          <SlotRow
            label="Hand Left"
            nft={profile.props.handLeft}
            onClear={() => handleClearProp('handLeft')}
          />
          <Separator className="my-2" />
          {profile.props.floating?.map((nft, index) => (
              <SlotRow
                key={`floating-${index}`}
                label={`Floating Item ${index + 1}`}
                nft={nft}
                onClear={() => handleClearProp('floating', index)}
              />
          ))}
          {(!profile.props.floating || profile.props.floating.length === 0) && (
              <p className="text-xs text-muted-foreground p-2">No floating items assigned.</p>
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Companions & Effects</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SlotRow
            label="Pet"
            nft={profile.pet}
            onClear={handleClearCompanion}
          />
          <SlotRow
            label="Aura Effect"
            nft={profile.aura}
            onClear={handleClearEffect}
          />
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Morph Seeds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SlotRow
            label="Body Seed"
            nft={profile.bodySeed}
            onClear={() => handleClearMorph('bodySeed')}
          />
          <SlotRow
            label="Palette Seed"
            nft={profile.paletteSeed}
            onClear={() => handleClearMorph('paletteSeed')}
          />
        </CardContent>
      </Card>
    </div>
  );
}