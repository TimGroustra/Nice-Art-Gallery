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
let currentTargetedButton: THREE.Group | null = null;

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
 * Creates a minimalist rectangular gallery table using Three.js primitives.
 */
function createProceduralTable() {
  const group = new THREE.Group();
  
  // Table Materials
  const darkMat = new THREE.MeshStandardMaterial({ 
    color: 0x111111, 
    roughness: 0.1, 
    metalness: 0.8 
  });
  const chromeMat = new THREE.MeshStandardMaterial({ 
    color: 0x888888, 
    metalness: 1.0, 
    roughness: 0.1 
  });

  // 1. Tabletop (Rectangular)
  const topGeo = new THREE.BoxGeometry(2.4, 0.08, 1.4);
  const top = new THREE.Mesh(topGeo, darkMat);
  top.position.y = 0.8;
  group.add(top);

  // 2. Central Support (Rectangular Chrome Column)
  const supportGeo = new THREE.BoxGeometry(0.2, 0.75, 0.2);
  const support = new THREE.Mesh(supportGeo, chromeMat);
  support.position.y = 0.4;
  group.add(support);

  // 3. Base (Rectangular)
  const baseGeo = new THREE.BoxGeometry(1.6, 0.05, 1.0);
  const base = new THREE.Mesh(baseGeo, darkMat);
  base.position.y = 0.025;
  group.add(base);

  return group;
}

/**
 * Creates the upgraded Diamond Teleporter group.
 */
function createDiamondTeleporter() {
  const group = new THREE.Group();

  // 1. The Diamond (Octahedron)
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

  // 2. Lightning Etchings (Wireframe Overlay)
  const edges = new THREE.EdgesGeometry(diamondGeo);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
  const etchings = new THREE.LineSegments(edges, lineMat);
  diamond.add(etchings);

  // 3. Glowing Inner Light (Small Sphere)
  const coreGeo = new THREE.SphereGeometry(0.15, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  const light = new THREE.PointLight(0x00ffff, 5, 5);
  group.add(light);

  // 4. Electrons
  const createElectron = (radius: number, color: number) => {
    const eGroup = new THREE.Group();
    const eGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const eMat = new THREE.MeshBasicMaterial({ color: color });
    const electron = new THREE.Mesh(eGeo, eMat);
    electron.position.x = radius;
    eGroup.add(electron);

    // Trail
    const trailPoints = [];
    for (let i = 0; i < 20; i++) trailPoints.push(new THREE.Vector3(radius, 0, 0));
    const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPoints);
    const trailMat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.4 });
    const trail = new THREE.Line(trailGeo, trailMat);
    eGroup.add(trail);

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

const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [marketBrowserState, setMarketBrowserState] = useState<{
    open: boolean;
    collection?: string;
    tokenId?: string | number;
  }>({ open: false });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const teleportButtonsRef = useRef<THREE.Group[]>([]);
  const fadeScreenRef = useRef<THREE.Mesh | null>(null);
  const fadeMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);

  const isTeleportingRef = useRef(false);
  const fadeStartTimeRef = useRef(0);
  const FADE_DURATION = 0.5;

  const rainbowMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  const moveForwardRef = useRef(false);
  const moveBackwardRef = useRef(false);
  const moveLeftRef = useRef(false);
  const moveRightRef = useRef(false);
  const velocityRef = useRef(new THREE.Vector3());
  const directionRef = useRef(new THREE.Vector3());
  const prevTimeRef = useRef(performance.now());

  const loadTexture = useCallback(
    async (url: string, panel: Panel, contentType: string): Promise<THREE.Texture | THREE.VideoTexture> => {
      const isVideo = isVideoContent(contentType, url);
      const isGif = isGifContent(contentType, url);

      if (panel.videoElement) {
        panel.videoElement.pause();
        panel.videoElement.removeAttribute('src');
        panel.videoElement = null;
      }
      if (panel.gifStopFunction) {
        panel.gifStopFunction();
        panel.gifStopFunction = null;
      }

      if (isVideo) {
        return new Promise((resolve) => {
          const videoEl = document.createElement('video');
          videoEl.playsInline = true;
          videoEl.autoplay = true;
          videoEl.loop = true;
          videoEl.muted = true;
          videoEl.style.display = 'none';
          videoEl.crossOrigin = 'anonymous';
          videoEl.src = url;
          panel.videoElement = videoEl;
          
          if ((window as any).galleryControls?.isLocked?.()) {
            videoEl.play().catch(() => {});
          }
          resolve(new THREE.VideoTexture(videoEl));
        });
      }

      if (isGif) {
        try {
          const { texture, stop } = await createGifTexture(url);
          panel.gifStopFunction = stop;
          return texture;
        } catch (e) {
          console.error('GIF fallback:', e);
        }
      }

      return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        loader.load(url, resolve, undefined, reject);
      });
    },
    [],
  );

  const updatePanelContent = useCallback(
    async (panel: Panel, source: NftSource | null) => {
      disposeTextureSafely(panel.mesh);
      panel.mesh.material = new THREE.MeshBasicMaterial({ color: 0x111111 });
      panel.metadataUrl = '';
      panel.isVideo = false;
      panel.isGif = false;

      if (panel.videoElement) {
        panel.videoElement.pause();
        panel.videoElement.src = '';
        panel.videoElement = null;
      }
      if (panel.gifStopFunction) {
        panel.gifStopFunction();
        panel.gifStopFunction = null;
      }

      if (!source || !source.contractAddress) {
        const collectionConfig = GALLERY_PANEL_CONFIG[panel.wallName];
        const showArrows = !!(collectionConfig && collectionConfig.tokenIds.length > 1);
        panel.prevArrow.visible = showArrows;
        panel.nextArrow.visible = showArrows;
        return;
      }

      try {
        const metadata: NftMetadata | null = await getCachedNftMetadata(
          source.contractAddress,
          source.tokenId,
        );

        if (!metadata) {
          const canvas = document.createElement('canvas');
          canvas.width = 256; canvas.height = 256;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#222222'; ctx.fillRect(0, 0, 256, 256);
            ctx.fillStyle = '#ff4444'; ctx.font = '24px Arial'; ctx.textAlign = 'center';
            ctx.fillText('Loading Error', 128, 128);
          }
          panel.mesh.material = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide });
        } else {
          const texture = await loadTexture(metadata.contentUrl, panel, metadata.contentType || '');
          disposeTextureSafely(panel.mesh);
          panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture });
          panel.metadataUrl = metadata.source;
          panel.isVideo = isVideoContent(metadata.contentType || '', metadata.contentUrl);
          panel.isGif = isGifContent(metadata.contentType || '', metadata.contentUrl);
        }
      } catch (error) {
        console.error(`Error loading content for ${panel.wallName}:`, error);
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#222222'; ctx.fillRect(0, 0, 256, 256);
          ctx.fillStyle = '#ff4444'; ctx.font = '24px Arial'; ctx.textAlign = 'center';
          ctx.fillText('Connection Error', 128, 128);
        }
        panel.mesh.material = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide });
      }

      const collectionConfig = GALLERY_PANEL_CONFIG[panel.wallName];
      const showArrows = !!(collectionConfig && collectionConfig.tokenIds.length > 1);
      panel.prevArrow.visible = showArrows;
      panel.nextArrow.visible = showArrows;
    },
    [loadTexture],
  );

  const manageVideoPlayback = useCallback((shouldPlay: boolean) => {
    panelsRef.current.forEach((panel) => {
      if (panel.videoElement) {
        if (shouldPlay) {
          const controlsLocked = (window as any).galleryControls?.isLocked?.() ?? false;
          if (controlsLocked) panel.videoElement.play().catch(() => {});
        } else {
          panel.videoElement.pause();
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    cameraRef.current = camera;
    camera.position.set(0, 1.6, -20);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current = renderer;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    const controls = new PointerLockControls(camera, renderer.domElement);
    controlsRef.current = controls;

    (window as any).galleryControls = {
      lockControls: () => controls.lock(),
      hasVideo: () => panelsRef.current.some((p) => p.videoElement !== null),
      isMuted: () => {
        const activeVideos = panelsRef.current.filter((p) => p.videoElement);
        return activeVideos.length === 0 || activeVideos.every((p) => p.videoElement!.muted);
      },
      toggleMute: () => {
        const activeVideos = panelsRef.current.filter((p) => p.videoElement);
        if (activeVideos.length > 0) {
          const currentlyMuted = activeVideos[0].videoElement!.muted;
          activeVideos.forEach((p) => { p.videoElement!.muted = !currentlyMuted; });
        }
      },
      isLocked: () => controls.isLocked,
      getTargetedPanel: () => currentTargetedPanel,
    };

    controls.addEventListener('lock', () => { setIsLocked(true); setInstructionsVisible(false); manageVideoPlayback(true); });
    controls.addEventListener('unlock', () => { setIsLocked(false); setInstructionsVisible(true); manageVideoPlayback(false); });

    const ROOM_SEGMENT_SIZE = 10;
    const NUM_SEGMENTS = 5;
    const ROOM_SIZE = ROOM_SEGMENT_SIZE * NUM_SEGMENTS;
    const WALL_HEIGHT = 16;
    const LOWER_WALL_HEIGHT = 8;
    const LOWER_PANEL_Y = 5.0;
    const INNER_LOWER_PANEL_Y = 4.0;
    const UPPER_PANEL_Y = 12.0;
    const WALL_THICKNESS = 0.5;
    const halfRoomSize = ROOM_SIZE / 2;
    const BOUNDARY = ROOM_SIZE / 2 - 0.5;

    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8, metalness: 0.1 });
    const rainbowMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0.0 } },
      vertexShader: rainbowVertexShader,
      fragmentShader: rainbowFragmentShader,
      side: THREE.DoubleSide,
    });
    rainbowMaterialRef.current = rainbowMaterial;

    const outerWallGeo = new THREE.BoxGeometry(ROOM_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
    ['north', 'south', 'east', 'west'].forEach(dir => {
      const wall = new THREE.Mesh(outerWallGeo, wallMaterial.clone());
      if (dir === 'north') wall.position.set(0, WALL_HEIGHT / 2, -halfRoomSize);
      else if (dir === 'south') wall.position.set(0, WALL_HEIGHT / 2, halfRoomSize);
      else {
        wall.rotation.y = Math.PI / 2;
        wall.position.set(dir === 'east' ? halfRoomSize : -halfRoomSize, WALL_HEIGHT / 2, 0);
      }
      scene.add(wall);
    });

    const crossWallGeo = new THREE.BoxGeometry(ROOM_SEGMENT_SIZE, LOWER_WALL_HEIGHT, WALL_THICKNESS);
    [-10, 10].forEach(seg => {
      [5, -5].forEach(pos => {
        const w1 = new THREE.Mesh(crossWallGeo, wallMaterial.clone());
        w1.position.set(seg, LOWER_WALL_HEIGHT / 2, pos);
        scene.add(w1);
        const w2 = new THREE.Mesh(crossWallGeo, wallMaterial.clone());
        w2.rotation.y = Math.PI / 2;
        w2.position.set(pos, LOWER_WALL_HEIGHT / 2, seg);
        scene.add(w2);
      });
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2, metalness: 0.1 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);

    const PLATFORM_Y = LOWER_WALL_HEIGHT + WALL_THICKNESS / 2 + 0.01;
    const platform = new THREE.Mesh(new THREE.BoxGeometry(30, WALL_THICKNESS, 30), wallMaterial.clone());
    platform.position.set(0, PLATFORM_Y, 0); scene.add(platform);

    const shaderPlane = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), rainbowMaterial);
    shaderPlane.rotation.x = -Math.PI / 2; shaderPlane.position.set(0, LOWER_WALL_HEIGHT, 0); scene.add(shaderPlane);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), rainbowMaterial);
    ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, WALL_HEIGHT + 0.01, 0); scene.add(ceiling);

    // Electroneum Logo Vinyls for Centers
    const textureLoader = new THREE.TextureLoader();
    const logoTexture = textureLoader.load('/electroneum-logo-symbol.svg');
    // Set anisotropy to the maximum supported by the hardware for a crisp look at angles
    logoTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    
    const vinylGeo = new THREE.PlaneGeometry(10, 10);
    const vinylMat = new THREE.MeshBasicMaterial({ 
      map: logoTexture, 
      transparent: true, 
      opacity: 0.8,
      side: THREE.DoubleSide 
    });

    // 1. Ground floor center vinyl
    const groundVinyl = new THREE.Mesh(vinylGeo, vinylMat);
    groundVinyl.rotation.x = -Math.PI / 2;
    groundVinyl.position.set(0, 0.01, 0);
    scene.add(groundVinyl);

    // 2. First floor platform center vinyl
    const platformVinyl = new THREE.Mesh(vinylGeo, vinylMat);
    platformVinyl.rotation.x = -Math.PI / 2;
    platformVinyl.position.set(0, PLATFORM_Y + WALL_THICKNESS / 2 + 0.02, 0);
    scene.add(platformVinyl);

    // Create Diamond Teleporters
    const groundBtn = createDiamondTeleporter();
    groundBtn.position.set(0, 2.0, 0); 
    groundBtn.userData.targetY = PLATFORM_Y + 1.6 + WALL_THICKNESS / 2;
    scene.add(groundBtn);

    const firstBtn = createDiamondTeleporter();
    firstBtn.position.set(0, PLATFORM_Y + WALL_THICKNESS / 2 + 2.0, 0); 
    firstBtn.userData.targetY = 1.6;
    scene.add(firstBtn);
    teleportButtonsRef.current = [groundBtn, firstBtn];

    const fadeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false });
    fadeMaterialRef.current = fadeMaterial;
    const fadeScreen = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), fadeMaterial);
    fadeScreen.renderOrder = 999; scene.add(fadeScreen);
    fadeScreenRef.current = fadeScreen;

    const performTeleport = (targetY: number) => {
      if (isTeleportingRef.current) return;
      isTeleportingRef.current = true; fadeStartTimeRef.current = performance.now();
      controls.unlock();
      setTimeout(() => { camera.position.y = targetY; controls.lock(); }, FADE_DURATION * 1000);
    };

    scene.add(new THREE.AmbientLight(0x404050, 1.0));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, WALL_HEIGHT, 0); scene.add(hemiLight);

    const gltfLoader = new GLTFLoader();

    // Load Sofa Model
    gltfLoader.load('/assets/models/sofa.glb', (gltf) => {
      let sofaMesh: THREE.Mesh | null = null;
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh && !sofaMesh) {
          const box = new THREE.Box3().setFromObject(child);
          const size = new THREE.Vector3(); box.getSize(size);
          if (size.x < 15 && size.z < 15) {
            sofaMesh = child;
          }
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
        mesh.position.set(
          - (box.min.x + size.x / 2) * scale, 
          - box.min.y * (scale * 2), 
          - (box.min.z + size.z / 2) * scale
        );

        const positions = [{ x: 0, z: 6 }, { x: 0, z: -6 }, { x: 6, z: 0 }, { x: -6, z: 0 }];
        positions.forEach(pos => {
          const instance = sofaGroup.clone();
          instance.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2, pos.z);
          instance.rotation.y = Math.atan2(-pos.x, -pos.z);
          scene.add(instance);
        });
      }
    }, undefined, (err) => {
      console.warn("Failed to load sofa model:", err);
    });

    // Load Plant Model and place at corners
    gltfLoader.load('/assets/models/plant.glb', (gltf) => {
      const plantModel = gltf.scene;
      
      // Calculate model bounding box for relative positioning
      const modelBox = new THREE.Box3().setFromObject(plantModel);
      const modelMinY = modelBox.min.y;
      const modelMaxY = modelBox.max.y;
      const modelHeight = modelMaxY - modelMinY;

      // Define Material Colors
      const terracottaColor = 0xe2725b;
      const soilColor = 0x5d4037; // Light Brown
      const stemColor = 0x3d2b1f; // Dark Brown
      const leafColor = 0x2e7d32; // Green

      // Traverse and identify meshes geometrically
      plantModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry.computeBoundingBox();
          const box = mesh.geometry.boundingBox!;
          
          // Position relative to local origin (0..1 scale)
          const meshMinY = box.min.y;
          const meshMaxY = box.max.y;
          const meshHeight = meshMaxY - meshMinY;
          const normalizedMinY = (meshMinY - modelMinY) / modelHeight;
          const normalizedMaxY = (meshMaxY - modelMinY) / modelHeight;

          // 1. Floor/Base meshes: Extremely flat and at the bottom
          if (normalizedMinY < 0.05 && meshHeight < 0.05) {
            mesh.visible = false;
            return;
          }

          // 2. Identify Pot: Lowest mesh with significant height
          if (normalizedMinY < 0.1 && normalizedMaxY < 0.4) {
             mesh.material = new THREE.MeshStandardMaterial({ color: terracottaColor, roughness: 0.9 });
          } 
          // 3. Identify Soil: Mesh slightly above the bottom inside the pot bounds
          else if (normalizedMinY > 0.1 && normalizedMinY < 0.3 && meshHeight < 0.1) {
             mesh.material = new THREE.MeshStandardMaterial({ color: soilColor, roughness: 1.0 });
          }
          // 4. Plant parts: Stems and Leaves
          else {
            // Heuristic for stem: Usually thinner (x/z bounds) than leaves or vertical
            const meshSize = new THREE.Vector3(); box.getSize(meshSize);
            const aspect = meshSize.y / Math.max(meshSize.x, meshSize.z);
            
            if (aspect > 2.0) {
              mesh.material = new THREE.MeshStandardMaterial({ color: stemColor, roughness: 0.8 });
            } else {
              mesh.material = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.6 });
            }
          }
        }
      });

      const size = new THREE.Vector3(); modelBox.getSize(size);
      const targetHeight = 2.5;
      const scale = targetHeight / size.y;
      plantModel.scale.set(scale, scale, scale);
      
      const plantGroup = new THREE.Group();
      plantGroup.add(plantModel);
      
      const corners = [
        { x: 14.2, z: 14.2 },
        { x: -14.2, z: 14.2 },
        { x: 14.2, z: -14.2 },
        { x: -14.2, z: -14.2 }
      ];

      corners.forEach(pos => {
        const plant = plantGroup.clone();
        plant.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2, pos.z);
        scene.add(plant);
      });
    }, undefined, (err) => {
      console.warn("Failed to load plant model:", err);
    });

    // Create and position Rectangular Tables within the L-shape sofa open space
    const tablePositions = [
      { x: 0, z: 4.8 },  // Sofa at (0, 6)
      { x: 0, z: -4.8 }, // Sofa at (0, -6)
      { x: 4.8, z: 0 },  // Sofa at (6, 0)
      { x: -4.8, z: 0 }  // Sofa at (-6, 0)
    ];

    tablePositions.forEach(pos => {
      const table = createProceduralTable();
      table.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2, pos.z);
      // Rotate to follow sofa orientation
      table.rotation.y = Math.atan2(-pos.x, -pos.z);
      
      // SHIFT LATERALLY: Move the table half its width (2.4 / 2 = 1.2) away from the daybed side.
      // We use translateX to move it locally along its long axis without affecting distance to seats.
      table.translateX(1.2);
      
      scene.add(table);
    });

    const panelGeo = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15); arrowShape.lineTo(0.3, 0); arrowShape.lineTo(0, -0.15);
    const arrowGeo = new THREE.ShapeGeometry(arrowShape);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide });

    const ARROW_DEPTH_OFFSET = 0.15 + WALL_THICKNESS / 2;
    const ARROW_PANEL_OFFSET = 3.2;

    const dynamicPanelConfigs: any[] = [];
    for (let i = 0; i <= 4; i++) {
      ['north-wall', 'south-wall', 'east-wall', 'west-wall'].forEach(base => {
        const seg = (i - 2) * 10;
        [{ y: LOWER_PANEL_Y, s: '-ground' }, { y: UPPER_PANEL_Y, s: '-first' }].forEach(tier => {
          let x = 0, z = 0, rotY = 0, dx = 0, dz = 0;
          if (base === 'north-wall') { x = seg; z = -halfRoomSize; rotY = 0; dz = ARROW_DEPTH_OFFSET; }
          else if (base === 'south-wall') { x = seg; z = halfRoomSize; rotY = Math.PI; dz = -ARROW_DEPTH_OFFSET; }
          else if (base === 'east-wall') { x = halfRoomSize; z = seg; rotY = -Math.PI / 2; dx = -ARROW_DEPTH_OFFSET; }
          else if (base === 'west-wall') { x = -halfRoomSize; z = seg; rotY = Math.PI / 2; dx = ARROW_DEPTH_OFFSET; }
          dynamicPanelConfigs.push({ wallName: `${base}-${i}${tier.s}`, pos: [x + dx, tier.y, z + dz], rot: [0, rotY, 0] });
        });
      });
    }

    [-10, 10].forEach((seg, i) => {
      const pos = 5 + ARROW_DEPTH_OFFSET;
      dynamicPanelConfigs.push({ wallName: `north-inner-wall-outer-${i}`, pos: [seg, INNER_LOWER_PANEL_Y, -pos], rot: [0, Math.PI, 0] });
      dynamicPanelConfigs.push({ wallName: `north-inner-wall-inner-${i}`, pos: [seg, INNER_LOWER_PANEL_Y, -5 + ARROW_DEPTH_OFFSET], rot: [0, 0, 0] });
      dynamicPanelConfigs.push({ wallName: `south-inner-wall-outer-${i}`, pos: [seg, INNER_LOWER_PANEL_Y, pos], rot: [0, 0, 0] });
      dynamicPanelConfigs.push({ wallName: `south-inner-wall-inner-${i}`, pos: [seg, INNER_LOWER_PANEL_Y, 5 - ARROW_DEPTH_OFFSET], rot: [0, Math.PI, 0] });
      dynamicPanelConfigs.push({ wallName: `east-inner-wall-outer-${i}`, pos: [pos, INNER_LOWER_PANEL_Y, seg], rot: [0, Math.PI / 2, 0] });
      dynamicPanelConfigs.push({ wallName: `east-inner-wall-inner-${i}`, pos: [5 - ARROW_DEPTH_OFFSET, INNER_LOWER_PANEL_Y, seg], rot: [0, -Math.PI / 2, 0] });
      dynamicPanelConfigs.push({ wallName: `west-inner-wall-outer-${i}`, pos: [-pos, INNER_LOWER_PANEL_Y, seg], rot: [0, -Math.PI / 2, 0] });
      dynamicPanelConfigs.push({ wallName: `west-inner-wall-inner-${i}`, pos: [-5 + ARROW_DEPTH_OFFSET, INNER_LOWER_PANEL_Y, seg], rot: [0, Math.PI / 2, 0] });
    });

    panelsRef.current = [];
    dynamicPanelConfigs.forEach(cfg => {
      const mesh = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
      mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      mesh.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
      scene.add(mesh);

      const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(cfg.rot[0], cfg.rot[1], cfg.rot[2]));
      const prevArrow = new THREE.Mesh(arrowGeo, arrowMat.clone());
      prevArrow.rotation.y = cfg.rot[1] + Math.PI;
      prevArrow.position.copy(mesh.position).addScaledVector(rightVector, -ARROW_PANEL_OFFSET);
      prevArrow.userData = { isArrow: true, direction: 'prev' }; scene.add(prevArrow);

      const nextArrow = new THREE.Mesh(arrowGeo, arrowMat.clone());
      nextArrow.rotation.y = cfg.rot[1];
      nextArrow.position.copy(mesh.position).addScaledVector(rightVector, ARROW_PANEL_OFFSET);
      nextArrow.userData = { isArrow: true, direction: 'next' }; scene.add(nextArrow);

      panelsRef.current.push({ mesh, wallName: cfg.wallName, metadataUrl: '', isVideo: false, isGif: false, prevArrow, nextArrow, videoElement: null, gifStopFunction: null });
    });

    const raycaster = new THREE.Raycaster();
    const onClick = () => {
      if (!controls.isLocked) return;
      if (currentTargetedButton?.userData?.isTeleportButton) return performTeleport(currentTargetedButton.userData.targetY);
      if (currentTargetedArrow) {
        const panel = panelsRef.current.find(p => p.prevArrow === currentTargetedArrow || p.nextArrow === currentTargetedArrow);
        if (panel && updatePanelIndex(panel.wallName, currentTargetedArrow.userData.direction)) updatePanelContent(panel, getCurrentNftSource(panel.wallName));
        return;
      }
      if (currentTargetedPanel?.metadataUrl) {
        const cfg = GALLERY_PANEL_CONFIG[currentTargetedPanel.wallName];
        setMarketBrowserState({ open: true, collection: cfg.contractAddress, tokenId: cfg.tokenIds[cfg.currentIndex] });
      }
    };
    renderer.domElement.addEventListener('click', onClick);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') moveForwardRef.current = true;
      if (e.code === 'KeyA') moveLeftRef.current = true;
      if (e.code === 'KeyS') moveBackwardRef.current = true;
      if (e.code === 'KeyD') moveRightRef.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') moveForwardRef.current = false;
      if (e.code === 'KeyA') moveLeftRef.current = false;
      if (e.code === 'KeyS') moveBackwardRef.current = false;
      if (e.code === 'KeyD') moveRightRef.current = false;
    };
    document.addEventListener('keydown', onKeyDown); document.addEventListener('keyup', onKeyUp);

    let stopAnim = false;
    const initLoad = async () => {
      await initializeGalleryConfig();
      for (let i = 0; i < panelsRef.current.length; i++) {
        if (stopAnim) break;
        const p = panelsRef.current[i];
        updatePanelContent(p, getCurrentNftSource(p.wallName));
        if (i % 2 === 0) {
          const jitter = Math.random() * 200;
          await new Promise(r => setTimeout(r, 250 + jitter));
        }
      }
    };
    initLoad();

    const animate = () => {
      if (stopAnim) return;
      const time = performance.now();
      const delta = (time - prevTimeRef.current) / 1000;
      prevTimeRef.current = time;

      if (controls.isLocked) {
        const vel = velocityRef.current; const dir = directionRef.current;
        dir.z = Number(moveForwardRef.current) - Number(moveBackwardRef.current);
        dir.x = Number(moveRightRef.current) - Number(moveLeftRef.current);
        dir.normalize();
        if (moveForwardRef.current || moveBackwardRef.current) vel.z -= dir.z * 20.0 * delta;
        if (moveLeftRef.current || moveRightRef.current) vel.x -= dir.x * 20.0 * delta;
        vel.x -= vel.x * 10.0 * delta; vel.z -= vel.z * 10.0 * delta;
        controls.moveRight(-vel.x * delta); controls.moveForward(-vel.z * delta);
        camera.position.x = Math.max(-BOUNDARY, Math.min(BOUNDARY, camera.position.x));
        camera.position.z = Math.max(-BOUNDARY, Math.min(BOUNDARY, camera.position.z));
      }

      if (rainbowMaterialRef.current) rainbowMaterialRef.current.uniforms.time.value += delta;
      
      // Animate Teleporters
      teleportButtonsRef.current.forEach(btn => {
        const { electron1, electron2, diamond } = btn.userData;
        if (diamond) {
          diamond.rotation.y += delta * 0.5;
          diamond.position.y = Math.sin(time * 0.002) * 0.1;
        }
        if (electron1) electron1.rotation.y += delta * 2;
        if (electron2) electron2.rotation.y -= delta * 1.5;
      });

      if (fadeScreenRef.current) { fadeScreenRef.current.position.copy(camera.position); fadeScreenRef.current.quaternion.copy(camera.quaternion); }
      if (isTeleportingRef.current && fadeMaterialRef.current) {
        const elapsed = (time - fadeStartTimeRef.current) / 1000;
        if (elapsed < FADE_DURATION) fadeMaterialRef.current.opacity = elapsed / FADE_DURATION;
        else if (elapsed < 2 * FADE_DURATION) fadeMaterialRef.current.opacity = 1 - (elapsed - FADE_DURATION) / FADE_DURATION;
        else { fadeMaterialRef.current.opacity = 0; isTeleportingRef.current = false; }
      }

      if (camera && raycaster) {
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        
        // Raycast against all objects in the scene to check for occlusion.
        const allPotentialObjects = scene.children.filter(obj => obj !== fadeScreenRef.current);
        const hits = raycaster.intersectObjects(allPotentialObjects, true);
        
        currentTargetedPanel = null; currentTargetedArrow = null; currentTargetedButton = null;
        panelsRef.current.forEach(p => { (p.prevArrow.material as any).color.setHex(0xcccccc); (p.nextArrow.material as any).color.setHex(0xcccccc); });
        
        // Reset diamond emissive
        teleportButtonsRef.current.forEach(b => {
           const diamond = b.userData.diamond as THREE.Mesh;
           const mat = diamond.material as THREE.MeshPhysicalMaterial;
           mat.emissiveIntensity = 0.2;
        });
        
        if (hits.length > 0) {
          const hit = hits[0].object as THREE.Mesh;
          
          // Traverse up to find teleport button group
          let parent = hit.parent;
          let teleporter: THREE.Group | null = null;
          if (hit.parent?.userData?.isTeleportButton) teleporter = hit.parent as THREE.Group;
          else if (hit.parent?.parent?.userData?.isTeleportButton) teleporter = hit.parent.parent as THREE.Group;

          if (teleporter) {
            currentTargetedButton = teleporter;
            const diamond = teleporter.userData.diamond as THREE.Mesh;
            const mat = diamond.material as THREE.MeshPhysicalMaterial;
            mat.emissiveIntensity = 1.0;
          } else {
            const p = panelsRef.current.find(p => p.mesh === hit || p.prevArrow === hit || p.nextArrow === hit);
            if (p) {
              if (hit === p.mesh) currentTargetedPanel = p;
              else { currentTargetedArrow = hit; (hit.material as any).color.setHex(0x00ff00); }
            }
          }
        }
      }

      renderer.render(scene, camera); requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
    window.addEventListener('resize', onResize);

    return () => {
      stopAnim = true; document.removeEventListener('keydown', onKeyDown); document.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('click', onClick); window.removeEventListener('resize', onResize);
      (window as any).galleryControls = undefined;
      panelsRef.current.forEach(p => { disposeTextureSafely(p.mesh); p.videoElement?.pause(); p.gifStopFunction?.(); });
      renderer.dispose(); mountRef.current?.removeChild(renderer.domElement);
    };
  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback]);

  return (
    <>
      <div ref={mountRef} className="w-full h-full" />
      {marketBrowserState.open && (
        <MarketBrowserRefined collection={marketBrowserState.collection || ''} tokenId={marketBrowserState.tokenId || ''} open={marketBrowserState.open} onClose={() => setMarketBrowserState({ open: false })} />
      )}
    </>
  );
};

export default NftGallery;