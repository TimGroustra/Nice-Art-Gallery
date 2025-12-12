import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { GalleryLayout, Wall, Light } from "@/scene/unrealUnityLayout";

/**
 * NftGallery – a lightweight but functional three‑js scene.
 *
 * It:
 *   • Creates a scene, camera and renderer.
 *   • Adds a simple floor plane.
 *   • Builds wall meshes from `GalleryLayout.walls`.
 *   • Adds light objects from `GalleryLayout.lights`.
 *   • Places a placeholder NFT panel (a thin box) at the origin.
 *   • Calls `setInstructionsVisible(false)` when the user clicks anywhere in the canvas
 *     (mirroring the original “hide instructions on click” behaviour).
 *
 * The implementation purposefully stays simple so it compiles cleanly while still
 * demonstrating the intended layout structure.
 */
const NftGallery: React.FC<{
  setInstructionsVisible: (visible: boolean) => void;
}> = ({ setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // === Scene setup ===
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020);

    const camera = new THREE.PerspectiveCamera(
      60,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      500,
    );
    camera.position.set(0, 5, 12);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(
      mountRef.current.clientWidth,
      mountRef.current.clientHeight,
    );
    mountRef.current.appendChild(renderer.domElement);

    // === Floor (simple plane) ===
    const floorGeo = new THREE.PlaneGeometry(
      GalleryLayout.footprint.width,
      GalleryLayout.footprint.depth,
    );
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x777777,
      side: THREE.DoubleSide,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);

    // === Walls (thin boxes) ===
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd });
    GalleryLayout.walls.forEach((wall: Wall) => {
      const thickness = GalleryLayout.footprint.wallThickness;
      const geometry = new THREE.BoxGeometry(
        wall.length,
        wall.height,
        thickness,
      );
      const mesh = new THREE.Mesh(geometry, wallMaterial);
      // Position and rotation
      mesh.position.set(...(wall.position as [number, number, number]));
      mesh.rotation.y = wall.rotationY;
      scene.add(mesh);
    });

    // === Lights ===
    // Ambient light for baseline illumination
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    GalleryLayout.lights.forEach((light: Light) => {
      let threeLight: THREE.Light | null = null;
      const intensity = light.intensity ?? 1;

      switch (light.type) {
        case "spot":
          threeLight = new THREE.SpotLight(0xffffff, intensity);
          break;
        case "point":
          threeLight = new THREE.PointLight(0xffffff, intensity);
          break;
        case "area":
          threeLight = new THREE.RectAreaLight(0xffffff, intensity, 10, 10);
          break;
        case "neon":
          threeLight = new THREE.PointLight(0x00ffff, intensity);
          break;
        default:
          threeLight = null;
      }

      if (threeLight) {
        threeLight.position.set(
          ...(light.position as [number, number, number]),
        );

        // If a target is defined, point the light at it
        if (light.target) {
          const target = new THREE.Object3D();
          target.position.set(
            ...(light.target as [number, number, number]),
          );
          scene.add(target);
          (threeLight as any).target = target;
        }

        scene.add(threeLight);
      }
    });

    // === Placeholder NFT panel (thin box) ===
    const panelGeo = new THREE.BoxGeometry(1, 1.5, 0.1);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(0, 1, 0);
    scene.add(panel);

    // === Animation loop ===
    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      panel.rotation.y += 0.005;
      renderer.render(scene, camera);
    };
    animate();

    // === Cleanup on unmount ===
    return () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
      if (mountRef.current?.firstChild) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []); // empty deps – runs once

  // Hide the instruction overlay when the canvas is clicked
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