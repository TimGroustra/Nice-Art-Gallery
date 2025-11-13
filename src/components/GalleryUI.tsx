import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, Volume2, VolumeX } from 'lucide-react';
// Removed Dialog imports

interface GalleryUIProps {
  instructionsVisible: boolean;
  onLockClick: () => void;
}

const GalleryUI: React.FC<GalleryUIProps> = ({ instructionsVisible, onLockClick }) => {
  // Removed modal state: isModalOpen, modalMetadata
  const [isMuted, setIsMuted] = useState(true);
  const [hasMedia, setHasMedia] = useState(false); // Combined state for video/music presence

  // Polling/Interval to check media state from NftGallery
  useEffect(() => {
    const interval = setInterval(() => {
      const galleryControls = (window as any).galleryControls;
      if (galleryControls) {
        // Media state check
        const videoPresent = galleryControls.hasVideo();
        const musicPresent = galleryControls.hasMusic();
        const mediaPresent = videoPresent || musicPresent;
        
        setHasMedia(mediaPresent);
        
        if (mediaPresent) {
          setIsMuted(galleryControls.isMuted());
        }
      }
    }, 200); // Check state every 200ms

    return () => clearInterval(interval);
  }, []);

  const handleMuteToggle = () => {
    const galleryControls = (window as any).galleryControls;
    if (galleryControls && galleryControls.toggleMute) {
      galleryControls.toggleMute();
      // State update happens via the polling interval, but we can optimistically update it too
      setIsMuted(prev => !prev);
    }
  };
  
  return (
    <>
      {/* Overlay UI (Top Left) */}
      <div className="fixed top-0 left-0 p-4 z-10 flex flex-col gap-3 pointer-events-none">
        
        {/* Instructions */}
        {instructionsVisible && (
          <div 
            id="instructions" 
            className="bg-black/50 text-white p-3 rounded-md cursor-pointer pointer-events-auto"
            onClick={onLockClick}
          >
            Click to enter gallery — WASD to move, mouse to look. Press Esc to release cursor. Press M to toggle mute.
          </div>
        )}
        
        {/* Mute Toggle Button */}
        {!instructionsVisible && hasMedia && (
          <Button 
            variant="secondary" 
            size="icon" 
            className="pointer-events-auto bg-black/50 hover:bg-black/70 text-white border border-gray-700"
            onClick={handleMuteToggle}
            title={isMuted ? "Unmute Media (M)" : "Mute Media (M)"}
          >
            {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </Button>
        )}
      </div>
      
      {/* Metadata Modal removed */}
    </>
  );
};

export default GalleryUI;