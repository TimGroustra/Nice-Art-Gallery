import React, { useState } from 'react';
import NftGalleryMobile from '@/components/NftGalleryMobile';
import BackgroundMusic from '@/components/BackgroundMusic';
import LoadingSplash from '@/components/LoadingSplash';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';

const MobileGallery: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      {isLoading && <LoadingSplash progress={loadingProgress} message="Preparing Mobile Experience..." />}
      
      <BackgroundMusic />
      
      {/* Mobile-Friendly Header */}
      <div className="fixed top-0 left-0 right-0 p-4 z-20 flex justify-between items-center pointer-events-none">
        <h1 className="text-white font-bold text-lg drop-shadow-md">Nice Art Gallery</h1>
        <Button asChild size="icon" variant="secondary" className="pointer-events-auto rounded-full shadow-lg">
          <Link to="/portal">
            <User className="h-5 w-5" />
          </Link>
        </Button>
      </div>

      <NftGalleryMobile 
        onLoadingProgress={setLoadingProgress}
        onLoadingComplete={() => setIsLoading(false)}
      />
    </div>
  );
};

export default MobileGallery;