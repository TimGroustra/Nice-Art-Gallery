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
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const galleryControls = (window as any).galleryControls;
      if (galleryControls) {
        const videoPresent = galleryControls.hasVideo();
        setHasVideo(videoPresent);
        if (videoPresent) {
          setIsVideoMuted(galleryControls.isMuted());
        }
      }
    }, 200);

    return () => clearInterval(interval);
  }, []);

  const handleVideoMuteToggle = () => {
    const galleryControls = (window as any).galleryControls;
    if (galleryControls && galleryControls.toggleMute) {
      galleryControls.toggleMute();
      setIsVideoMuted(prev => !prev);
    }
  };

  return (
    <>
      <div className="fixed top-0 left-0 p-4 z-10 flex flex-col gap-3 pointer-events-none">
        
        {instructionsVisible && (
          <div 
            id="instructions" 
            className="bg-black/50 text-white p-3 rounded-md cursor-pointer pointer-events-auto"
            onClick={onLockClick}
          >
            Click to enter gallery — WASD to move, mouse to look. Press Esc to release cursor. Press M to toggle music.
          </div>
        )}

        {instructionsVisible && (
          <Link to="/panel-manager" className="pointer-events-auto w-fit">
            <Button 
              variant="secondary" 
              className="bg-black/50 hover:bg-black/70 text-white border border-gray-700"
            >
              Manage Gallery Panels
            </Button>
          </Link>
        )}
        
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