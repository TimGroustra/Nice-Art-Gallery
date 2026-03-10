import UnifiedGallery from "@/components/UnifiedGallery";
import GalleryUI from "@/components/GalleryUI";
import BackgroundMusic from "@/components/BackgroundMusic";
import LoadingSplash from "@/components/LoadingSplash";
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
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const musicRef = useRef<BackgroundMusicHandles>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-start on mobile immediately to match unified gallery behavior
    if (isMobile) {
      setInstructionsVisible(false);
      const bgm = (window as any).musicControls;
      if (bgm && bgm.play) bgm.play();
    }
  }, [isMobile]);

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
    // For desktop, this triggers the gallery entry
    if (!isMobile) {
      setInstructionsVisible(false);
      const bgm = (window as any).musicControls;
      if (bgm && bgm.play) bgm.play();
    }
  }, [isMobile]);

  const handleLoadingComplete = useCallback(() => {
    setIsLoading(false);
  }, []);
  
  useEffect(() => {
    // Global keyboard shortcut for mute (desktop)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyM') {
        const musicControls = (window as any).musicControls;
        if (musicControls) {
          musicControls.toggleMute();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {isLoading && <LoadingSplash progress={loadingProgress} />}
      
      <BackgroundMusic ref={musicRef} />

      {/* Portal Button */}
      <div className="fixed top-4 right-4 z-20">
        <Button asChild className="rounded-full shadow-lg">
          <Link to="/portal">
            <User className="mr-2 h-4 w-4" /> User Portal
          </Link>
        </Button>
      </div>
      
      {/* Unified Gallery Component */}
      <UnifiedGallery 
        onLoadingProgress={setLoadingProgress}
        onLoadingComplete={handleLoadingComplete}
      />
      
      {/* Gallery UI (Desktop-specific features) */}
      <GalleryUI 
        instructionsVisible={isMobile ? false : instructionsVisible} 
        onLockClick={handleLockClick}
      />
    </div>
  );
};

export default Index;