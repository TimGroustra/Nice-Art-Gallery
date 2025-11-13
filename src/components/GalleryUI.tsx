import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, Volume2, VolumeX, Zap } from 'lucide-react';
import { triggerElectroPunksCache } from '@/utils/nftFetcher';
import { showLoading, dismissToast } from '@/utils/toast';

interface GalleryUIProps {
  instructionsVisible: boolean;
  onLockClick: () => void;
}

const GalleryUI: React.FC<GalleryUIProps> = ({ instructionsVisible, onLockClick }) => {
  const [isMuted, setIsMuted] = useState(true); // Default to true
  const [hasMedia, setHasMedia] = useState(false); // Combined state for video/music presence
  const [isCaching, setIsCaching] = useState(false);

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
        
        // Only update isMuted if media is present, otherwise keep default (true)
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
  
  const handleCacheTrigger = async () => {
    if (isCaching) return;
    setIsCaching(true);
    let toastId: string | undefined;
    
    try {
      toastId = showLoading("Starting ElectroPunks cache process (this may take several minutes)...");
      
      const result = await triggerElectroPunksCache();
      
      dismissToast(toastId);
      alert(`Cache Triggered: ${result.message}\nSummary: ${result.summary}`);
      
    } catch (error) {
      dismissToast(toastId);
      alert(`Cache failed to start: ${error.message}`);
    } finally {
      setIsCaching(false);
    }
  };
  
  return (
    <>
      {/* Overlay UI (Top Left) */}
      <div className="fixed top-0 left-0 p-4 z-10 flex flex-col gap-3 pointer-events-none">
        
        {/* Instructions */}
        {instructionsVisible && (
          <div className="flex flex-col gap-2 pointer-events-auto">
            <div 
              id="instructions" 
              className="bg-black/50 text-white p-3 rounded-md cursor-pointer"
              onClick={onLockClick}
            >
              Click to enter gallery — WASD to move, mouse to look. Press Esc to release cursor. Press M to toggle mute.
            </div>
            
            {/* Cache Button */}
            <Button 
              variant="secondary" 
              className="bg-blue-600 hover:bg-blue-700 text-white border border-blue-800"
              onClick={handleCacheTrigger}
              disabled={isCaching}
            >
              <Zap className="h-4 w-4 mr-2" />
              {isCaching ? "Caching..." : "Trigger ElectroPunks Cache"}
            </Button>
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