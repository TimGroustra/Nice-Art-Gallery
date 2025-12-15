import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';

interface GalleryUIProps {
  instructionsVisible: boolean;
  onLockClick: () => void;
}

const GalleryUI: React.FC<GalleryUIProps> = ({ instructionsVisible, onLockClick }) => {
  // Removed state and effects related to video mute button as requested.

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
        
        {/* Video Mute Toggle Button REMOVED */}
      </div>
      
      {/* Crosshair (only visible when controls are locked) */}
      {!instructionsVisible && (
        <div 
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none z-20"
        >
          <div className="absolute top-1/2 left-0 w-full h-px bg-white/50 -translate-y-1/2"></div>
          <div className="absolute top-0 left-1/2 w-px h-full bg-white/50 -translate-x-1/2"></div>
        </div>
      )}
    </>
  );
};

export default GalleryUI;