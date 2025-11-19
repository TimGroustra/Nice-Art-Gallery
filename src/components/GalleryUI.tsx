import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX, Settings } from 'lucide-react';
import { ConnectWalletButton } from './ConnectWalletButton';

interface GalleryUIProps {
  instructionsVisible: boolean;
  onLockClick: () => void;
}

const GalleryUI: React.FC<GalleryUIProps> = ({ instructionsVisible, onLockClick }) => {
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [hasVideo, setHasVideo] = useState(false);
  const [cogPosition, setCogPosition] = useState<{x: number, y: number} | null>(null);

  useEffect(() => {
    (window as any).uiControls = {
        setCogPosition,
    };
    return () => { delete (window as any).uiControls; };
  }, []);

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
    if (galleryControls?.toggleMute) {
      galleryControls.toggleMute();
      setIsVideoMuted(prev => !prev);
    }
  };

  const handleCogClick = () => {
    (window as any).galleryControls?.openLockModal();
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

      <div className="fixed top-0 right-0 p-4 z-10 pointer-events-auto">
        <ConnectWalletButton />
      </div>

      {cogPosition && (
        <div 
          className="fixed z-20 pointer-events-auto" 
          style={{ 
            left: cogPosition.x, 
            top: cogPosition.y, 
            transform: 'translate(-50%, -50%)' 
          }}
        >
          <Button 
            size="icon" 
            onClick={handleCogClick}
            title="Lock this panel"
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      )}
    </>
  );
};

export default GalleryUI;