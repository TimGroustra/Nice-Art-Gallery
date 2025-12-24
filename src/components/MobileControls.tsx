import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileControlsProps {
  isWalking: boolean;
  onToggleWalk: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
}

const MobileControls: React.FC<MobileControlsProps> = ({
  isWalking,
  onToggleWalk,
  onToggleMute,
  isMuted,
}) => {
  return (
    <div className="fixed bottom-4 left-4 right-4 z-20 flex justify-between items-end pointer-events-none">
      
      {/* Left Side: Walk Toggle */}
      <div className="pointer-events-auto">
        <Button
          onClick={onToggleWalk}
          size="icon"
          className={cn(
            "h-16 w-16 rounded-full shadow-lg transition-colors",
            isWalking
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-red-600 hover:bg-red-700 text-white"
          )}
          aria-label={isWalking ? "Stop Walking" : "Start Walking"}
        >
          {isWalking ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8" />}
        </Button>
        <p className="text-xs text-white/80 mt-1 text-center font-semibold">
            {isWalking ? "WALKING" : "STOPPED"}
        </p>
      </div>

      {/* Right Side: Mute Toggle */}
      <div className="pointer-events-auto">
        <Button
          onClick={onToggleMute}
          size="icon"
          className="h-12 w-12 rounded-full bg-gray-800/70 hover:bg-gray-700/70 text-white shadow-lg"
          aria-label={isMuted ? "Unmute Music" : "Mute Music"}
        >
          {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
        </Button>
      </div>
    </div>
  );
};

export default MobileControls;