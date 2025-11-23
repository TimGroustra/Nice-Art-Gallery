import React, { useState } from 'react';
import { useNftGallery } from '@/hooks/use-nft-gallery';
import { MarketBrowserRefined } from './MarketBrowserRefined';

interface NftGalleryProps {
  setInstructionsVisible: (visible: boolean) => void;
}

const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible }) => {
  const [marketBrowserState, setMarketBrowserState] = useState<{
    open: boolean;
    collection?: string;
    tokenId?: string | number;
  }>({ open: false });

  const mountRef = useNftGallery(setInstructionsVisible, setMarketBrowserState);

  return (
    <>
      <div ref={mountRef} className="w-full h-full" />
      {marketBrowserState.open && (
        <MarketBrowserRefined
          collection={marketBrowserState.collection || ""}
          tokenId={marketBrowserState.tokenId || ""}
          open={marketBrowserState.open}
          onClose={() => setMarketBrowserState({ open: false })}
        />
      )}
    </>
  );
};

export default NftGallery;