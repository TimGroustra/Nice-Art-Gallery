import React from 'react';
import NftGalleryMobile from '@/components/NftGalleryMobile';
import BackgroundMusic from '@/components/BackgroundMusic';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';

const MobileGallery: React.FC = () => {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <BackgroundMusic />
      
      {/* Mobile-Friendly Header */}
      <div className="fixed top-0 left-0 right-0 p-4 z-20 flex justify-between items-center pointer-events-none">
        <h1 className="text-white font-bold text-lg drop-shadow-md">Nice Art Gallery</h1>
        <Button asChild size="icon" variant="secondary" className="pointer-events-auto rounded-full">
          <Link to="/gallery-config">
            <Settings className="h-5 w-5" />
          </Link>
        </Button>
      </div>

      <NftGalleryMobile />
    </div>
  );
};

export default MobileGallery;