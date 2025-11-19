import NftGallery from "@/components/NftGallery";
import GalleryUI from "@/components/GalleryUI";
import BackgroundMusic from "@/components/BackgroundMusic";
import PanelConfigurator from "@/components/PanelConfigurator";
import React, { useState, useCallback, useRef, useEffect } from "react";

interface BackgroundMusicHandles {
  play: () => void;
  pause: () => void;
  toggleMute: () => void;
  isMuted: () => boolean;
}

// Define a type for the panel object reference
interface PanelRef {
  wallName: string;
  updateContent: (source: { contractAddress: string, tokenId: number }) => void;
}

const Index = () => {
  const [instructionsVisible, setInstructionsVisible] = useState(true);
  const musicRef = useRef<BackgroundMusicHandles>(null);
  const [targetedPanel, setTargetedPanel] = useState<PanelRef | null>(null);
  const [isConfiguratorOpen, setIsConfiguratorOpen] = useState(false);

  useEffect(() => {
    (window as any).musicControls = {
      toggleMute: () => musicRef.current?.toggleMute(),
      isMuted: () => musicRef.current?.isMuted() ?? true,
    };
    return () => { delete (window as any).musicControls; };
  }, []);

  const handleLockClick = useCallback(() => {
    (window as any).galleryControls?.lockControls();
    musicRef.current?.play();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((window as any).galleryControls?.isLocked?.() && event.code === 'KeyM') {
        (window as any).musicControls?.toggleMute();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSaveConfiguration = (panelId: string, contractAddress: string, tokenId: number) => {
    if (targetedPanel && targetedPanel.wallName === panelId) {
      targetedPanel.updateContent({ contractAddress, tokenId });
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <BackgroundMusic ref={musicRef} />
      
      <NftGallery 
        setInstructionsVisible={setInstructionsVisible}
        setTargetedPanel={setTargetedPanel}
      />
      
      <GalleryUI 
        instructionsVisible={instructionsVisible} 
        onLockClick={handleLockClick}
        targetedPanel={targetedPanel}
        onConfigureClick={() => setIsConfiguratorOpen(true)}
      />

      {isConfiguratorOpen && targetedPanel && (
        <PanelConfigurator
          panelId={targetedPanel.wallName}
          onClose={() => setIsConfiguratorOpen(false)}
          onSave={handleSaveConfiguration}
        />
      )}
    </div>
  );
};

export default Index;