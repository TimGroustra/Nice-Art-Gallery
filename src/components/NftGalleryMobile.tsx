"use client";

import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { RectAreaLightUniformsLib, GLTFLoader } from 'three-stdlib';
import {
  initializeGalleryConfig,
  GALLERY_PANEL_CONFIG,
  getCurrentNftSource,
  updatePanelIndex,
  PanelConfig,
  GALLERY_FURNITURE_CONFIG,
  FurnitureConfig,
} from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';
import { createGifTexture } from '@/utils/gifTexture';
import { MarketBrowserRefined } from '@/components/MarketBrowserRefined';
import { Footprints } from 'lucide-react';

RectAreaLightUniformsLib.init();

// Constants for geometry
const PANEL_WIDTH = 6;
const PANEL_HEIGHT = 6;
const ROOM_SEGMENT_SIZE = 10;
const NUM_SEGMENTS = 5;
const ROOM_SIZE = ROOM_SEGMENT_SIZE * NUM_SEGMENTS;
const WALL_HEIGHT = 16;
const LOWER_WALL_HEIGHT = 8;
const LOWER_PANEL_Y = 5.0;
const INNER_LOWER_PANEL_Y = 4.0;
const UPPER_PANEL_Y = 12.0;
const WALL_THICKNESS = 0.5;
const BOUNDARY = ROOM_SIZE / 2 - 1.0; // Padding from outer walls

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

/**
 * Loads 3D furniture models based on configuration and adds them to the scene.
 */
const loadFurniture = (scene: THREE.Scene, gltfLoader: GLTFLoader, furnitureConfigs: FurnitureConfig[]) => {
  const configsByModelUrl = furnitureConfigs.reduce((acc, cfg) => {
    if (!acc[cfg.model_url]) acc[cfg.model_url] = [];
    acc[cfg.model_url].push(cfg);
    return acc;
  }, {} as Record<string, FurnitureConfig[]>);

  Object.entries(configsByModelUrl).forEach(([modelUrl, configs]) => {
    gltfLoader.load(modelUrl, (gltf) => {
      let mesh: THREE.Mesh | null = null;
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh && !mesh) {
          mesh = child;
        }
      });

      if (!mesh) {
        console.warn(`[Gallery Mobile] Could not find primary mesh in GLTF for ${modelUrl}`);
        return;
      }

      // 1. Create a base group containing the mesh
      const baseGroup = new THREE.Group();
      baseGroup.add(mesh);
      
      // 2. Calculate original bounding box for scaling/positioning reference
      const box = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3(); box.getSize(size);
      
      // 3. Instantiate all configurations for this model
      configs.forEach(instanceCfg => {
        const instance = baseGroup.clone();
        
        const targetWidth = instanceCfg.target_width || 4.5;
        const scaleFactor = targetWidth / size.x;
        
        // Apply scale multiplier from config
        const finalScaleX = scaleFactor * instanceCfg.scale_multiplier;
        const finalScaleY = scaleFactor * instanceCfg.scale_multiplier * (instanceCfg.scale_y_multiplier || 1.0);
        const finalScaleZ = scaleFactor * instanceCfg.scale_multiplier;
        
        instance.scale.set(finalScaleX, finalScaleY, finalScaleZ);
        
        // Adjust position to sit on the floor (Y position is relative to the model's bounding box min Y)
        instance.position.set(
          instanceCfg.position_x, 
          instanceCfg.position_y - box.min.y * finalScaleY, 
          instanceCfg.position_z
        );
        instance.rotation.y = instanceCfg.rotation_y;
        scene.add(instance);
      });
    }, undefined, (error) => {
      console.error(`[Gallery Mobile] Error loading GLTF model ${modelUrl}:`, error);
    });
  });
};


const NftGalleryMobile: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const teleportButtonsRef = useRef<THREE.Mesh[]>([]);
  const fadeMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const fadeScreenRef = useRef<THREE.Mesh | null>(null);
  
  const [isStarted, setIsStarted] = useState(false);
  const [isWalking, setIsWalking] = useState(false);
  const [marketBrowserState, setMarketBrowserState] = useState<{
    open: boolean;
    collection?: string;
    tokenId?: string | number;
  }>({ open: false });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

  const isTeleportingRef = useRef(false);
  const fadeStartTimeRef = useRef(0);
  const FADE_DURATION = 0.5;

  // Rotation state for touch dragging
  const rotationRef = useRef({ yaw: 0, pitch: 0 });
  const touchStartRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const isWalkingRef = useRef(false);

  useEffect(() => {
    isWalkingRef.current = isWalking;
  }, [isWalking]);

  const loadTexture = useCallback(async (url: string, panel: Panel, contentType: string): Promise<THREE.Texture | THREE.VideoTexture> => {
    const isVideo = isVideoContent(contentType, url);
    const isGif = isGifContent(contentType, url);

    if (panel.videoElement) {
      panel.videoElement.pause();
      panel.videoElement.src = '';
      panel.videoElement = null;
    }

    if (panel.gifStopFunction) {
      panel.gifStopFunction();
      panel.gifStopFunction = null;
    }

    if (isGif) {
      const { texture, stop } = await createGifTexture(url);
      panel.gifStopFunction = stop;
      return texture;
    }

    if (isVideo) {
      const videoEl = document.createElement('video');
      videoEl.playsInline = true;
      videoEl.autoplay = true;
      videoEl.loop = true;
      videoEl.muted = true;
      videoEl.crossOrigin = 'anonymous';
      videoEl.src = url;
      panel.videoElement = videoEl;
      const videoTexture = new THREE.VideoTexture(videoEl);
      return videoTexture;
    }

    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, resolve, undefined, reject);
    });
  }, []);

  const updatePanelContent = useCallback(async (panel: Panel, source: NftSource | null) => {
    disposeTextureSafely(panel.mesh);
    panel.mesh.material = new THREE.MeshBasicMaterial({ color: 0x222222 });
    panel.metadataUrl = '';
    
    if (!source || source.contractAddress === '') return;

    const metadata = await getCachedNftMetadata(source.contractAddress, source.tokenId);
    if (!metadata) return;

    try {
      const texture = await loadTexture(metadata.contentUrl, panel, metadata.contentType || '');
      panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture });
      panel.metadataUrl = metadata.source;
      panel.isVideo = isVideoContent(metadata.contentType || '', metadata.contentUrl);
      panel.isGif = isGifContent(metadata.contentType || '', metadata.contentUrl);
      
      const config = GALLERY_PANEL_CONFIG[panel.wallName];
      const showArrows = config && config.tokenIds.length > 1;
      panel.prevArrow.visible = showArrows;
      panel.nextArrow.visible = showArrows;
    } catch (e) {
      console.error(e);
    }
  }, [loadTexture]);

  const performTeleport = (targetY: number) => {
    if (isTeleportingRef.current) return;
    isTeleportingRef.current = true;
    fadeStartTimeRef.current = performance.now();

    setTimeout(() => {
      if (cameraRef.current) {
        cameraRef.current.position.y = targetY;
      }
    }, FADE_DURATION * 1000);
  };

  const checkCollision = useCallback((pos: THREE.Vector3) => {
    // Outer boundaries
    if (Math.abs(pos.x) > BOUNDARY || Math.abs(pos.z) > BOUNDARY) return true;

    // Inner walls (only ground floor)
    if (pos.y < 5) {
      const padding = 0.8;
      const wallThick = 0.25 + padding;
      const wallHalfLen = 5.0 + padding;
      
      const crossPoints = [-10, 10];
      const innerBoundary = 5.0;

      // Check N/S inner walls
      for (const cp of crossPoints) {
        // North segments
        if (Math.abs(pos.z - (-innerBoundary)) < wallThick && Math.abs(pos.x - cp) < wallHalfLen) return true;
        // South segments
        if (Math.abs(pos.z - innerBoundary) < wallThick && Math.abs(pos.x - cp) < wallHalfLen) return true;
      }

      // Check E/W inner walls
      for (const cp of crossPoints) {
        // East segments
        if (Math.abs(pos.x - innerBoundary) < wallThick && Math.abs(pos.z - cp) < wallHalfLen) return true;
        // West segments
        if (Math.abs(pos.x - (-innerBoundary)) < wallThick && Math.abs(pos.z - cp) < wallHalfLen) return true;
      }
    }
    
    return false;
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    cameraRef.current = camera;
    camera.position.set(0, 1.6, 20);
    camera.rotation.order = 'YXZ';

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current = renderer;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x404050, 1.0));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, WALL_HEIGHT, 0);
    scene.add(hemiLight);

    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.8,
      metalness: 0.1,
    });

    const halfRoomSize = ROOM_SIZE / 2;
    const outerWallGeometry = new THREE.BoxGeometry(ROOM_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
    const halfWallHeight = WALL_HEIGHT / 2;

    ['north', 'south', 'east', 'west'].forEach((dir) => {
      const wall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
      if (dir === 'north') wall.position.set(0, halfWallHeight, -halfRoomSize);
      if (dir === 'south') wall.position.set(0, halfWallHeight, halfRoomSize);
      if (dir === 'east') {
        wall.rotation.y = Math.PI / 2;
        wall.position.set(halfRoomSize, halfWallHeight, 0);
      }
      if (dir === 'west') {
        wall.rotation.y = Math.PI / 2;
        wall.position.set(-halfRoomSize, halfWallHeight, 0);
      }
      scene.add(wall);
    });

    const crossWallGeometry = new THREE.BoxGeometry(ROOM_SEGMENT_SIZE, LOWER_WALL_HEIGHT, WALL_THICKNESS);
    const CROSS_WALL_BOUNDARY = 5;
    const crossWallSegments = [-10, 10];

    crossWallSegments.forEach((segmentCenter) => {
      const w1 = new THREE.Mesh(crossWallGeometry, wallMaterial.clone());
      w1.position.set(segmentCenter, LOWER_WALL_HEIGHT / 2, -CROSS_WALL_BOUNDARY);
      scene.add(w1);
      const w2 = new THREE.Mesh(crossWallGeometry, wallMaterial.clone());
      w2.position.set(segmentCenter, LOWER_WALL_HEIGHT / 2, CROSS_WALL_BOUNDARY);
      scene.add(w2);
      const w3 = new THREE.Mesh(crossWallGeometry, wallMaterial.clone());
      w3.rotation.y = Math.PI / 2;
      w3.position.set(-CROSS_WALL_BOUNDARY, LOWER_WALL_HEIGHT / 2, segmentCenter);
      scene.add(w3);
      const w4 = new THREE.Mesh(crossWallGeometry, wallMaterial.clone());
      w4.rotation.y = Math.PI / 2;
      w4.position.set(CROSS_WALL_BOUNDARY, LOWER_WALL_HEIGHT / 2, segmentCenter);
      scene.add(w4);
    });

    const rainbowMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: rainbowVertexShader,
      fragmentShader: rainbowFragmentShader,
      side: THREE.DoubleSide
    });

    const floorGeo = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2, metalness: 0.1 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const ceiling = new THREE.Mesh(floorGeo, rainbowMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_HEIGHT;
    scene.add(ceiling);

    const PLATFORM_Y = LOWER_WALL_HEIGHT + WALL_THICKNESS / 2 + 0.01;
    const platform = new THREE.Mesh(new THREE.BoxGeometry(30, WALL_THICKNESS, 30), wallMaterial.clone());
    platform.position.set(0, PLATFORM_Y, 0);
    scene.add(platform);

    const underPlatform = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), rainbowMaterial);
    underPlatform.rotation.x = -Math.PI / 2;
    underPlatform.position.y = LOWER_WALL_HEIGHT;
    scene.add(underPlatform);

    const TELEPORT_BUTTON_COLOR = 0x1a3f7c;
    const buttonGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.2, 32);
    const buttonMat = new THREE.MeshStandardMaterial({
      color: TELEPORT_BUTTON_COLOR,
      emissive: TELEPORT_BUTTON_COLOR,
      emissiveIntensity: 0.5,
      roughness: 0.1,
      metalness: 0.9,
    });

    const gBtn = new THREE.Mesh(buttonGeo, buttonMat.clone());
    gBtn.position.set(0, 0.2, 0);
    gBtn.userData = { isTeleportButton: true, targetY: PLATFORM_Y + 1.6 + WALL_THICKNESS / 2 };
    scene.add(gBtn);

    const uBtn = new THREE.Mesh(buttonGeo, buttonMat.clone());
    uBtn.position.set(0, PLATFORM_Y + WALL_THICKNESS / 2 + 0.1, 0);
    uBtn.userData = { isTeleportButton: true, targetY: 1.6 };
    scene.add(uBtn);
    teleportButtonsRef.current = [gBtn, uBtn];

    const gltfLoader = new GLTFLoader();
    
    // --- Furniture Loading ---
    loadFurniture(scene, gltfLoader, GALLERY_FURNITURE_CONFIG);

    let stopLoad = false;
    const createPanels = async () => {
      await initializeGalleryConfig();
      loadFurniture(scene, gltfLoader, GALLERY_FURNITURE_CONFIG); // Re-run after config is initialized
      
      const panelGeo = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
      const arrowShape = new THREE.Shape();
      arrowShape.moveTo(0, 0.15); arrowShape.lineTo(0.3, 0); arrowShape.lineTo(0, -0.15);
      const arrowGeo = new THREE.ShapeGeometry(arrowShape);
      const ARROW_DEPTH_OFFSET = 0.15 + WALL_THICKNESS / 2;
      const ARROW_PANEL_OFFSET = 3.2;

      const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall'] as const;
      const tempPanels: Panel[] = [];

      for (let i = 0; i <= 4; i++) {
        for (const wallNameBase of WALL_NAMES) {
          const segmentCenter = (i - 2) * ROOM_SEGMENT_SIZE;
          const tiers: { y: number; suffix: '-ground' | '-first' }[] = [
            { y: LOWER_PANEL_Y, suffix: '-ground' },
            { y: UPPER_PANEL_Y, suffix: '-first' },
          ];

          for (const tier of tiers) {
            const key = `${wallNameBase}-${i}${tier.suffix}` as keyof PanelConfig;
            let x = 0, z = 0, rotY = 0, dx = 0, dz = 0;
            if (wallNameBase === 'north-wall') { x = segmentCenter; z = -halfRoomSize; rotY = 0; dz = ARROW_DEPTH_OFFSET; }
            if (wallNameBase === 'south-wall') { x = segmentCenter; z = halfRoomSize; rotY = Math.PI; dz = -ARROW_DEPTH_OFFSET; }
            if (wallNameBase === 'east-wall') { x = halfRoomSize; z = segmentCenter; rotY = -Math.PI / 2; dx = -ARROW_DEPTH_OFFSET; }
            if (wallNameBase === 'west-wall') { x = -halfRoomSize; z = segmentCenter; rotY = Math.PI / 2; dx = ARROW_DEPTH_OFFSET; }

            const mesh = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide }));
            mesh.position.set(x + dx, tier.y, z + dz);
            mesh.rotation.y = rotY;
            scene.add(mesh);

            const wallRotation = new THREE.Euler(0, rotY, 0, 'XYZ');
            const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);

            const prevArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
            prevArrow.rotation.y = rotY + Math.PI;
            prevArrow.position.copy(mesh.position).addScaledVector(rightVector, -ARROW_PANEL_OFFSET);
            scene.add(prevArrow);

            const nextArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
            nextArrow.rotation.y = rotY;
            nextArrow.position.copy(mesh.position).addScaledVector(rightVector, ARROW_PANEL_OFFSET);
            scene.add(nextArrow);

            const p: Panel = { mesh, wallName: key, metadataUrl: '', isVideo: false, isGif: false, prevArrow, nextArrow, videoElement: null, gifStopFunction: null };
            tempPanels.push(p);
            panelsRef.current.push(p);
          }
        }
      }

      crossWallSegments.forEach((sc, idx) => {
        const configs = [
          { key: `north-inner-wall-outer-${idx}`, pos: [sc, INNER_LOWER_PANEL_Y, -CROSS_WALL_BOUNDARY - ARROW_DEPTH_OFFSET], rot: Math.PI },
          { key: `north-inner-wall-inner-${idx}`, pos: [sc, INNER_LOWER_PANEL_Y, -CROSS_WALL_BOUNDARY + ARROW_DEPTH_OFFSET], rot: 0 },
          { key: `south-inner-wall-outer-${idx}`, pos: [sc, INNER_LOWER_PANEL_Y, CROSS_WALL_BOUNDARY + ARROW_DEPTH_OFFSET], rot: 0 },
          { key: `south-inner-wall-inner-${idx}`, pos: [sc, INNER_LOWER_PANEL_Y, CROSS_WALL_BOUNDARY - ARROW_DEPTH_OFFSET], rot: Math.PI },
          { key: `east-inner-wall-outer-${idx}`, pos: [CROSS_WALL_BOUNDARY + ARROW_DEPTH_OFFSET, INNER_LOWER_PANEL_Y, sc], rot: Math.PI / 2 },
          { key: `east-inner-wall-inner-${idx}`, pos: [CROSS_WALL_BOUNDARY - ARROW_DEPTH_OFFSET, INNER_LOWER_PANEL_Y, sc], rot: -Math.PI / 2 },
          { key: `west-inner-wall-outer-${idx}`, pos: [-CROSS_WALL_BOUNDARY - ARROW_DEPTH_OFFSET, INNER_LOWER_PANEL_Y, sc], rot: -Math.PI / 2 },
          { key: `west-inner-wall-inner-${idx}`, pos: [-CROSS_WALL_BOUNDARY + ARROW_DEPTH_OFFSET, INNER_LOWER_PANEL_Y, sc], rot: Math.PI / 2 },
        ];
        configs.forEach(cfg => {
          const mesh = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide }));
          mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
          mesh.rotation.y = cfg.rot;
          scene.add(mesh);
          const wallRotation = new THREE.Euler(0, cfg.rot, 0, 'XYZ');
          const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);
          const prevArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
          prevArrow.rotation.y = cfg.rot + Math.PI;
          prevArrow.position.copy(mesh.position).addScaledVector(rightVector, -ARROW_PANEL_OFFSET);
          scene.add(prevArrow);
          const nextArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
          nextArrow.rotation.y = cfg.rot;
          nextArrow.position.copy(mesh.position).addScaledVector(rightVector, ARROW_PANEL_OFFSET);
          scene.add(nextArrow);
          const p: Panel = { mesh, wallName: cfg.key as keyof PanelConfig, metadataUrl: '', isVideo: false, isGif: false, prevArrow, nextArrow, videoElement: null, gifStopFunction: null };
          tempPanels.push(p);
          panelsRef.current.push(p);
        });
      });

      for (let i = 0; i < tempPanels.length; i++) {
        if (stopLoad) break;
        const p = tempPanels[i];
        updatePanelContent(p, getCurrentNftSource(p.wallName));
        if (i % 3 === 0) await new Promise(resolve => setTimeout(resolve, 100));
      }
    };
    createPanels();

    const fadeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false });
    fadeMaterialRef.current = fadeMaterial;
    const fadeScreen = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), fadeMaterial);
    fadeScreen.renderOrder = 999;
    fadeScreenRef.current = fadeScreen;
    scene.add(fadeScreen);

    const handleTouchStart = (e: TouchEvent) => {
      isDraggingRef.current = false;
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const handleTouchMove = (e: TouchEvent) => {
      isDraggingRef.current = true;
      const deltaX = e.touches[0].clientX - touchStartRef.current.x;
      const deltaY = e.touches[0].clientY - touchStartRef.current.y;
      rotationRef.current.yaw += deltaX * 0.005;
      rotationRef.current.pitch += deltaY * 0.005;
      rotationRef.current.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, rotationRef.current.pitch));
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (!isDraggingRef.current) {
        const touch = e.changedTouches[0];
        const x = (touch.clientX / window.innerWidth) * 2 - 1;
        const y = -(touch.clientY / window.innerHeight) * 2 + 1;
        raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), camera);
        const objects = [...panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow]), ...teleportButtonsRef.current];
        const intersects = raycasterRef.current.intersectObjects(objects);
        if (intersects.length > 0) {
          const hit = intersects[0].object as THREE.Mesh;
          setIsWalking(false);
          if (hit.userData.isTeleportButton) {
            performTeleport(hit.userData.targetY);
            return;
          }
          const p = panelsRef.current.find(p => p.mesh === hit || p.prevArrow === hit || p.nextArrow === hit);
          if (p) {
            if (hit === p.prevArrow || hit === p.nextArrow) {
              if (updatePanelIndex(p.wallName, hit === p.nextArrow ? 'next' : 'prev')) updatePanelContent(p, getCurrentNftSource(p.wallName));
            } else if (p.metadataUrl) {
              const cfg = GALLERY_PANEL_CONFIG[p.wallName];
              setMarketBrowserState({ open: true, collection: cfg.contractAddress, tokenId: cfg.tokenIds[cfg.currentIndex] });
            }
          }
        }
      }
    };

    const container = mountRef.current;
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd);

    let lastTime = performance.now();
    const animate = () => {
      const time = performance.now();
      const delta = (time - lastTime) * 0.001;
      lastTime = time;
      rainbowMaterial.uniforms.time.value = time * 0.001;
      if (camera) {
        camera.rotation.set(rotationRef.current.pitch, rotationRef.current.yaw, 0);
        if (isWalkingRef.current && !isTeleportingRef.current) {
          const moveSpeed = 4.0; 
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
          forward.y = 0;
          forward.normalize();
          const nextX = new THREE.Vector3(camera.position.x + forward.x * moveSpeed * delta, camera.position.y, camera.position.z);
          if (!checkCollision(nextX)) camera.position.x = nextX.x;
          const nextZ = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z + forward.z * moveSpeed * delta);
          if (!checkCollision(nextZ)) camera.position.z = nextZ.z;
        }
        if (fadeScreenRef.current) {
          fadeScreenRef.current.position.copy(camera.position);
          fadeScreenRef.current.quaternion.copy(camera.quaternion);
        }
      }
      if (isTeleportingRef.current && fadeMaterialRef.current) {
        const elapsed = (time - fadeStartTimeRef.current) / 1000;
        const half = FADE_DURATION;
        if (elapsed < half) fadeMaterialRef.current.opacity = elapsed / half;
        else if (elapsed < 2 * half) fadeMaterialRef.current.opacity = 1 - (elapsed - half) / half;
        else { fadeMaterialRef.current.opacity = 0; isTeleportingRef.current = false; }
      }
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();
    const onResize = () => {
      if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', onResize);
    return () => {
      stopLoad = true;
      renderer.dispose();
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('resize', onResize);
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, [updatePanelContent, checkCollision]);

  const handleStart = () => {
    setIsStarted(true);
    const bgm = (window as any).musicControls;
    if (bgm && bgm.play) bgm.play();
  };

  return (
    <div className="w-full h-full bg-black relative touch-none">
      <div ref={mountRef} className="w-full h-full touch-none" />
      {!isStarted && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-50 cursor-pointer" onClick={handleStart}>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-2xl text-center max-w-xs animate-in fade-in zoom-in duration-300">
            <h2 className="text-2xl font-bold text-white mb-4">Nice Art Gallery</h2>
            <p className="text-white/70 mb-6">Drag to look around, tap on panels to interact.</p>
            <button className="bg-primary text-primary-foreground px-8 py-3 rounded-full font-bold hover:scale-105 transition-transform">Enter Gallery</button>
          </div>
        </div>
      )}
      {isStarted && (
        <>
          <div className="fixed bottom-4 left-4 right-4 text-white text-center pointer-events-none bg-black/40 p-2 rounded text-xs z-20">Drag to look around • Tap panels to interact</div>
          <button onClick={() => setIsWalking(!isWalking)} className={`fixed bottom-16 right-6 p-4 rounded-full transition-all z-30 shadow-lg ${isWalking ? 'bg-primary text-primary-foreground scale-110' : 'bg-white/10 text-white backdrop-blur-md border border-white/20'}`}>
            <Footprints className={`h-8 w-8 ${isWalking ? 'animate-pulse' : ''}`} />
          </button>
        </>
      )}
      {marketBrowserState.open && (
        <MarketBrowserRefined collection={marketBrowserState.collection || ''} tokenId={marketBrowserState.tokenId || ''} open={marketBrowserState.open} onClose={() => setMarketBrowserState({ open: false })} />
      )}
    </div>
  );
};

export default NftGalleryMobile;