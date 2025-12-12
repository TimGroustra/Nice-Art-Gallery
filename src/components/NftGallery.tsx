import React, { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { GalleryLayout, Wall, Light } from "@/scene/unrealUnityLayout";
import {
  GALLERY_PANEL_CONFIG,
  getCurrentNftSource,
} from "@/config/galleryConfig";
import { getCachedNftMetadata } from "@/utils/metadataCache";
import { createGifTexture } from "@/utils/gifTexture";
import { showError, showSuccess } from "@/utils/toast";

/**
 * Helper: load a texture from an image URL.
 */
function loadImageTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => resolve(tex),
      undefined,
      (err) => reject(err),
    );
  });
}

/**
 * Helper: load a video texture (muted, looping, autoplay).
 */
function loadVideoTexture(url: string): Promise<THREE.VideoTexture> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = url;
    video.crossOrigin = "anonymous";
    video.loop = true;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;

    video.addEventListener("canplay", () => {
      const tex = new THREE.VideoTexture(video);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.format = THREE.RGBFormat;
      resolve(tex);
    });

    video.addEventListener("error", (e) => reject(e));
    video.load();
  });
}

/**
 * Main component.
 */
const NftGallery: React.FC<{
  setInstructionsVisible: (visible: boolean) => void;
}> = ({ setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);

  /**
   * Build walls + optional NFT panels.
   */
  const buildScene = useCallback(async (): Promise<() => void> => {
    if (!mountRef.current) return () => {};

    // === Scene / Camera / Renderer ===
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

    // === Floor ===
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
    scene.add(floor);

    // === Walls ===
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd });
    GalleryLayout.walls.forEach((wall: Wall) => {
      const thickness = GalleryLayout.footprint.wallThickness;
      const geometry = new THREE.BoxGeometry(
        wall.length,
        wall.height,
        thickness,
      );
      const mesh = new THREE.Mesh(geometry, wallMaterial);
      mesh.position.set(...(wall.position as [number, number, number]));
      mesh.rotation.y = wall.rotationY;
      scene.add(mesh);
    });

    // === Lights ===
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
        if (light.target) {
          const target = new THREE.Object3D();
          target.position.set(...(light.target as [number, number, number]));
          scene.add(target);
          (threeLight as any).target = target;
        }
        scene.add(threeLight);
      }
    });

    // === NFT Panels ===
    const panelTextures = new Map<string, THREE.Texture>();
    const panelMeshes: THREE.Mesh[] = [];

    const createPanelMesh = (wall: Wall) => {
      const panelGeo = new THREE.BoxGeometry(1, 1.5, 0.05);
      const placeholderMat = new THREE.MeshStandardMaterial({
        color: 0x333333,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(panelGeo, placeholderMat);
      const offset = (wall.length - 1) / 2;
      const panelX = wall.position[0] - wall.length / 2 + offset + 0.5;
      const panelY = wall.height / 2;
      const panelZ = wall.position[2] + (wall.rotationY === 0 ? 0.01 : 0);
      mesh.position.set(panelX, panelY, panelZ);
      mesh.rotation.y = wall.rotationY;
      scene.add(mesh);
      return mesh;
    };

    const wallsWithPanel = GalleryLayout.walls.filter((w) => w.hasPanel);
    for (const wall of wallsWithPanel) {
      const mesh = createPanelMesh(wall);
      panelMeshes.push(mesh);
    }

    const loadAllPanelTextures = async () => {
      await Promise.all(
        wallsWithPanel.map(async (wall, idx) => {
          const source = getCurrentNftSource(
            wall.key as keyof typeof GALLERY_PANEL_CONFIG,
          );
          if (!source) return;

          const { contractAddress, tokenId } = source;
          try {
            const meta = await getCachedNftMetadata(contractAddress, tokenId);
            if (!meta) throw new Error("Metadata not found");

            const { contentUrl, contentType } = meta;
            let texture: THREE.Texture;

            if (contentType.startsWith("image/")) {
              texture = await loadImageTexture(contentUrl);
            } else if (contentType.startsWith("video/")) {
              texture = await loadVideoTexture(contentUrl);
            } else if (contentType.includes("gif")) {
              const { texture: gifTex, stop } = await createGifTexture(contentUrl);
              texture = gifTex;
              (texture as any)._gifStop = stop;
            } else {
              texture = await loadImageTexture(contentUrl);
            }

            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.needsUpdate = true;

            panelMeshes[idx].material = new THREE.MeshStandardMaterial({
              map: texture,
              transparent: true,
              side: THREE.DoubleSide,
            });
            panelTextures.set(wall.key, texture);
            showSuccess(`Loaded NFT ${tokenId} on panel ${wall.key}`);
          } catch (e) {
            console.error(`Failed to load NFT for wall ${wall.key}:`, e);
            showError(`Failed to load NFT on panel ${wall.key}`);
          }
        }),
      );
    };
    loadAllPanelTextures();

    // === Animation loop ===
    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // === Click handling (hide instructions) ===
    const handleClick = () => setInstructionsVisible(false);
    renderer.domElement.addEventListener("click", handleClick);

    // Return cleanup function
    return () => {
      cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener("click", handleClick);
      renderer.dispose();

      // Dispose panel textures (including GIF stop functions)
      panelTextures.forEach((tex) => {
        const maybeStop = (tex as any)._gifStop as (() => void) | undefined;
        if (maybeStop) maybeStop();
        tex.dispose();
      });

      if (mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [setInstructionsVisible]);

  // Run the scene builder once on mount, handling async cleanup correctly
  useEffect(() => {
    let cleanupFn: (() => void) | undefined;

    const start = async () => {
      cleanupFn = await buildScene();
    };
    start();

    return () => {
      if (cleanupFn) cleanupFn();
    };
  }, [buildScene]);

  // Resize handling
  useEffect(() => {
    const onResize = () => {
      if (!mountRef.current) return;
      const canvas = mountRef.current.querySelector("canvas");
      if (canvas) {
        const renderer = (canvas as any).__threeRenderer as THREE.WebGLRenderer;
        if (renderer) {
          renderer.setSize(
            mountRef.current.clientWidth,
            mountRef.current.clientHeight,
          );
        }
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div
      ref={mountRef}
      className="w-full h-full"
      style={{ cursor: "pointer" }}
    />
  );
};

export default NftGallery;