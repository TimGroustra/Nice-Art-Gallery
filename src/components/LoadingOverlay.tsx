import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  message?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message = "Loading Gallery..." }) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900/90 text-white">
      <Loader2 className="h-10 w-10 animate-spin mb-4" />
      <p className="text-lg font-medium">{message}</p>
      <p className="text-sm text-gray-400 mt-2">Fetching NFT metadata and building 3D environment...</p>
    </div>
  );
};

export default LoadingOverlay;