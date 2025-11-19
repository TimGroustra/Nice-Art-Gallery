import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';
import { Link } from 'react-router-dom';

interface GalleryUIProps {
  instructionsVisible: boolean;
  onLockClick: () => void;
}

const GalleryUI: React.FC<GalleryUIProps> = ({ instructionsVisible, onLockClick }) => {
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  // Removed isMusicMuted state as the button is being removed
  const [hasVideo, setHasVideo] = useState(false);

  // Polling/Interval to check video state
  useEffect(() => {
    const interval = setInterval(() => {
      const galleryControls = (window as any).galleryControls;
      // Removed musicControls check

      // Video state check
      if (galleryControls) {
        const videoPresent = galleryControls.hasVideo();
        setHasVideo(videoPresent);
        if (videoPresent) {
          setIsVideoMuted(galleryControls.isMuted());
        }
      }
    }, 200); // Check state every 200ms

    return () => clearInterval(interval);
  }, []);

  const handleVideoMuteToggle = () => {
    const galleryControls = (window as any).galleryControls;
    if (galleryControls && galleryControls.toggleMute) {
      galleryControls.toggleMute();
      // State update happens via the polling interval, but we can optimistically update it too
      setIsVideoMuted(prev => !prev);
    }
  };
  
  // Removed handleMusicMuteToggle

  return (
    <>
      {/* Overlay UI (Top Left) */}
      <div className="fixed top-0 left-0 p-4 z-10 flex flex-col gap-3 pointer-events-none">
        
        {/* Instructions */}
        {instructionsVisible && (
          <div 
            id="instructions" 
            className="bg-black/50 text-white p-3 rounded-md pointer-events-auto"
          >
            <div className="cursor-pointer" onClick={onLockClick}>
              Click to enter gallery — WASD to move, mouse to look. Press Esc to release cursor. Press M to toggle music.
            </div>
            <div className="mt-2 pt-2 border-t border-gray-600">
              <Link to="/custom" className="text-blue-300 hover:underline">
                Or, explore other custom galleries.
              </Link>
            </div>
          </div>
        )}
        
        {/* Music Toggle Button REMOVED */}

        {/* Video Mute Toggle Button (Only visible if video is present) */}
        {!instructionsVisible && hasVideo && (
          <Button 
            variant="secondary" 
            size="icon" 
            className="pointer-events-auto bg-black/50 hover:bg-black/70 text-white border border-gray-700"
            onClick={handleVideoMuteToggle}
            title={isVideoMuted ? "Unmute Video" : "Mute Video"}
          >
            {isVideoMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </Button>
        )}
      </div>
    </>
  );
};

export default GalleryUI;