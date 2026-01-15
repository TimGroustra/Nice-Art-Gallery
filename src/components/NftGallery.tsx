import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib, GLTFLoader } from 'three-stdlib';
import {
  initializeGalleryConfig,
  GALLERY_PANEL_CONFIG,
  getCurrentNftSource,
  updatePanelIndex,
  PanelConfig,
} from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource } from '@/utils/nftFetcher';
import { createGifTexture } from '@/utils/gifTexture';
import { MarketBrowserRefined } from '@/components/MarketBrowserRefined';

// Initialize RectAreaLightUniformsLib immediately upon module load
RectAreaLightUniformsLib.init();

const PANEL_WIDTH = 6;
const PANEL_HEIGHT = 6;

interface Panel {
  mesh: THREE.Mesh;
  wallName: keyof PanelConfig;
  metadataUrl: string;
  isVideo: boolean;
  isGif: boolean;
  prevArrow: THREE.Mesh;
  nextArrow: THREE.Mesh;
  videoElement: HTMLVideoElement | null;
  gifStopFunction: (() => void) | null;
}

interface NftGalleryProps {
  setInstructionsVisible: (visible: boolean) => void;
}

let currentTargetedPanel: Panel | null = null;
let currentTargetedArrow: THREE.Mesh | null = null;
let currentTargetedButton: THREE.Mesh | null = null;

const rainbowVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const rainbowFragmentShader = `
  varying vec2 vUv;
  uniform float time;
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }
  void main() {
    float hue = fract(time * 0.08 + vUv.x * 0.5 + vUv.y * 0.5);
    vec3 color = hsv2rgb(vec3(hue, 0.9, 0.9));
    vec2 uv = vUv * 2.0 - 1.0;
    float vignette = smoothstep(1.4, 0.2, length(uv));
    gl_FragColor = vec4(color * vignette, 1.0);
  }
`;

const isVideoContent = (contentType: string, url: string) =>
  !!(contentType.startsWith('video/') || url.match(/\.(mp4|webm|ogg)(\?|$)/i));

const isGifContent = (contentType: string, url: string) =>
  !!(contentType === 'image/gif' || url.match(/\.gif(\?|$)/i));

const disposeTextureSafely = (mesh: THREE.Mesh) => {
  const material = mesh.material;
  if (material instanceof THREE.MeshBasicMaterial) {
    const mat = material as THREE.MeshBasicMaterial & { map: THREE.Texture | null };
    if (mat.map) {
      mat.map.dispose();
      mat.map = null;
    }
    mat.dispose();
  }
};

const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible }) => {
  // ... existing code remains the same until furniture loading section ...

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

    // ... rest of the file remains the same ...
};

export default NftGallery;