import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Volume2, VolumeX, Music } from 'lucide-react';
// Removed Dialog imports

interface GalleryUIProps {
  instructionsVisible: boolean;
  onLockClick: () => void;
}

const GalleryUI: React.FC<GalleryUIProps> = ({ instructionsVisible, onLockClick }) => {
  // Removed modal state: isModalOpen, modalMetadata
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [isMusicMuted, setIsMusicMuted] = useState(true); // New state for music mute
  const [hasVideo, setHasVideo] = useState(false);

  // Polling/Interval to check video and music state
  useEffect(() => {
    const interval = setInterval(() => {
      const galleryControls = (window as any).galleryControls;
      const musicControls = (window as any).musicControls;

      // Video state check
      if (galleryControls) {
        const videoPresent = galleryControls.hasVideo();
        setHasVideo(videoPresent);
        if (videoPresent) {
          setIsVideoMuted(galleryControls.isMuted());
        }
      }
      
      // Music state check
      if (musicControls) {
        setIsMusicMuted(musicControls.isMuted());
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
  
  const handleMusicMuteToggle = () => {
    const musicControls = (window as any).musicControls;
    if (musicControls && musicControls.toggleMute) {
      musicControls.toggleMute();
      // State update happens via the polling interval, but we can optimistically update it too
      setIsMusicMuted(prev => !prev);
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
        
        {/* Music Toggle Button (Always visible after instructions disappear) */}
        {!instructionsVisible && (
          <Button 
            variant="secondary" 
            size="icon" 
            className="pointer-events-auto bg-black/50 hover:bg-black/70 text-white border border-gray-700"
            onClick={handleMusicMuteToggle}
            title={isMusicMuted ? "Unmute Music" : "Mute Music"}
          >
            {isMusicMuted ? <VolumeX className="h-5 w-5" /> : <Music className="h-5 w-5" />}
          </Button>
        )}

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
      
      {/* Metadata Modal removed */}
    </>
  );
};

export default GalleryUI;