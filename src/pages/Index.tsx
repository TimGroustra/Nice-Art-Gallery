import DesktopGallery from "@/components/DesktopGallery";
import MobileGallery from "@/components/MobileGallery";
import GalleryUI from "@/components/GalleryUI";
import BackgroundMusic from "@/components/BackgroundMusic";
import MobileControls from "@/components/MobileControls";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

// Define the type for the music controls exposed via ref
interface BackgroundMusicHandles {
  play: () => void;
  pause: () => void;
  toggleMute: () => void;
  isMuted: () => boolean;
}

const Index = () => {
  const isMobile = useIsMobile();
  // On mobile, instructions are never visible (controls are always active).
  // On desktop, they are visible until pointer lock.
  const [instructionsVisible, setInstructionsVisible] = useState(!isMobile); 
  const [isWalking, setIsWalking] = useState(false);
  const musicRef = useRef<BackgroundMusicHandles>(null);

  // Expose music controls globally for GalleryUI to access
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
    // Attempt to start music playback upon user interaction (locking controls)
    musicRef.current?.play();
  }, []);
  
  const handleToggleWalk = useCallback(() => {
    setIsWalking(prev => !prev);
    musicRef.current?.play(); // Attempt to play music on first interaction
  }, []);

  const handleToggleMute = useCallback(() => {
    const musicControls = (window as any).musicControls;
    if (musicControls) {
      musicControls.toggleMute();
    }
  }, []);

  // Add keyboard listener for 'M' key to toggle music mute (Desktop only)
  useEffect(() => {
    if (isMobile) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      const galleryControls = (window as any).galleryControls;
      const musicControls = (window as any).musicControls;
      
      // Only allow keyboard shortcuts when controls are locked (user is in the gallery)
      if (galleryControls?.isLocked?.() && musicControls && event.code === 'KeyM') {
        musicControls.toggleMute();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobile]);

  const isMuted = (window as any).musicControls?.isMuted() ?? true;

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <BackgroundMusic ref={musicRef} />

      {/* Gallery Config Button */}
      <div className="fixed top-4 right-4 z-20">
        <Button asChild>
          <Link to="/gallery-config" target="_blank" rel="noopener noreferrer">
            Gallery Configuration
          </Link>
        </Button>
      </div>
      
      {/* 3D Canvas */}
      {isMobile ? (
        <MobileGallery 
          isWalking={isWalking}
        />
      ) : (
        <DesktopGallery 
          setInstructionsVisible={setInstructionsVisible}
        />
      )}
      
      {/* 2D Overlay UI */}
      <GalleryUI 
        instructionsVisible={instructionsVisible} 
        onLockClick={handleLockClick}
        isMobile={isMobile}
      />
      
      {/* Mobile Controls */}
      {isMobile && (
        <MobileControls
          isWalking={isWalking}
          onToggleWalk={handleToggleWalk}
          onToggleMute={handleToggleMute}
          isMuted={isMuted}
        />
      )}
    </div>
  );
};

export default Index;