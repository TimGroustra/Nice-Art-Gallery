import React, { useState, useEffect } from 'react';
import NftGallery from "@/components/NftGallery";
import GalleryUI from "@/components/GalleryUI";
import { initializeGalleryConfig } from '@/config/galleryConfig';

const Index: React.FC = () => {
  const [instructionsVisible, setInstructionsVisible] = useState(true);

  useEffect(() => {
    initializeGalleryConfig();
  }, []);

  const handleLockClick = () => {
    setInstructionsVisible(false);
  };

  return (
    <div className="w-full h-screen relative">
      <NftGallery setInstructionsVisible={setInstructionsVisible} />
      <GalleryUI 
        instructionsVisible={instructionsVisible} 
        onLockClick={handleLockClick} 
      />
    </div>
  );
};

export default Index;