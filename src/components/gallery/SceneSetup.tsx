import * as THREE from 'three';
import { PointerLockControls } from 'three-stdlib';
import React, { useEffect, useRef } from 'react';

interface SceneSetupProps {
  onLockChange: (isLocked: boolean) => void;
  mountRef: React.RefObject<HTMLDivElement>;
}

const SceneSetup: React.FC<SceneSetupProps> = ({ onLockChange, mountRef }) => {
  const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const cameraRef = useRef<THREE.PerspectiveCamera>(new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000));
  const rendererRef = useRef<THREE.WebGLRenderer>(new THREE.WebGLRenderer({ antialias: true }));
  const controlsRef = useRef<PointerLockControls>(new PointerLockControls(cameraRef.current, rendererRef.current.domElement));

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const controls = controlsRef.current;

    scene.background = new THREE.Color(0x000000);
    camera.position.set(0, 1.6, -20);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    controls.addEventListener('lock', () => onLockChange(true));
    controls.addEventListener('unlock', () => onLockChange(false));

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onWindowResize);

    return () => {
      window.removeEventListener('resize', onWindowResize);
      mountRef.current?.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [mountRef, onLockChange]);

  return null;
};

export default SceneSetup;