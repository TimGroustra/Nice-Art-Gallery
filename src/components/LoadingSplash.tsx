"use client";

import React from 'react';
import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface LoadingSplashProps {
  progress: number;
  message?: string;
}

const LoadingSplash: React.FC<LoadingSplashProps> = ({ progress, message = "Initializing Gallery..." }) => {
  return (
    <div className="fixed inset-0 z-[2000] bg-[#050505] flex flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-white/5 blur-3xl rounded-full animate-pulse" />
        <img 
          src="/electroneum-logo-symbol.svg" 
          alt="Electroneum Logo" 
          className="w-24 h-24 relative z-10 opacity-40 animate-pulse"
        />
      </div>
      
      <div className="max-w-xs w-full space-y-4">
        <h2 className="text-2xl font-black text-white/40 tracking-tighter uppercase italic">Nice Art Gallery</h2>
        <div className="space-y-2">
          <Progress 
            value={progress} 
            className="h-1 bg-white/5 [&>div]:bg-white/30" 
          />
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-white/30">
            <span>{message}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-10 flex items-center gap-2 text-white/30 text-xs font-medium">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading Assets & Textures</span>
      </div>
    </div>
  );
};

export default LoadingSplash;