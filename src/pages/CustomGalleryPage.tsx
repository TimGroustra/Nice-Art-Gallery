import { useParams } from 'react-router-dom';
import NftGallery from "@/components/NftGallery";
import GalleryUI from "@/components/GalleryUI";
import BackgroundMusic from "@/components/BackgroundMusic";
import React, { useState, useCallback, useRef, useEffect } from "react";

interface BackgroundMusicHandles {
  play: () => void;
  pause: () => void;
  toggleMute: () => void;
  isMuted: () => boolean;
}

const CustomGalleryPage = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const [instructionsVisible, setInstructionsVisible] = useState(true);
  const musicRef = useRef<BackgroundMusicHandles>(null);

  useEffect(() => {
    (window as any).musicControls = {
      toggleMute: () => musicRef.current?.toggleMute(),
      isMuted: () => musicRef.current?.isMuted() ?? true,
    };
    return () => {
      delete (window as any).musicControls;
    };
  }, []);

  const handleLockClick = useCallback(() => {
    const galleryControls = (window as any).galleryControls;
    if (galleryControls && galleryControls.lockControls) {
      galleryControls.lockControls();
    }
    musicRef.current?.play();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const galleryControls = (window as any).galleryControls;
      const musicControls = (window as any).musicControls;
      
      if (galleryControls?.isLocked?.() && musicControls && event.code === 'KeyM') {
        musicControls.toggleMute();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <BackgroundMusic ref={musicRef} />
      
      <NftGallery 
        setInstructionsVisible={setInstructionsVisible}
        roomId={roomId}
      />
      
      <GalleryUI 
        instructionsVisible={instructionsVisible} 
        onLockClick={handleLockClick}
      />
    </div>
  );
};

export default CustomGalleryPage;