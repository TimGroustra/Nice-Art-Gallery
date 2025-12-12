import React, { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Minimal placeholder for the NFT gallery.
 * It creates a basic Three.js scene with a simple rotating cube so the
 * component mounts without runtime errors while keeping the original
 * import contract (default export) intact.
 */
const NftGallery: React.FC<{ setInstructionsVisible: (v: boolean) => void }> = ({
  setInstructionsVisible,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // Basic Three.js setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000,
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(
      mountRef.current.clientWidth,
      mountRef.current.clientHeight,
    );
    mountRef.current.appendChild(renderer.domElement);

    // Simple geometry to prove rendering works
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    camera.position.z = 3;

    // Animation loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup on unmount
    return () => {
      cancelAnimationFrame(animationId);
      renderer.dispose();
      if (mountRef.current?.firstChild) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Hide instructions when the placeholder gallery is clicked (mirrors original intent)
  const handleClick = () => setInstructionsVisible(false);

  return (
    <div
      ref={mountRef}
      className="w-full h-full"
      onClick={handleClick}
      style={{ cursor: "pointer" }}
    />
  );
};

export default NftGallery;