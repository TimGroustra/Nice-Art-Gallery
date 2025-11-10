import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { X, Volume2, VolumeX } from 'lucide-react';
import { normalizeUrl } from '@/utils/nftFetcher'; // Import shared utility

interface Metadata {
  title: string;
  description: string;
  image: string;
  source: string;
}

interface GalleryUIProps {
  instructionsVisible: boolean;
  onLockClick: () => void;
}

const GalleryUI: React.FC<GalleryUIProps> = ({ instructionsVisible, onLockClick }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMetadata, setModalMetadata] = useState<Metadata | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [hasVideo, setHasVideo] = useState(false);

  // Function to fetch and open metadata modal
  const openMetadataModal = useCallback(async (metadataUrl: string) => {
    setIsModalOpen(true);
    setModalMetadata(null); // Clear previous data

    // metadataUrl is now expected to be the resolved HTTP/HTTPS URL (passed from NftGallery)
    const url = metadataUrl; 
    
    try {
      const res = await fetch(url);
      const json = await res.json();
      
      // We still need to normalize the image URL found inside the metadata JSON
      let imageUrl = normalizeUrl(json.image || json.image_url || json.gif || '');

      setModalMetadata({
        title: json.name || '(no title)',
        description: json.description || '(no description)',
        image: imageUrl || '',
        source: metadataUrl,
      });
    } catch (e: any) {
      setModalMetadata({
        title: 'Failed to load metadata',
        description: e.message || 'Unknown error',
        image: '',
        source: metadataUrl,
      });
    }
  }, []);

  // Expose modal opening function globally for NftGallery to call
  useEffect(() => {
    (window as any).openMetadataModal = openMetadataModal;
    
    // Cleanup function to remove the global function if the component unmounts
    return () => {
      delete (window as any).openMetadataModal;
    };
  }, [openMetadataModal]);

  // Polling/Interval to check video state from NftGallery
  useEffect(() => {
    const interval = setInterval(() => {
      const galleryControls = (window as any).galleryControls;
      if (galleryControls) {
        // Video state check
        const videoPresent = galleryControls.hasVideo();
        setHasVideo(videoPresent);
        if (videoPresent) {
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
  
  // handleCycleNft is no longer needed here as interaction moves to 3D

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
      
      {/* Navigation Arrows removed from 2D UI */}

      {/* Metadata Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[420px] bg-gray-900 text-white border-gray-700 p-4">
          <DialogHeader>
            <DialogTitle className="text-xl text-center">{modalMetadata?.title || 'Loading...'}</DialogTitle>
          </DialogHeader>
          
          <div id="metaCard" className="flex flex-col items-center text-center">
            {modalMetadata?.image ? (
              <img 
                id="metaImage" 
                src={modalMetadata.image} 
                alt="NFT image" 
                className="w-full h-auto rounded-md bg-gray-800 object-contain max-h-64"
              />
            ) : (
              <div className="w-full h-48 bg-gray-800 flex items-center justify-center rounded-md">
                {modalMetadata ? 'Image not available' : 'Loading image...'}
              </div>
            )}
            
            <DialogDescription className="mt-3 text-left w-full">
              <p className="text-sm text-gray-300 max-h-40 overflow-y-auto p-1">
                {modalMetadata?.description || (modalMetadata ? '(No description provided)' : 'Loading description...')}
              </p>
            </DialogDescription>
            
            {modalMetadata && (
              <a 
                id="metaLink" 
                href={modalMetadata.source} 
                target="_blank" 
                rel="noopener noreferrer"
                className="mt-4 text-blue-400 hover:text-blue-300 underline text-sm"
              >
                Open metadata URL
              </a>
            )}
          </div>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            onClick={() => setIsModalOpen(false)}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GalleryUI;