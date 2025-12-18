import React, { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import SceneSetup from './gallery/SceneSetup';
import PanelManager from './gallery/PanelManager';
import Lighting from './gallery/Lighting';
import { useMovement } from '@/hooks/useMovement';

const NftGallery: React.FC<{ setInstructionsVisible: (visible: boolean) => void }> = ({ setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const cameraRef = useRef<THREE.PerspectiveCamera>(new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000));
  const rendererRef = useRef<THREE.WebGLRenderer>(new THREE.WebGLRenderer({ antialias: true }));
  const controlsRef = useRef<PointerLockControls | null>(null);
  const clockRef = useRef(new THREE.Clock());
  const [isLocked, setIsLocked] = useState(false);

  // Get movement updater from hook (pass controls once initialized)
  const updateMovement = useMovement(controlsRef.current);

  // Initialize controls in SceneSetup callback or here if needed
  useEffect(() => {
    controlsRef.current = new PointerLockControls(cameraRef.current, rendererRef.current.domElement);
  }, []);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      requestAnimationFrame(animate);

      const delta = clockRef.current.getDelta();
      updateMovement(delta);

      rendererRef.current.render(sceneRef.current, cameraRef.current);
    };

    animate();

    return () => {
      // Cleanup if needed
    };
  }, [updateMovement]);

  const handleLockChange = (locked: boolean) => {
    setIsLocked(locked);
    setInstructionsVisible(!locked);
  };

  return (
    <div ref={mountRef} className="w-full h-full">
      <SceneSetup onLockChange={handleLockChange} mountRef={mountRef} />
      <Lighting scene={sceneRef.current} />
      <PanelManager scene={sceneRef.current} />
    </div>
  );
};

export default NftGallery;