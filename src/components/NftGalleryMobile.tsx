import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { RectAreaLightUniformsLib, GLTFLoader } from 'three-stdlib';

// Initialize RectAreaLightUniformsLib immediately upon module load
RectAreaLightUniformsLib.init();

const PLATFORM_Y = 20; // Define missing constant
const WALL_THICKNESS = 0.5; // Define missing constant

const NftGalleryMobile: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // Initialize Three.js scene, camera, renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    // Furniture loading: Replace with new sofa model
    const gltfLoader = new GLTFLoader();
    gltfLoader.load('/assets/models/sofa.glb', (gltf) => {
      let extractedSofa: THREE.Object3D | null = null;
      
      // Traverse to find the main sofa model
      gltf.scene.traverse((child) => {
        if ((child instanceof THREE.Mesh || child instanceof THREE.Group) && !extractedSofa) {
          // Use the main scene as the sofa model
          extractedSofa = child;
        }
      });
      
      if (extractedSofa) {
        const sofaModel = extractedSofa as THREE.Object3D;
        
        // Auto-scale the sofa to appropriate size (~4.5 meters wide)
        const box = new THREE.Box3().setFromObject(sofaModel);
        const size = new THREE.Vector3(); box.getSize(size);
        const maxDim = Math.max(size.x, size.z);
        const scale = 4.5 / maxDim;
        sofaModel.scale.set(scale, scale, scale);
        
        // Re-center Y position so it sits on floor
        const adjustedBox = new THREE.Box3().setFromObject(sofaModel);
        const bottomY = adjustedBox.min.y;

        // Position sofas around the teleportation button
        const sofaPositions = [
          { x: 0, z: 4.5 },
          { x: 0, z: -4.5 },
          { x: 4.5, z: 0 },
          { x: -4.5, z: 0 },
        ];

        sofaPositions.forEach(pos => {
          const sofa = sofaModel.clone();
          // Place on the first floor platform (sitting exactly on the surface)
          sofa.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2 - bottomY, pos.z);
          // Calculate rotation to face the center (0,0)
          sofa.rotation.y = Math.atan2(-pos.x, -pos.z);
          scene.add(sofa);
        });
      }
    });

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      mountRef.current?.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div className="w-full h-full">
      <div ref={mountRef} className="w-full h-full" />
    </div>
  );
};

export default NftGalleryMobile;