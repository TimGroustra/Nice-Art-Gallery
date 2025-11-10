import NftGallery from "@/components/NftGallery";
import GalleryUI from "@/components/GalleryUI";
import { MadeWithDyad } from "@/components/made-with-dyad";
import React, { useState, useCallback } from "react";
import NftDetailModal from "@/components/NftDetailModal";

const Index = () => {
  const [instructionsVisible, setInstructionsVisible] = useState(true);
  const [modalContent, setModalContent] = useState<{ title: string; description: string } | null>(null);

  const handlePanelClick = useCallback((title: string, description: string) => {
    setModalContent({ title, description });
    // The gallery controls will automatically unlock on click, which is what we want.
  }, []);

  const handleLockClick = useCallback(() => {
    const galleryControls = (window as any).galleryControls;
    if (galleryControls && galleryControls.lockControls) {
      galleryControls.lockControls();
    }
  }, []);

  const closeModal = () => {
    setModalContent(null);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* 3D Canvas */}
      <NftGallery 
        setInstructionsVisible={setInstructionsVisible}
        onPanelClick={handlePanelClick}
      />
      
      {/* 2D Overlay UI */}
      <GalleryUI 
        instructionsVisible={instructionsVisible} 
        onLockClick={handleLockClick}
      />
      
      {/* Details Modal */}
      <NftDetailModal
        isOpen={!!modalContent}
        onClose={closeModal}
        title={modalContent?.title || ''}
        description={modalContent?.description || ''}
      />

      {/* Footer/Attribution */}
      <div className="fixed bottom-0 right-0 z-10">
        <MadeWithDyad />
      </div>
    </div>
  );
};

export default Index;