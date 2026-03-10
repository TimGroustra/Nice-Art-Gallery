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
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Footprints, MapPin } from 'lucide-react';

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

interface UnifiedGalleryProps {
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

const UnifiedGallery: React.FC<UnifiedGalleryProps> = ({ onLoadingProgress, onLoadingComplete }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const teleportButtonsRef = useRef<THREE.Group[]>([]);
  const fadeMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const fadeScreenRef = useRef<THREE.Mesh | null>(null);
  
  const isMobile = useIsMobile();
  const [isStarted, setIsStarted] = useState(false);
  const [isWalking, setIsWalking] = useState(false);
  const [instructionsVisible, setInstructionsVisible] = useState(!isMobile);
  const [marketBrowserState, setMarketBrowserState] = useState({
    open: false,
    collection: '',
    tokenId: '',
  });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

  const isTeleportingRef = useRef(false);
  const fadeStartTimeRef = useRef(0);
  const FADE_DURATION = 0.5;

  // Control state
  const moveForwardRef = useRef(false);
  const moveBackwardRef = useRef(false);
  const moveLeftRef = useRef(false);
  const moveRightRef = useRef(false);
  const velocityRef = useRef(new THREE.Vector3());
  const directionRef = useRef(new THREE.Vector3());
  const prevTimeRef = useRef(performance.now());
  
  // Mobile rotation state
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

  const manageVideoPlayback = useCallback((shouldPlay: boolean) => {
    panelsRef.current.forEach((panel) => {
      if (panel.videoElement) {
        if (shouldPlay) {
          const playPromise = (window as any).galleryControls?.isLocked?.() ? 
            () => panel.videoElement?.play().catch(() => {}) : 
            () => {};
          playPromise();
        } else {
          panel.videoElement?.pause();
        }
      }
    });
  }, []);

  const performTeleport = (targetY: number) => {
    if (isTeleportingRef.current) return;
    isTeleportingRef.current = true;
    fadeStartTimeRef.current = performance.now();

    if (isMobile) {
      setTimeout(() => {
        if (cameraRef.current) {
          cameraRef.current.position.y = targetY;
        }
      }, FADE_DURATION * 1000);
    } else {
      controlsRef.current?.unlock();
      setTimeout(() => { 
        cameraRef.current!.position.y = targetY; 
        controlsRef.current?.lock(); 
      }, FADE_DURATION * 1000);
    }
  };

  const checkCollision = useCallback((pos: THREE.Vector3) => {
    const ROOM_SIZE = 50;
    const BOUNDARY = ROOM_SIZE / 2 - 1.0;
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
        if (Math.abs(pos.x - innerBoundary) < wallThick && Math.abs(pos.z - cp) < wallHalfLen) return true;
        if (Math.abs(pos.x - (-innerBoundary)) < wallThick && Math.abs(pos.z - cp) < wallHalfLen) return true;
      }
    }
    
    return false;
  }, []);

  const handleStart = useCallback(() => {
    setIsStarted(true);
    setInstructionsVisible(false);
    
    if (isMobile) {
      const bgm = (window as any).musicControls;
      if (bgm && bgm.play) bgm.play();
    } else {
      controlsRef.current?.lock();
      manageVideoPlayback(true);
    }
  }, [isMobile, manageVideoPlayback]);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    cameraRef.current = camera;
    
    // Set initial position based on device
    if (isMobile) {
      camera.position.set(0, 1.6, 20);
      camera.rotation.order = 'YXZ';
    } else {
      camera.position.set(0, 1.6, -20);
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current = renderer;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // Setup controls based on device
    let controls: PointerLockControls | null = null;
    if (!isMobile) {
      controls = new PointerLockControls(camera, renderer.domElement);
      controlsRef.current = controls;
      
      (window as any).galleryControls = {
        lockControls: () => controls!.lock(),
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
        isLocked: () => controls!.isLocked,
        getTargetedPanel: () => null, // Not needed for unified version
      };

      controls.addEventListener('lock', () => { 
        setInstructionsVisible(false); 
        manageVideoPlayback(true); 
      });
      controls.addEventListener('unlock', () => { 
        setInstructionsVisible(true); 
        manageVideoPlayback(false); 
      });
    }

    // Gallery setup code (shared between mobile/desktop)
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
    const BOUNDARY = ROOM_SIZE / 2 - 1.0;

    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8, metalness: 0.1 });
    const rainbowMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0.0 } },
      vertexShader: rainbowVertexShader,
      fragmentShader: rainbowFragmentShader,
      side: THREE.DoubleSide,
    });

    // Setup walls, floors, platform, etc. (shared code from both versions)
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

    // Electroneum Logo Vinyls
    const textureLoader = new THREE.TextureLoader();
    const logoTexture = textureLoader.load('/electroneum-logo-symbol.svg');
    logoTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    
    const vinylGeo = new THREE.PlaneGeometry(10, 10);
    const vinylMat = new THREE.MeshBasicMaterial({ 
      map: logoTexture, 
      transparent: true, 
      opacity: 0.8,
      side: THREE.DoubleSide 
    });

    const groundVinyl = new THREE.Mesh(vinylGeo, vinylMat);
    groundVinyl.rotation.x = -Math.PI / 2;
    groundVinyl.position.set(0, 0.01, 0);
    scene.add(groundVinyl);

    // Diamond Teleporters
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

    scene.add(new THREE.AmbientLight(0x404050, 1.0));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, WALL_HEIGHT, 0); scene.add(hemiLight);

    // Furniture loading (sofa, plants, tables, etc.)
    const gltfLoader = new GLTFLoader();
    
    // Sofa setup
    gltfLoader.load('/assets/models/sofa.glb', (gltf) => {
      let sofaMesh: THREE.Mesh | null = null;
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh && !sofaMesh) {
          sofaMesh = child;
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

        const positions = [{ x: 0, z: 11 }, { x: 0, z: -11 }, { x: 11, z: 0 }, { x: -11, z: 0 }];
        positions.forEach(pos => {
          const instance = sofaGroup.clone();
          instance.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2, pos.z);
          instance.rotation.y = Math.atan2(-pos.x, -pos.z);
          scene.add(instance);
        });
      }
    });

    // Plant setup
    gltfLoader.load('/assets/models/plant.glb', (gltf) => {
      const plantModel = gltf.scene;
      
      const modelBox = new THREE.Box3().setFromObject(plantModel);
      const modelMinY = modelBox.min.y;
      const modelHeight = modelBox.max.y - modelMinY;

      plantModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry.computeBoundingBox();
          const box = mesh.geometry.boundingBox!;
          const normalizedMinY = (box.min.y - modelMinY) / modelHeight;
          mesh.material = new THREE.MeshStandardMaterial({ 
            color: normalizedMinY < 0.4 ? 0xe2725b : 0x2e7d32,
            roughness: 0.8 
          });
        }
      });

      const size = new THREE.Vector3(); modelBox.getSize(size);
      const targetHeight = 2.5;
      const scale = targetHeight / size.y;
      plantModel.scale.set(scale, scale, scale);
      
      const plantGroup = new THREE.Group();
      plantGroup.add(plantModel);
      
      const corners = [{ x: 14.2, z: 14.2 }, { x: -14.2, z: 14.2 }, { x: 14.2, z: -14.2 }, { x: -14.2, z: -14.2 }];
      corners.forEach(pos => {
        const plant = plantGroup.clone();
        plant.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2, pos.z);
        scene.add(plant);
      });
    });

    // Table setup
    const tablePositions = [{ x: 0, z: 9.8 }, { x: 0, z: -9.8 }, { x: 9.8, z: 0 }, { x: -9.8, z: 0 }];
    tablePositions.forEach(pos => {
      const table = createProceduralTable();
      table.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2, pos.z);
      table.rotation.y = Math.atan2(-pos.x, -pos.z);
      table.translateX(0.9);
      scene.add(table);
    });

    // Panel setup
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

    // Input handling
    const onClick = (event: MouseEvent | TouchEvent) => {
      if (!isStarted) {
        handleStart();
        return;
      }

      if (!isMobile && controls && !controls.isLocked) return;

      const rayTarget = isMobile ? 
        { clientX: (event as TouchEvent).touches?.[0]?.clientX, clientY: (event as TouchEvent).touches?.[0]?.clientY } :
        { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 };

      if (!rayTarget.clientX) return;

      const x = (rayTarget.clientX / window.innerWidth) * 2 - 1;
      const y = -(rayTarget.clientY / window.innerHeight) * 2 + 1;
      raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), camera);
      
      const allObjects = scene.children.filter(obj => obj !== fadeScreenRef.current);
      const intersects = raycasterRef.current.intersectObjects(allObjects, true);
      
      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        
        // Teleporter handling
        let teleporter: THREE.Group | null = null;
        if (hit.parent?.userData?.isTeleportButton) teleporter = hit.parent as THREE.Group;
        else if (hit.parent?.parent?.userData?.isTeleportButton) teleporter = hit.parent.parent as THREE.Group;

        if (teleporter) {
          performTeleport(teleporter.userData.targetY);
          return;
        }

        // Panel interaction
        const panel = panelsRef.current.find(p => p.mesh === hit || p.prevArrow === hit || p.nextArrow === hit);
        if (panel) {
          if (hit === p.prevArrow || hit === p.nextArrow) {
            if (updatePanelIndex(panel.wallName, hit === p.nextArrow ? 'next' : 'prev')) 
              updatePanelContent(panel, getCurrentNftSource(panel.wallName));
          } else if (panel.metadataUrl) {
            const cfg = GALLERY_PANEL_CONFIG[panel.wallName];
            setMarketBrowserState({ open: true, collection: cfg.contractAddress, tokenId: cfg.tokenIds[cfg.currentIndex] });
          }
        }
      }
    };

    // Input event listeners
    const setupInputListeners = () => {
      if (isMobile) {
        const container = mountRef.current!;
        container.addEventListener('touchstart', (e) => {
          isDraggingRef.current = false;
          touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        });
        
        container.addEventListener('touchmove', (e) => {
          isDraggingRef.current = true;
          const deltaX = e.touches[0].clientX - touchStartRef.current.x;
          const deltaY = e.touches[0].clientY - touchStartRef.current.y;
          rotationRef.current.yaw += deltaX * 0.005;
          rotationRef.current.pitch += deltaY * 0.005;
          rotationRef.current.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, rotationRef.current.pitch));
          touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        });
        
        container.addEventListener('touchend', onClick);
      } else {
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
        
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        
        return () => {
          document.removeEventListener('keydown', onKeyDown);
          document.removeEventListener('keyup', onKeyUp);
        };
      }
      
      return () => {}; // No cleanup for mobile touch events
    };

    const cleanupInputs = setupInputListeners();

    // Loading initialization
    let stopLoad = false;
    const initLoad = async () => {
      await initializeGalleryConfig();
      const total = panelsRef.current.length;
      for (let i = 0; i < total; i++) {
        if (stopLoad) break;
        const p = panelsRef.current[i];
        await updatePanelContent(p, getCurrentNftSource(p.wallName));
        
        if (onLoadingProgress) {
          onLoadingProgress((i + 1) / total * 100);
        }

        if (i % 2 === 0) {
          await new Promise(r => setTimeout(r, 50));
        }
      }
      
      if (!stopLoad && onLoadingComplete) {
        onLoadingComplete();
      }
    };
    initLoad();

    // Animation loop
    const animate = () => {
      if (stopLoad) return;
      const time = performance.now();
      const delta = (time - prevTimeRef.current) / 1000;
      prevTimeRef.current = time;

      // Update camera based on device type
      if (isMobile && isStarted) {
        if (camera) {
          camera.rotation.set(rotationRef.current.pitch, rotationRef.current.yaw, 0);
          if (isWalkingRef.current && !isTeleportingRef.current) {
            const moveSpeed = 3.4;
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            forward.y = 0;
            forward.normalize();
            const nextX = new THREE.Vector3(camera.position.x + forward.x * moveSpeed * delta, camera.position.y, camera.position.z);
            if (!checkCollision(nextX)) camera.position.x = nextX.x;
            const nextZ = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z + forward.z * moveSpeed * delta);
            if (!checkCollision(nextZ)) camera.position.z = nextZ.z;
          }
        }
      } else if (!isMobile && controls?.isLocked) {
        const vel = velocityRef.current; 
        const dir = directionRef.current;
        dir.z = Number(moveForwardRef.current) - Number(moveBackwardRef.current);
        dir.x = Number(moveRightRef.current) - Number(moveLeftRef.current);
        dir.normalize();
        
        if (moveForwardRef.current || moveBackwardRef.current) vel.z -= dir.z * 20.0 * delta;
        if (moveLeftRef.current || moveRightRef.current) vel.x -= dir.x * 20.0 * delta;
        
        vel.x -= vel.x * 10.0 * delta; 
        vel.z -= vel.z * 10.0 * delta;
        
        controls.moveRight(-vel.x * delta); 
        controls.moveForward(-vel.z * delta);
        
        camera.position.x = Math.max(-BOUNDARY, Math.min(BOUNDARY, camera.position.x));
        camera.position.z = Math.max(-BOUNDARY, Math.min(BOUNDARY, camera.position.z));
      }

      // Update shared animations
      if (rainbowMaterial) rainbowMaterial.uniforms.time.value += delta;
      
      teleportButtonsRef.current.forEach(btn => {
        const { electron1, electron2, diamond } = btn.userData;
        if (diamond) {
          diamond.rotation.y += delta * 0.5;
          diamond.position.y = Math.sin(time * 0.002) * 0.1;
        }
        if (electron1) electron1.rotation.y += delta * 2;
        if (electron2) electron2.rotation.y -= delta * 1.5;
      });

      if (fadeScreenRef.current) { 
        fadeScreenRef.current.position.copy(camera.position); 
        fadeScreenRef.current.quaternion.copy(camera.quaternion); 
      }
      
      if (isTeleportingRef.current && fadeMaterialRef.current) {
        const elapsed = (time - fadeStartTimeRef.current) / 1000;
        if (elapsed < FADE_DURATION) fadeMaterialRef.current.opacity = elapsed / FADE_DURATION;
        else if (elapsed < 2 * FADE_DURATION) fadeMaterialRef.current.opacity = 1 - (elapsed - FADE_DURATION) / FADE_DURATION;
        else { fadeMaterialRef.current.opacity = 0; isTeleportingRef.current = false; }
      }

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      stopLoad = true;
      cleanupInputs();
      window.removeEventListener('resize', onResize);
      panelsRef.current.forEach(p => { 
        disposeTextureSafely(p.mesh); 
        p.videoElement?.pause(); 
        p.gifStopFunction?.(); 
      });
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
      (window as any).galleryControls = undefined;
    };
  }, [isMobile, handleStart, updatePanelContent, checkCollision, onLoadingProgress, onLoadingComplete]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black touch-none">
      <div ref={mountRef} className="w-full h-full touch-none" />
      
      {/* Start Overlay (Mobile) */}
      {isMobile && !isStarted && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-50 cursor-pointer" onClick={handleStart}>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-2xl text-center max-w-xs animate-in fade-in zoom-in duration-300">
            <h2 className="text-2xl font-bold text-white mb-4">Nice Art Gallery</h2>
            <p className="text-white/70 mb-6">Drag to look around, tap to interact</p>
            <div className="bg-primary text-primary-foreground px-8 py-3 rounded-full font-bold">Enter Gallery</div>
          </div>
        </div>
      )}

      {/* Instructions Overlay (Desktop) */}
      {!isMobile && instructionsVisible && (
        <div className="absolute top-4 left-4 p-4 bg-black/50 text-white rounded-md cursor-pointer z-10" onClick={handleStart}>
          Click to enter gallery — WASD to move, mouse to look
        </div>
      )}

      {/* Mobile UI Elements */}
      {isMobile && isStarted && (
        <>
          <div className="fixed bottom-4 left-4 right-4 text-white text-center pointer-events-none bg-black/40 p-2 rounded text-xs z-20">
            Drag to look around • Tap panels to interact
          </div>
          <button 
            onClick={() => setIsWalking(!isWalking)} 
            className={`fixed bottom-16 right-6 p-4 rounded-full transition-all z-30 shadow-lg ${isWalking ? 'bg-primary text-primary-foreground scale-110' : 'bg-white/10 text-white backdrop-blur-md border border-white/20'}`}
          >
            <Footprints className={`h-8 w-8 ${isWalking ? 'animate-pulse' : ''}`} />
          </button>
        </>
      )}

      {/* Crosshair (Desktop) */}
      {!isMobile && isStarted && !instructionsVisible && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none z-20">
          <div className="absolute top-1/2 left-0 w-full h-px bg-white/50 -translate-y-1/2"></div>
          <div className="absolute top-0 left-1/2 w-px h-full bg-white/50 -translate-x-1/2"></div>
        </div>
      )}

      {/* Market Browser */}
      {marketBrowserState.open && (
        <MarketBrowserRefined 
          collection={marketBrowserState.collection} 
          tokenId={marketBrowserState.tokenId} 
          open={marketBrowserState.open} 
          onClose={() => setMarketBrowserState({ open: false, collection: '', tokenId: '' })} 
        />
      )}
    </div>
  );
};

export default UnifiedGallery;