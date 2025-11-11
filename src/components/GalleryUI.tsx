import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, Volume2, VolumeX } from 'lucide-react';

interface GalleryUIProps {
  instructionsVisible: boolean;
  onLockClick: () => void;
}

const GalleryUI: React.FC<GalleryUIProps> = ({ instructionsVisible, onLockClick }) => {
  const [isMuted, setIsMuted] = useState(true);
  const [hasVideo, setHasVideo] = useState(false);

  // Polling/Interval to check video state from NftGallery
  useEffect(() => {
    const interval = setInterval(() => {
      const galleryControls = (window as any).galleryControls;
      
      if (galleryControls) {
        // Video state check
        let videoPresent = false;
        
        // FIX: Check if hasVideo is a function before calling it
        if (typeof galleryControls.hasVideo === 'function') {
          videoPresent = galleryControls.hasVideo();
          setHasVideo(videoPresent);
        } else {
          setHasVideo(false);
        }

        if (videoPresent) {
          // FIX: Check if isMuted is a function before calling it
          if (typeof galleryControls.isMuted === 'function') {
            setIsMuted(galleryControls.isMuted());
          }
        }
      }
    }, 200); // Check state every 200ms

    return () => clearInterval(interval);
  }, []);

  const handleMuteToggle = () => {
    const galleryControls = (window as any).galleryControls;
    // FIX: Check if toggleMute is a function before calling it
    if (galleryControls && typeof galleryControls.toggleMute === 'function') {
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
            Click to enter gallery — WASD to move, mouse to look. Press Esc to release cursor.
          </div>
        )}
        
        {/* Mute Toggle Button */}
        {!instructionsVisible && hasVideo && (
          <Button 
            variant="secondary" 
            size="icon" 
            className="pointer-events-auto bg-black/50 hover:bg-black/70 text-white border border-gray-700"
            onClick={handleMuteToggle}
            title={isMuted ? "Unmute Video" : "Mute Video"}
          >
            {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </Button>
        )}
      </div>
    </>
  );
};

export default GalleryUI;