import React from 'react';
import { cn } from '@/lib/utils';

interface WallButtonProps {
  panelKey: string;
  isSelected: boolean;
  isLocked: boolean;
  isLockedByMe: boolean;
  label: string;
  orientation?: "horizontal" | "vertical";
  onClick: (key: string) => void;
  className?: string;
}

const WallButton: React.FC<WallButtonProps> = ({ 
  panelKey, 
  isSelected, 
  isLocked, 
  isLockedByMe, 
  label, 
  orientation = "horizontal", 
  onClick,
  className 
}) => {
  return (
    <button 
      onClick={() => onClick(panelKey)} 
      title={label}
      className={cn(
        "relative flex items-center justify-center transition-all group p-1",
        orientation === "horizontal" ? "flex-col" : "flex-row",
        className
      )}
    >
      <div className={cn(
        "rounded-full transition-all",
        orientation === "horizontal" ? "w-full h-[3px]" : "h-full w-[3px]",
        isSelected ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] scale-y-125" : 
        (isLocked && !isLockedByMe) ? "bg-red-500/60" : "bg-slate-700 group-hover:bg-slate-500"
      )} />
      {isSelected && (
         <div className="absolute inset-0 border border-cyan-400/30 rounded-sm pointer-events-none" />
      )}
    </button>
  );
};

export default WallButton;