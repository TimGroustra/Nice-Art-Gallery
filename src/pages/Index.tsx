import NftGallery, { TargetedPanelInfo } from "@/components/NftGallery";
import GalleryUI from "@/components/GalleryUI";
import React, { useState, useCallback } from "react";

const Index = () => {
  const [instructionsVisible, setInstructionsVisible] = useState(true);
  const [targetedPanelInfo, setTargetedPanelInfo] = useState<TargetedPanelInfo | null>(null);

  const handleLockClick = useCallback(() => {
    const galleryControls = (window as any).galleryControls;
    if (galleryControls && galleryControls.lockControls) {
      galleryControls.lockControls();
    }
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* 3D Canvas */}
      <NftGallery 
        setInstructionsVisible={setInstructionsVisible}
        setTargetedPanelInfo={setTargetedPanelInfo}
      />
      
      {/* 2D Overlay UI */}
      <GalleryUI 
        instructionsVisible={instructionsVisible} 
        onLockClick={handleLockClick}
        targetedPanelInfo={targetedPanelInfo}
      />
    </div>
  );
};

export default Index;