import React, { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';
import AvatarViewer, { AvatarViewerHandles, AvatarPart } from '@/components/AvatarViewer';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

// Placeholder data for demonstration. These files must exist in public/avatars/
const HEAD_VARIANTS: AvatarPart[] = [
  { name: "Head 1 (Default)", url: "/avatars/heads/head_01.glb", boneName: "Head" },
  { name: "Head 2 (Stylized)", url: "/avatars/heads/head_02.glb", boneName: "Head" },
  { name: "Head 3 (Chibi)", url: "/avatars/heads/head_03.glb", boneName: "Head" },
];

const ACCESSORIES: AvatarPart[] = [
  { name: "Hat", url: "/avatars/accessories/hat.glb", boneName: "Head" },
  { name: "Backpack", url: "/avatars/accessories/backpack.glb", boneName: "Spine2" },
];

const AvatarEditor: React.FC = () => {
  const viewerRef = useRef<AvatarViewerHandles>(null);
  const [currentHeadIndex, setCurrentHeadIndex] = useState(0);
  const [currentAccessoryIndex, setCurrentAccessoryIndex] = useState(0);

  const handleSwapHead = (direction: 'next' | 'prev') => {
    const total = HEAD_VARIANTS.length;
    let newIndex = currentHeadIndex;

    if (direction === 'next') {
      newIndex = (currentHeadIndex + 1) % total;
    } else {
      newIndex = (currentHeadIndex - 1 + total) % total;
    }
    
    setCurrentHeadIndex(newIndex);
    viewerRef.current?.swapPart('head', HEAD_VARIANTS[newIndex]);
  };

  const handleSwapAccessory = (direction: 'next' | 'prev') => {
    const total = ACCESSORIES.length;
    let newIndex = currentAccessoryIndex;

    if (direction === 'next') {
      newIndex = (currentAccessoryIndex + 1) % total;
    } else {
      newIndex = (currentAccessoryIndex - 1 + total) % total;
    }
    
    setCurrentAccessoryIndex(newIndex);
    viewerRef.current?.swapPart('accessory', ACCESSORIES[newIndex]);
  };

  const handleRotate = () => {
    viewerRef.current?.rotateAvatar(Math.PI / 4); // Rotate 45 degrees
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8">
        {/* Left Panel: Controls */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Avatar Editor Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {/* Head Swapping */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">Head Variant</Label>
              <div className="flex items-center justify-between space-x-2">
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => handleSwapHead('prev')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="flex-1 text-center text-sm truncate">
                  {HEAD_VARIANTS[currentHeadIndex].name}
                </span>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => handleSwapHead('next')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <Separator />

            {/* Accessory Swapping */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">Accessory</Label>
              <div className="flex items-center justify-between space-x-2">
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => handleSwapAccessory('prev')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="flex-1 text-center text-sm truncate">
                  {ACCESSORIES[currentAccessoryIndex].name}
                </span>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => handleSwapAccessory('next')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Separator />

            {/* Utility Controls */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">Utilities</Label>
              <Button onClick={handleRotate} className="w-full">
                <RotateCw className="mr-2 h-4 w-4" /> Rotate Avatar
              </Button>
            </div>
            
          </CardContent>
        </Card>

        {/* Right Panel: 3D Viewer */}
        <Card className="lg:h-[calc(100vh-4rem)]">
          <CardHeader>
            <CardTitle>3D Avatar Preview</CardTitle>
          </CardHeader>
          <CardContent className="h-[60vh] lg:h-[calc(100%-6rem)] p-0">
            <AvatarViewer ref={viewerRef} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AvatarEditor;