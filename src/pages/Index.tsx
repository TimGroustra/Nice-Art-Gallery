import NftGallery from "@/components/NftGallery";
import GalleryUI from "@/components/GalleryUI";
import React, { useState, useCallback } from "react";
import { useElectropunksMetadataPopulator } from "@/hooks/useElectropunksMetadataPopulator";

const Index = () => {
  const [instructionsVisible, setInstructionsVisible] = useState(true);
  useElectropunksMetadataPopulator();

  // Removed handlePanelClick as the modal is gone

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
        setInstructionsVisible={setInstructionsVisible}
      />
      
      {/* 2D Overlay UI */}
      <GalleryUI 
        instructionsVisible={instructionsVisible} 
        onLockClick={handleLockClick}
      />
    </div>
  );
};

export default Index;