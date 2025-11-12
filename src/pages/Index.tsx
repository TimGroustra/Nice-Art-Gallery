import NftGallery from "@/components/NftGallery";
import GalleryUI from "@/components/GalleryUI";
import LoadingOverlay from "@/components/LoadingOverlay";
import React, { useState, useCallback } from "react";

const Index = () => {
  const [instructionsVisible, setInstructionsVisible] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const handleLockClick = useCallback(() => {
    const galleryControls = (window as any).galleryControls;
    if (galleryControls && galleryControls.lockControls) {
      galleryControls.lockControls();
    }
    // The NftGallery component handles setting instructionsVisible=false on lock event internally.
  }, []);

  const handleGalleryLoaded = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* 3D Canvas */}
      <NftGallery 
        setInstructionsVisible={setInstructionsVisible}
        onLoaded={handleGalleryLoaded}
      />
      
      {/* 2D Overlay UI */}
      <GalleryUI 
        instructionsVisible={instructionsVisible} 
        onLockClick={handleLockClick}
      />

      {/* Loading Overlay */}
      {isLoading && <LoadingOverlay />}
    </div>
  );
};

export default Index;