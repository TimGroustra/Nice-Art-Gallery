import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX, LogOut, Settings, Wallet } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';

interface GalleryUIProps {
  instructionsVisible: boolean;
  onLockClick: () => void;
  targetedPanel: { wallName: string } | null;
  onConfigureClick: () => void;
}

const GalleryUI: React.FC<GalleryUIProps> = ({ instructionsVisible, onLockClick, targetedPanel, onConfigureClick }) => {
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [hasVideo, setHasVideo] = useState(false);
  const { address, disconnectWallet, connectWallet, canEnter, isLoading } = useWallet();

  useEffect(() => {
    const interval = setInterval(() => {
      const galleryControls = (window as any).galleryControls;
      if (galleryControls) {
        const videoPresent = galleryControls.hasVideo();
        setHasVideo(videoPresent);
        if (videoPresent) setIsVideoMuted(galleryControls.isMuted());
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const handleVideoMuteToggle = () => {
    (window as any).galleryControls?.toggleMute();
    setIsVideoMuted(prev => !prev);
  };
  
  const formatAddress = (addr: string | null) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

  const showCog = !instructionsVisible && targetedPanel && canEnter;

  return (
    <>
      {/* Top Left UI */}
      <div className="fixed top-0 left-0 p-4 z-10 flex flex-col gap-3 pointer-events-none">
        {instructionsVisible && (
          <div id="instructions" className="bg-black/50 text-white p-3 rounded-md cursor-pointer pointer-events-auto" onClick={onLockClick}>
            Click to enter gallery — WASD to move, mouse to look. Press Esc to release cursor. Press M to toggle music.
          </div>
        )}
        {!instructionsVisible && hasVideo && (
          <Button variant="secondary" size="icon" className="pointer-events-auto bg-black/50 hover:bg-black/70 text-white border border-gray-700" onClick={handleVideoMuteToggle} title={isVideoMuted ? "Unmute Video" : "Mute Video"}>
            {isVideoMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </Button>
        )}
      </div>

      {/* Top Right UI */}
      <div className="fixed top-0 right-0 p-4 z-10 flex items-center gap-3 pointer-events-auto">
        {address ? (
          <>
            <div className="bg-black/50 text-white p-2 px-3 rounded-md text-sm">{formatAddress(address)}</div>
            <Button variant="secondary" size="icon" className="bg-black/50 hover:bg-black/70 text-white border border-gray-700" onClick={disconnectWallet} title="Disconnect Wallet">
              <LogOut className="h-5 w-5" />
            </Button>
          </>
        ) : (
          <Button onClick={connectWallet} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Wallet className="mr-2 h-4 w-4" /> Connect Wallet
          </Button>
        )}
      </div>

      {/* Center Screen Cog Icon */}
      {showCog && (
        <div className="fixed inset-0 flex items-center justify-center z-10 pointer-events-none">
          <Button variant="secondary" size="icon" className="pointer-events-auto bg-black/50 hover:bg-black/70 text-white border-2 border-green-400 rounded-full h-12 w-12" onClick={onConfigureClick} title="Configure Panel">
            <Settings className="h-6 w-6" />
          </Button>
        </div>
      )}
    </>
  );
};

export default GalleryUI;