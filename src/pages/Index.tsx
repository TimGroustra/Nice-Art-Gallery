import NftGallery from "@/components/NftGallery";
import GalleryUI from "@/components/GalleryUI";
import BackgroundMusic from "@/components/BackgroundMusic";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AvatarCustomizerPanel } from "@/modules/avatar/AvatarCustomizerPanel";
import { DEFAULT_AVATAR } from "@/modules/avatar/AvatarDefaults";
import { AvatarProfile } from "@/modules/avatar/AvatarTypes";

// Define the type for the music controls exposed via ref
interface BackgroundMusicHandles {
  play: () => void;
  pause: () => void;
  toggleMute: () => void;
  isMuted: () => boolean;
}

const Index = () => {
  const [instructionsVisible, setInstructionsVisible] = useState(true);
  const [avatarProfile, setAvatarProfile] = useState<AvatarProfile>(DEFAULT_AVATAR);
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
  
  // Add keyboard listener for 'M' key to toggle music mute
  useEffect(() => {
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
  }, []);

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
      
      {/* Avatar Customizer Panel */}
      <div className="fixed top-4 left-4 z-20 pointer-events-auto">
        <AvatarCustomizerPanel 
          profile={avatarProfile} 
          onChange={setAvatarProfile} 
        />
      </div>
      
      {/* 3D Canvas */}
      <NftGallery 
        setInstructionsVisible={setInstructionsVisible}
        avatarProfile={avatarProfile}
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