import * as THREE from 'three';
import React, { useEffect } from 'react';

interface LightingProps {
  scene: THREE.Scene;
}

const Lighting: React.FC<LightingProps> = ({ scene }) => {
  useEffect(() => {
    const ambientLight = new THREE.AmbientLight(0x404050, 1.0);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, 16, 0);
    scene.add(hemiLight);

    return () => {
      scene.remove(ambientLight);
      scene.remove(hemiLight);
    };
  }, [scene]);

  return null;
};

export default Lighting;