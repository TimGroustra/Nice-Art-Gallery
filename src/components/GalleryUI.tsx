import React from 'react';

interface GalleryUIProps {
  isMobile: boolean;
  // instructionsVisible is no longer needed for mobile, but kept for desktop fallback
  instructionsVisible: boolean; 
  onLockClick: () => void;
}

const GalleryUI: React.FC<GalleryUIProps> = ({ instructionsVisible, onLockClick, isMobile }) => {
  
  // On mobile, we don't use pointer lock, so instructions are handled by MobileControls.
  // On desktop, we still need the click-to-lock prompt.
  const showDesktopInstructions = !isMobile && instructionsVisible;

  return (
    <>
      {/* Overlay UI (Top Left) */}
      <div className="fixed top-0 left-0 p-4 z-10 flex flex-col gap-3 pointer-events-none">
        
        {/* Desktop Instructions */}
        {showDesktopInstructions && (
          <div 
            id="instructions" 
            className="bg-black/50 text-white p-3 rounded-md cursor-pointer pointer-events-auto"
            onClick={onLockClick}
          >
            Click to enter gallery — WASD to move, mouse to look. Press Esc to release cursor.
          </div>
        )}
      </div>
      
      {/* Crosshair (Only visible when controls are active/locked, which is always on mobile) */}
      {/* On mobile, we don't need a crosshair since interaction is tap-based, not raycast-aimed. */}
      {/* Keeping it for desktop pointer-lock mode. */}
      {!isMobile && !instructionsVisible && (
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