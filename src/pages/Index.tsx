import NftGallery from "@/components/NftGallery";
import GalleryUI from "@/components/GalleryUI";
import { MadeWithDyad } from "@/components/made-with-dyad";
import React, { useState, useCallback } from "react";

const Index = () => {
  const [instructionsVisible, setInstructionsVisible] = useState(true);

  const handlePanelClick = useCallback((metadataUrl: string) => {
    // The NftGallery component calls window.openMetadataModal directly, 
    // but we keep this handler structure for future state management if needed.
    const openModal = (window as any).openMetadataModal;
    if (openModal) {
      openModal(metadataUrl);
    }
  }, []);

  const handleLockClick = useCallback(() => {
    const galleryControls = (window as any).galleryControls;
    if (galleryControls && galleryControls.lockControls) {
      galleryControls.lockControls();
    }
    // The NftGallery component handles setting instructionsVisible=false on lock event internally.
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* 3D Canvas */}
      <NftGallery 
        onPanelClick={handlePanelClick} 
      />
      
      {/* 2D Overlay UI */}
      <GalleryUI 
        instructionsVisible={instructionsVisible} 
        onLockClick={handleLockClick}
      />
      
      {/* Footer/Attribution */}
      <div className="fixed bottom-0 right-0 z-10">
        <MadeWithDyad />
      </div>
    </div>
  );
};

export default Index;