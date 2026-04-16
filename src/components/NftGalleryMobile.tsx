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

interface NftGalleryMobileProps {
  onLoadingProgress?: (progress: number) => void;
  onLoadingComplete?: () => void;
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

function createProceduralTable() {
  const group = new THREE.Group();
  const mahoganyMat = new THREE.MeshStandardMaterial({ 
    color: 0x4A1C1C, 
    roughness: 0.6, 
    metalness: 0.1 
  });
  const chromeMat = new THREE.MeshStandardMaterial({ 
    color: 0x888888, 
    metalness: 1.0, 
    roughness: 0.1 
  });
  const topGeo = new THREE.BoxGeometry(2.4, 0.08, 1.4);
  const top = new THREE.Mesh(topGeo, mahoganyMat);
  top.position.y = 0.8;
  group.add(top);
  const supportGeo = new THREE.BoxGeometry(0.2, 0.75, 0.2);
  const support = new THREE.Mesh(supportGeo, chromeMat);
  support.position.y = 0.4;
  group.add(support);
  const baseGeo = new THREE.BoxGeometry(1.6, 0.05, 1.0);
  const base = new THREE.Mesh(baseGeo, mahoganyMat);
  base.position.y = 0.025;
  group.add(base);
  return group;
}

function createDiamondTeleporter() {
  const group = new THREE.Group();
  const diamondGeo = new THREE.OctahedronGeometry(0.8, 0);
  const diamondMat = new THREE.MeshPhysicalMaterial({
    color: 0x00ccff,
    transparent: true,
    opacity: 0.5,
    metalness: 0.1,
    roughness: 0,
    transmission: 0.8,
    thickness: 1,
    emissive: 0x0044ff,
    emissiveIntensity: 0.2
  });
  const diamond = new THREE.Mesh(diamondGeo, diamondMat);
  diamond.name = "diamondBody";
  group.add(diamond);
  const edges = new THREE.EdgesGeometry(diamondGeo);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
  const etchings = new THREE.LineSegments(edges, lineMat);
  diamond.add(etchings);
  const coreGeo = new THREE.SphereGeometry(0.15, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);
  const light = new THREE.PointLight(0x00ffff, 3, 5);
  group.add(light);
  const createElectron = (radius: number, color: number) => {
    const eGroup = new THREE.Group();
    const eGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const eMat = new THREE.MeshBasicMaterial({ color: color });
    const electron = new THREE.Mesh(eGeo, eMat);
    electron.position.x = radius;
    eGroup.add(electron);
    return eGroup;
  };
  const electron1 = createElectron(1.3, 0x00ffff);
  electron1.rotation.z = Math.PI / 4;
  group.add(electron1);
  const electron2 = createElectron(1.5, 0xff00ff);
  electron2.rotation.x = Math.PI / 3;
  group.add(electron2);
  group.userData = { 
    isTeleportButton: true,
    electron1,
    electron2,
    diamond
  };
  return group;
}

const NftGalleryMobile: React.FC<NftGalleryMobileProps> = ({ onLoadingProgress, onLoadingComplete }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const teleportButtonsRef = useRef<THREE.Group[]>([]);
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

  const rotationRef = useRef({ yaw: 0, pitch: 0 });
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const isWalkingRef = useRef(false);
  const isPointerDownRef = useRef(false);

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
      return new THREE.VideoTexture(videoEl);
    }
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, resolve, null, reject);
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
      if (cameraRef.current) cameraRef.current.position.y = targetY;
    }, FADE_DURATION * 1000);
  };

  const checkCollision = useCallback((pos: THREE.Vector3) => {
    if (Math.abs(pos.x) > BOUNDARY || Math.abs(pos.z) > BOUNDARY) return true;
    if (pos.y < 5) {
      const padding = 0.8;
      const wallThick = 0.25 + padding;
      const wallHalfLen = 5.0 + padding;
      const crossPoints = [-10, 10];
      const innerBoundary = 5.0;
      for (const cp of crossPoints) {
        if (Math.abs(pos.z - (-innerBoundary)) < wallThick && Math.abs(pos.x - cp) < wallHalfLen) return true;
        if (Math.abs(pos.z - innerBoundary) < wallThick && Math.abs(pos.x - cp) < wallHalfLen) return true;
      }
      for (const cp of crossPoints) {
        if (Math.abs(pos.x - innerBoundary) < wallThick && Math.abs(pos.z - cp) < wallHalfLen) return true;
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
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8, metalness: 0.1 });
    const halfRoomSize = ROOM_SIZE / 2;
    const outerWallGeometry = new THREE.BoxGeometry(ROOM_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
    const halfWallHeight = WALL_HEIGHT / 2;
    ['north', 'south', 'east', 'west'].forEach((dir) => {
      const wall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
      if (dir === 'north') wall.position.set(0, halfWallHeight, -halfRoomSize);
      if (dir === 'south') wall.position.set(0, halfWallHeight, halfRoomSize);
      if (dir === 'east') { wall.rotation.y = Math.PI / 2; wall.position.set(halfRoomSize, halfWallHeight, 0); }
      if (dir === 'west') { wall.rotation.y = Math.PI / 2; wall.position.set(-halfRoomSize, halfWallHeight, 0); }
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
    const textureLoader = new THREE.TextureLoader();
    const logoTexture = textureLoader.load('/electroneum-logo-symbol.svg');
    logoTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const vinylGeo = new THREE.PlaneGeometry(10, 10);
    const vinylMat = new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const groundVinyl = new THREE.Mesh(vinylGeo, vinylMat);
    groundVinyl.rotation.x = -Math.PI / 2;
    groundVinyl.position.set(0, 0.01, 0);
    scene.add(groundVinyl);
    const gBtn = createDiamondTeleporter();
    gBtn.position.set(0, 2.0, 0);
    gBtn.userData.targetY = PLATFORM_Y + 1.6 + WALL_THICKNESS / 2;
    scene.add(gBtn);
    const uBtn = createDiamondTeleporter();
    uBtn.position.set(0, PLATFORM_Y + WALL_THICKNESS / 2 + 2.0, 0);
    uBtn.userData.targetY = 1.6;
    scene.add(uBtn);
    teleportButtonsRef.current = [gBtn, uBtn];
    const gltfLoader = new GLTFLoader();
    gltfLoader.load('/assets/models/sofa.glb', (gltf) => {
      let sofaMesh: THREE.Mesh | null = null;
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh && !sofaMesh) {
          const box = new THREE.Box3().setFromObject(child);
          const size = new THREE.Vector3(); box.getSize(size);
          if (size.x < 15 && size.z < 15) sofaMesh = child;
        }
      });
      if (sofaMesh) {
        const mesh = sofaMesh as THREE.Mesh;
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox!;
        const size = new THREE.Vector3(); box.getSize(size);
        const targetWidth = 4.5;
        const scale = targetWidth / size.x;
        const sofaGroup = new THREE.Group();
        sofaGroup.add(mesh);
        mesh.scale.set(scale, scale * 2, scale);
        mesh.position.set(- (box.min.x + size.x / 2) * scale, - box.min.y * (scale * 2), - (box.min.z + size.z / 2) * scale);
        const sofaPositions = [{ x: 0, z: 11 }, { x: 0, z: -11 }, { x: 11, z: 0 }, { x: -11, z: 0 }];
        sofaPositions.forEach(pos => {
          const instance = sofaGroup.clone();
          instance.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2, pos.z);
          instance.rotation.y = Math.atan2(-pos.x, -pos.z);
          scene.add(instance);
        });
      }
    });
    gltfLoader.load('/assets/models/plant.glb', (gltf) => {
      const plantModel = gltf.scene;
      const modelBox = new THREE.Box3().setFromObject(plantModel);
      const modelMinY = modelBox.min.y;
      const modelMaxY = modelBox.max.y;
      const modelHeight = modelMaxY - modelMinY;
      plantModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry.computeBoundingBox();
          const box = mesh.geometry.boundingBox!;
          const meshMinY = box.min.y;
          const meshMaxY = box.max.y;
          const meshHeight = meshMaxY - meshMinY;
          const nMinY = (meshMinY - modelMinY) / modelHeight;
          const nMaxY = (meshMaxY - modelMinY) / modelHeight;
          if (nMinY < 0.05 && meshHeight < 0.05) { mesh.visible = false; return; }
          if (nMinY < 0.1 && nMaxY < 0.4) mesh.material = new THREE.MeshStandardMaterial({ color: 0xe2725b, roughness: 0.9 });
          else if (nMinY > 0.1 && nMinY < 0.3 && meshHeight < 0.1) mesh.material = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 1.0 });
          else {
            const meshSize = new THREE.Vector3(); box.getSize(meshSize);
            const aspect = meshSize.y / Math.max(meshSize.x, meshSize.z);
            mesh.material = new THREE.MeshStandardMaterial({ color: aspect > 2.0 ? 0x3d2b1f : 0x2e7d32, roughness: aspect > 2.0 ? 0.8 : 0.6 });
          }
        }
      });
      const size = new THREE.Vector3(); modelBox.getSize(size);
      const scale = 2.5 / size.y;
      plantModel.scale.set(scale, scale, scale);
      [{ x: 14.2, z: 14.2 }, { x: -14.2, z: 14.2 }, { x: 14.2, z: -14.2 }, { x: -14.2, z: -14.2 }].forEach(pos => {
        const plant = plantModel.clone();
        plant.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2, pos.z);
        scene.add(plant);
      });
    });
    const tablePositions = [{ x: 0, z: 9.8 }, { x: 0, z: -9.8 }, { x: 9.8, z: 0 }, { x: -9.8, z: 0 }];
    tablePositions.forEach(pos => {
      const table = createProceduralTable();
      table.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2, pos.z);
      table.rotation.y = Math.atan2(-pos.x, -pos.z);
      table.translateX(0.9);
      scene.add(table);
    });
    gltfLoader.load('/assets/models/Cappuccino_Mug.glb', (gltf) => {
      const mugModel = gltf.scene;
      const porcelainMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, reflectivity: 0.5 });
      mugModel.traverse(c => { if (c instanceof THREE.Mesh) c.material = porcelainMat; });
      const box = new THREE.Box3().setFromObject(mugModel);
      const size = new THREE.Vector3(); box.getSize(size);
      const scale = 0.28 / size.x;
      mugModel.scale.set(scale, scale, scale);
      const bY = box.min.y * scale;
      tablePositions.forEach((pos, idx) => {
        const mug = mugModel.clone();
        const tY = PLATFORM_Y + WALL_THICKNESS / 2 + 0.84;
        mug.position.set(pos.x, tY - bY, pos.z);
        mug.rotation.y = Math.atan2(-pos.x, -pos.z);
        mug.translateX(1.1); mug.translateZ(0.25 * (idx % 2 === 0 ? 1 : -1));
        scene.add(mug);
      });
    });
    const rugTexture = textureLoader.load('/textures/rug-pattern-2.jpg');
    const rugMat = new THREE.MeshStandardMaterial({ map: rugTexture, roughness: 1, metalness: 0, transparent: true, opacity: 0.9 });
    const rugGeo = new THREE.PlaneGeometry(6, 8);
    [{ x: 0, z: 10.4, rot: 0 }, { x: 0, z: -10.4, rot: Math.PI }, { x: 10.4, z: 0, rot: -Math.PI / 2 }, { x: -10.4, z: 0, rot: Math.PI / 2 }].forEach(pos => {
      const rug = new THREE.Mesh(rugGeo, rugMat);
      rug.rotation.x = -Math.PI / 2; rug.rotation.z = pos.rot;
      rug.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2 + 0.005, pos.z);
      scene.add(rug);
    });
    let stopLoad = false;
    const createPanels = async () => {
      await initializeGalleryConfig();
      const pGeo = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
      const aShape = new THREE.Shape();
      aShape.moveTo(0, 0.15); aShape.lineTo(0.3, 0); aShape.lineTo(0, -0.15);
      const aGeo = new THREE.ShapeGeometry(aShape);
      const dOff = 0.15 + WALL_THICKNESS / 2;
      const aOff = 3.2;
      const tPanels: Panel[] = [];
      const wNames = ['north-wall', 'south-wall', 'east-wall', 'west-wall'] as const;
      for (let i = 0; i <= 4; i++) {
        for (const wBase of wNames) {
          const sC = (i - 2) * 10;
          for (const tier of [{ y: LOWER_PANEL_Y, s: '-ground' }, { y: UPPER_PANEL_Y, s: '-first' }]) {
            const key = `${wBase}-${i}${tier.s}` as keyof PanelConfig;
            let x = 0, z = 0, rY = 0, dx = 0, dz = 0;
            if (wBase === 'north-wall') { x = sC; z = -halfRoomSize; rY = 0; dz = dOff; }
            if (wBase === 'south-wall') { x = sC; z = halfRoomSize; rY = Math.PI; dz = -dOff; }
            if (wBase === 'east-wall') { x = halfRoomSize; z = sC; rY = -Math.PI / 2; dx = -dOff; }
            if (wBase === 'west-wall') { x = -halfRoomSize; z = sC; rY = Math.PI / 2; dx = dOff; }
            const mesh = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide }));
            mesh.position.set(x + dx, tier.y, z + dz);
            mesh.rotation.y = rY;
            scene.add(mesh);
            const rV = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, rY, 0));
            const pA = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
            pA.rotation.y = rY + Math.PI; pA.position.copy(mesh.position).addScaledVector(rV, -aOff);
            scene.add(pA);
            const nA = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
            nA.rotation.y = rY; nA.position.copy(mesh.position).addScaledVector(rV, aOff);
            scene.add(nA);
            const p: Panel = { mesh, wallName: key, metadataUrl: '', isVideo: false, isGif: false, prevArrow: pA, nextArrow: nA, videoElement: null, gifStopFunction: null };
            tPanels.push(p); panelsRef.current.push(p);
          }
        }
      }
      crossWallSegments.forEach((sc, idx) => {
        const cfgs = [
          { k: `north-inner-wall-outer-${idx}`, pos: [sc, INNER_LOWER_PANEL_Y, -5 - dOff], rot: Math.PI },
          { k: `north-inner-wall-inner-${idx}`, pos: [sc, INNER_LOWER_PANEL_Y, -5 + dOff], rot: 0 },
          { k: `south-inner-wall-outer-${idx}`, pos: [sc, INNER_LOWER_PANEL_Y, 5 + dOff], rot: 0 },
          { k: `south-inner-wall-inner-${idx}`, pos: [sc, INNER_LOWER_PANEL_Y, 5 - dOff], rot: Math.PI },
          { k: `east-inner-wall-outer-${idx}`, pos: [5 + dOff, INNER_LOWER_PANEL_Y, sc], rot: Math.PI / 2 },
          { k: `east-inner-wall-inner-${idx}`, pos: [5 - dOff, INNER_LOWER_PANEL_Y, sc], rot: -Math.PI / 2 },
          { k: `west-inner-wall-outer-${idx}`, pos: [-5 - dOff, INNER_LOWER_PANEL_Y, sc], rot: -Math.PI / 2 },
          { k: `west-inner-wall-inner-${idx}`, pos: [-5 + dOff, INNER_LOWER_PANEL_Y, sc], rot: Math.PI / 2 },
        ];
        cfgs.forEach(cfg => {
          const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide }));
          m.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]); m.rotation.y = cfg.rot;
          scene.add(m);
          const rV = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, cfg.rot, 0));
          const pA = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
          pA.rotation.y = cfg.rot + Math.PI; pA.position.copy(m.position).addScaledVector(rV, -aOff);
          scene.add(pA);
          const nA = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
          nA.rotation.y = cfg.rot; nA.position.copy(m.position).addScaledVector(rV, aOff);
          scene.add(nA);
          const p: Panel = { mesh: m, wallName: cfg.k as any, metadataUrl: '', isVideo: false, isGif: false, prevArrow: pA, nextArrow: nA, videoElement: null, gifStopFunction: null };
          tPanels.push(p); panelsRef.current.push(p);
        });
      });
      for (let i = 0; i < tPanels.length; i++) {
        if (stopLoad) break;
        await updatePanelContent(tPanels[i], getCurrentNftSource(tPanels[i].wallName));
        if (onLoadingProgress) onLoadingProgress((i + 1) / tPanels.length * 100);
        if (i % 3 === 0) await new Promise(r => setTimeout(r, 50));
      }
      if (!stopLoad && onLoadingComplete) onLoadingComplete();
    };
    createPanels();
    const fMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0, depthTest: false });
    fadeMaterialRef.current = fMat;
    const fS = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), fMat);
    fS.renderOrder = 999; fadeScreenRef.current = fS; scene.add(fS);

    const handlePointerDown = (e: PointerEvent) => {
      isPointerDownRef.current = true;
      isDraggingRef.current = false;
      pointerStartRef.current = { x: e.clientX, y: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
    const handlePointerMove = (e: PointerEvent) => {
      if (!isPointerDownRef.current) return;
      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDraggingRef.current = true;
      rotationRef.current.yaw += dx * 0.005;
      rotationRef.current.pitch += dy * 0.005;
      rotationRef.current.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, rotationRef.current.pitch));
      pointerStartRef.current = { x: e.clientX, y: e.clientY };
    };
    const handlePointerUp = (e: PointerEvent) => {
      isPointerDownRef.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      if (!isDraggingRef.current) {
        const x = (e.clientX / window.innerWidth) * 2 - 1;
        const y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), camera);
        const objs = sceneRef.current.children.filter(o => o !== fadeScreenRef.current);
        const hits = raycasterRef.current.intersectObjects(objs, true);
        if (hits.length > 0) {
          const hit = hits[0].object as THREE.Mesh;
          setIsWalking(false);
          let pT: THREE.Group | null = null;
          if (hit.parent?.userData?.isTeleportButton) pT = hit.parent as THREE.Group;
          else if (hit.parent?.parent?.userData?.isTeleportButton) pT = hit.parent.parent as THREE.Group;
          if (pT) performTeleport(pT.userData.targetY);
          else {
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
      }
    };
    const container = mountRef.current;
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerUp);
    let lastTime = performance.now();
    const animate = () => {
      const time = performance.now();
      const delta = (time - lastTime) * 0.001; lastTime = time;
      rainbowMaterial.uniforms.time.value = time * 0.001;
      teleportButtonsRef.current.forEach(btn => {
        const { electron1, electron2, diamond } = btn.userData;
        if (diamond) { diamond.rotation.y += delta * 0.5; diamond.position.y = Math.sin(time * 0.002) * 0.1; }
        if (electron1) electron1.rotation.y += delta * 2;
        if (electron2) electron2.rotation.y -= delta * 1.5;
      });
      if (camera) {
        camera.rotation.set(rotationRef.current.pitch, rotationRef.current.yaw, 0);
        if (isWalkingRef.current && !isTeleportingRef.current) {
          const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); f.y = 0; f.normalize();
          const nX = new THREE.Vector3(camera.position.x + f.x * 3.4 * delta, camera.position.y, camera.position.z);
          if (!checkCollision(nX)) camera.position.x = nX.x;
          const nZ = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z + f.z * 3.4 * delta);
          if (!checkCollision(nZ)) camera.position.z = nZ.z;
        }
        if (fadeScreenRef.current) { fadeScreenRef.current.position.copy(camera.position); fadeScreenRef.current.quaternion.copy(camera.quaternion); }
      }
      if (isTeleportingRef.current && fadeMaterialRef.current) {
        const el = (time - fadeStartTimeRef.current) / 1000;
        if (el < FADE_DURATION) fadeMaterialRef.current.opacity = el / FADE_DURATION;
        else if (el < 2 * FADE_DURATION) fadeMaterialRef.current.opacity = 1 - (el - FADE_DURATION) / FADE_DURATION;
        else { fadeMaterialRef.current.opacity = 0; isTeleportingRef.current = false; }
      }
      renderer.render(scene, camera); requestAnimationFrame(animate);
    };
    animate();
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => {
      stopLoad = true; renderer.dispose();
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('resize', onResize);
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, [updatePanelContent, checkCollision, onLoadingProgress, onLoadingComplete]);

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