import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { X } from 'lucide-react';

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

// Utility: normalize ipfs:// to https gateway (duplicated from NftGallery for standalone fetch)
function normalizeUrl(url: string): string {
  if (!url) return url;
  url = url.trim();
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  return url;
}

const GalleryUI: React.FC<GalleryUIProps> = ({ instructionsVisible, onLockClick }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMetadata, setModalMetadata] = useState<Metadata | null>(null);

  // Function to fetch and open metadata modal
  const openMetadataModal = useCallback(async (metadataUrl: string) => {
    setIsModalOpen(true);
    setModalMetadata(null); // Clear previous data

    const url = normalizeUrl(metadataUrl);
    try {
      const res = await fetch(url);
      const json = await res.json();
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

  return (
    <>
      {/* Overlay UI */}
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
      </div>

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