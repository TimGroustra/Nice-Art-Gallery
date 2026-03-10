import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface GalleryUIProps {
  instructionsVisible: boolean;
  onLockClick: () => void;
}

const GalleryUI: React.FC<GalleryUIProps> = ({ instructionsVisible, onLockClick }) => {
  const isMobile = useIsMobile();
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    // Setup global music controls for unified gallery
    const musicControls = {
      toggleMute: () => {
        const newMutedState = !isMuted;
        setIsMuted(newMutedState);
        
        // Mute/unmute video elements
        const activeVideos = document.querySelectorAll('video');
        activeVideos.forEach(video => {
          video.muted = newMutedState;
        });
        
        return newMutedState;
      },
      isMuted: () => isMuted
    };

    (window as any).musicControls = musicControls;

    return () => {
      delete (window as any).musicControls;
    };
  }, [isMuted]);

  const handleMuteToggle = () => {
    const musicControls = (window as any).musicControls;
    if (musicControls) {
      musicControls.toggleMute();
    }
  };

  // Mobile has its own UI in the unified gallery component
  if (isMobile) {
    return null;
  }

  return (
    <>
      {/* Desktop UI */}
      <div className="fixed top-0 left-0 p-4 z-10 flex flex-col gap-3 pointer-events-none">
        {/* Instructions */}
        {instructionsVisible && (
          <div 
            id="instructions" 
            className="bg-black/50 text-white p-3 rounded-md cursor-pointer pointer-events-auto"
            onClick={onLockClick}
          >
            Click to enter gallery — WASD to move, mouse to look. Press Esc to release cursor.
          </div>
        )}
        
        {/* Mute Toggle */}
        {!instructionsVisible && (
          <Button
            variant="secondary"
            size="icon"
            onClick={handleMuteToggle}
            className="pointer-events-auto bg-black/50 text-white hover:bg-black/70"
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        )}
      </div>
      
      {/* Crosshair (only visible when controls are locked) */}
      {!instructionsVisible && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none z-20">
          <div className="absolute top-1/2 left-0 w-full h-px bg-white/50 -translate-y-1/2"></div>
          <div className="absolute top-0 left-1/2 w-px h-full bg-white/50 -translate-x-1/2"></div>
        </div>
      )}
    </>
  );
};

export default GalleryUI;