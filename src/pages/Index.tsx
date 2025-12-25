import NftGallery from "@/components/NftGallery";
import GalleryUI from "@/components/GalleryUI";
import BackgroundMusic from "@/components/BackgroundMusic";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { User } from "lucide-react";

interface BackgroundMusicHandles {
  play: () => void;
  pause: () => void;
  toggleMute: () => void;
  isMuted: () => boolean;
}

const Index = () => {
  const [instructionsVisible, setInstructionsVisible] = useState(true);
  const musicRef = useRef<BackgroundMusicHandles>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    if (isMobile) {
      navigate('/mobile');
    }
  }, [isMobile, navigate]);

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

  if (isMobile) return null;

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <BackgroundMusic ref={musicRef} />

      <div className="fixed top-4 right-4 z-20">
        <Button asChild className="rounded-full shadow-lg">
          <Link to="/portal">
            <User className="mr-2 h-4 w-4" /> User Portal
          </Link>
        </Button>
      </div>
      
      <NftGallery 
        setInstructionsVisible={setInstructionsVisible}
      />
      
      <GalleryUI 
        instructionsVisible={instructionsVisible} 
        onLockClick={handleLockClick}
      />
    </div>
  );
};

export default Index;