import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
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

// Initialize RectAreaLightUniformsLib immediately upon module load
RectAreaLightUniformsLib.init();

// Constants for geometry
const PANEL_WIDTH = 6;
const PANEL_HEIGHT = 6;

// Define types for the panel objects
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

// Global state for UI interaction
let currentTargetedPanel: Panel | null = null;
let currentTargetedArrow: THREE.Mesh | null = null;
let currentTargetedButton: THREE.Mesh | null = null;

// --- GLSL Shader Code for Rainbow Under-Platform Plane ---
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
    float sat = 0.9;
    float val = 0.9;

    vec3 color = hsv2rgb(vec3(hue, sat, val));

    vec2 uv = vUv * 2.0 - 1.0;
    float vignette = smoothstep(1.4, 0.2, length(uv));
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Helpers for media
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
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const wallMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const [isLocked, setIsLocked] = useState(false);
  const [marketBrowserState, setMarketBrowserState] = useState<{
    open: boolean;
    collection?: string;
    tokenId?: string | number;
  }>({ open: false });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);

  const isTeleportingRef = useRef(false);
  const fadeStartTimeRef = useRef(0);
  const FADE_DURATION = 0.5;

  const rainbowMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

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
        panel.gifStopFunction = null;
      }

      if (isVideo) {
        return new Promise((resolve) => {
          let videoEl = panel.videoElement;
          if (!videoEl) {
            videoEl = document.createElement('video');
            videoEl.playsInline = true;
            videoEl.autoplay = true;
            videoEl.loop = true;
            videoEl.muted = true;
            videoEl.style.display = 'none';
            videoEl.crossOrigin = 'anonymous';
            panel.videoElement = videoEl;
          }

          videoEl.src = url;
          videoEl.load();

          if ((window as any).galleryControls?.isLocked?.()) {
            videoEl.play().catch((e) => console.warn('Video playback prevented:', e));
          }

          const videoTexture = new THREE.VideoTexture(videoEl);
          videoTexture.minFilter = THREE.LinearFilter;
          videoTexture.magFilter = THREE.LinearFilter;
          resolve(videoTexture);
        });
      }

      if (isGif) {
        try {
          const { texture, stop } = await createGifTexture(url);
          panel.gifStopFunction = stop;
          return texture;
        } catch (error) {
          console.error('Failed to load animated GIF, falling back to static image load:', error);
        }
      }

      return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        loader.load(
          url,
          (texture) => resolve(texture),
          undefined,
          (error) => {
            console.error('Error loading texture:', url, error);
            showError(`Failed to load image: ${url.substring(0, 50)}...`);
            reject(error);
          },
        );
      });
    },
    [],
  );

  const updatePanelContent = useCallback(
    async (panel: Panel, source: NftSource | null) => {
      disposeTextureSafely(panel.mesh);
      panel.mesh.material = new THREE.MeshBasicMaterial({ color: 0x333333 });
      panel.metadataUrl = '';
      panel.isVideo = false;
      panel.isGif = false;

      if (panel.videoElement) {
        panel.videoElement.pause();
        panel.videoElement.removeAttribute('src');
        panel.videoElement = null;
      }

      if (panel.gifStopFunction) {
        panel.gifStopFunction();
        panel.gifStopFunction = null;
      }

      if (!source || source.contractAddress === '') {
        const collectionConfig = GALLERY_PANEL_CONFIG[panel.wallName];
        const showArrows = collectionConfig && collectionConfig.tokenIds.length > 1;
        panel.prevArrow.visible = showArrows;
        panel.nextArrow.visible = showArrows;
        return;
      }

      const metadata: NftMetadata | null = await getCachedNftMetadata(source.contractAddress, source.tokenId);

      if (!metadata) {
        disposeTextureSafely(panel.mesh);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
          canvas.width = 256;
          canvas.height = 256;
          context.fillStyle = '#333333';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = '#ff0000';
          context.font = '20px Arial';
          context.textAlign = 'center';
          context.fillText('NFT Unavailable', canvas.width / 2, canvas.height / 2);
        }
        const errorTexture = new THREE.CanvasTexture(canvas);
        panel.mesh.material = new THREE.MeshBasicMaterial({ map: errorTexture, side: THREE.DoubleSide });
        return;
      }

      try {
        const contentUrl = metadata.contentUrl;
        const isVideo = isVideoContent(metadata.contentType, contentUrl);
        const isGif = isGifContent(metadata.contentType, contentUrl);

        const texture = await loadTexture(contentUrl, panel, metadata.contentType);

        disposeTextureSafely(panel.mesh);
        panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture });

        panel.metadataUrl = metadata.source;
        panel.isVideo = isVideo;
        panel.isGif = isGif;

        showSuccess(
          isVideo
            ? `Loaded video NFT: ${metadata.title}`
            : isGif
            ? `Loaded animated GIF: ${metadata.title}`
            : `Loaded image NFT: ${metadata.title}`,
        );
      } catch (error) {
        console.error(`Error loading NFT content for ${panel.wallName}:`, error);
        showError(`Failed to load NFT content for ${panel.wallName}.`);
      }

      const collectionConfig = GALLERY_PANEL_CONFIG[panel.wallName];
      const showArrows = collectionConfig && collectionConfig.tokenIds.length > 1;
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
          if (controlsLocked) {
            panel.videoElement.play().catch((e) => console.warn('Video playback prevented:', e));
          }
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
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    const controls = new PointerLockControls(camera, renderer.domElement);
    controlsRef.current = controls;

    (window as any).galleryControls = {
      lockControls: () => controls.lock(),
      hasVideo: () => panelsRef.current.some((p) => p.videoElement !== null),
      isMuted: () => {
        const activeVideos = panelsRef.current.filter((p) => p.videoElement);
        if (activeVideos.length === 0) return true;
        return activeVideos.every((p) => p.videoElement!.muted);
      },
      toggleMute: () => {
        const activeVideos = panelsRef.current.filter((p) => p.videoElement);
        if (activeVideos.length > 0) {
          const currentlyMuted = activeVideos[0].videoElement!.muted;
          activeVideos.forEach((p) => {
            p.videoElement!.muted = !currentlyMuted;
          });
        }
      },
      isLocked: () => controls.isLocked,
      getTargetedPanel: () => currentTargetedPanel,
    };

    controls.addEventListener('lock', () => {
      setIsLocked(true);
      setInstructionsVisible(false);
      manageVideoPlayback(true);
    });

    controls.addEventListener('unlock', () => {
      setIsLocked(false);
      setInstructionsVisible(true);
      manageVideoPlayback(false);
    });

    // Room constants
    const ROOM_SEGMENT_SIZE = 10;
    const NUM_SEGMENTS = 5;
    const ROOM_SIZE = ROOM_SEGMENT_SIZE * NUM_SEGMENTS;
    const WALL_HEIGHT = 16;
    const LOWER_WALL_HEIGHT = 8;

    // Raised ground-floor panel height for OUTER walls
    const LOWER_PANEL_Y = 5.0;
    // Centered lower panel height for INNER 30x30 / center walls
    const INNER_LOWER_PANEL_Y = 4.0;

    const UPPER_PANEL_Y = 12.0;
    const BOUNDARY = ROOM_SIZE / 2 - 0.5;
    const halfRoomSize = ROOM_SIZE / 2;
    const segmentGeometry = new THREE.PlaneGeometry(ROOM_SEGMENT_SIZE, ROOM_SEGMENT_SIZE);

    const WALL_THICKNESS = 0.5;
    const INNER_WALL_BOUNDARY = ROOM_SIZE / 2;

    const wallSegmentGeometry = new THREE.BoxGeometry(ROOM_SEGMENT_SIZE, LOWER_WALL_HEIGHT, WALL_THICKNESS);
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.8,
      metalness: 0.1,
    });

    // Rainbow underside material
    const rainbowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
      },
      vertexShader: rainbowVertexShader,
      fragmentShader: rainbowFragmentShader,
      side: THREE.DoubleSide,
      transparent: false,
    });
    rainbowMaterialRef.current = rainbowMaterial;

    const outerWallGeometry = new THREE.BoxGeometry(ROOM_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
    const halfWallHeight = WALL_HEIGHT / 2;

    const northWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    northWall.position.set(0, halfWallHeight, -halfRoomSize);
    scene.add(northWall);

    const southWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    southWall.position.set(0, halfWallHeight, halfRoomSize);
    scene.add(southWall);

    const eastWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    eastWall.rotation.y = Math.PI / 2;
    eastWall.position.set(halfRoomSize, halfWallHeight, 0);
    scene.add(eastWall);

    const westWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    westWall.rotation.y = Math.PI / 2;
    westWall.position.set(-halfRoomSize, halfWallHeight, 0);
    scene.add(westWall);

    const halfLowerWallHeight = LOWER_WALL_HEIGHT / 2;
    const CROSS_WALL_BOUNDARY = 5;
    const crossWallSegments = [-10, 10];

    crossWallSegments.forEach((segmentCenter) => {
      const wall1 = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
      wall1.position.set(segmentCenter, halfLowerWallHeight, -CROSS_WALL_BOUNDARY);
      scene.add(wall1);

      const wall2 = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
      wall2.position.set(segmentCenter, halfLowerWallHeight, CROSS_WALL_BOUNDARY);
      scene.add(wall2);
    });

    crossWallSegments.forEach((segmentCenter) => {
      const wall3 = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
      wall3.rotation.y = Math.PI / 2;
      wall3.position.set(-CROSS_WALL_BOUNDARY, halfLowerWallHeight, segmentCenter);
      scene.add(wall3);

      const wall4 = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
      wall4.rotation.y = Math.PI / 2;
      wall4.position.set(CROSS_WALL_BOUNDARY, halfLowerWallHeight, segmentCenter);
      scene.add(wall4);
    });

    const floorSegments: THREE.Mesh[] = [];

    const createConcreteMaterial = () => {
      const canvasSize = 128;
      const canvas = document.createElement('canvas');
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext('2d');
      if (!ctx)
        return new THREE.MeshStandardMaterial({
          color: 0x555555,
          roughness: 0.9,
          metalness: 0.0,
          side: THREE.DoubleSide,
        });

      ctx.fillStyle = '#555555';
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      for (let i = 0; i < 100; i++) {
        const x = Math.random() * canvasSize;
        const y = Math.random() * canvasSize;
        const size = 1 + Math.random() * 3;
        const color = `hsl(0, 0%, ${45 + Math.random() * 20}%)`;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, size, size);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(8, 8);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;

      return new THREE.MeshStandardMaterial({
        map: texture,
        color: 0x888888,
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });
    };

    const concreteMaterial = createConcreteMaterial();

    const placeholderFloorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.2,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    const createCustomFloorTexture = (callback: (texture: THREE.CanvasTexture) => void) => {
      const electricBlue = '#00FFFF';
      const shinyBlack = '#0a0a0a';
      const canvasSize = 1024;
      const mainCanvas = document.createElement('canvas');
      mainCanvas.width = canvasSize;
      mainCanvas.height = canvasSize;
      const mainCtx = mainCanvas.getContext('2d');
      if (!mainCtx) return;

      mainCtx.fillStyle = shinyBlack;
      mainCtx.fillRect(0, 0, canvasSize, canvasSize);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = '/electroneum-logo-symbol.svg';
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasSize;
        tempCanvas.height = canvasSize;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return;

        const padding = canvasSize * 0.1;
        const imageSize = canvasSize - padding * 2;
        tempCtx.drawImage(img, padding, padding, imageSize, imageSize);

        tempCtx.globalCompositeOperation = 'source-in';
        tempCtx.fillStyle = electricBlue;
        tempCtx.fillRect(0, 0, canvasSize, canvasSize);

        mainCtx.drawImage(tempCanvas, 0, 0);

        const texture = new THREE.CanvasTexture(mainCanvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.needsUpdate = true;
        callback(texture);
      };
      img.onerror = (err) => {
        console.error('Failed to load floor texture SVG:', err);
      };
    };

    const HOLE_SIZE = 30;

    for (let i = 0; i < NUM_SEGMENTS; i++) {
      for (let j = 0; j < NUM_SEGMENTS; j++) {
        const segmentCenterX = (i - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;
        const segmentCenterZ = (j - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;

        const isCentral3x3Segment = Math.abs(segmentCenterX) <= 10 && Math.abs(segmentCenterZ) <= 10;
        let floorMaterialToUse = placeholderFloorMaterial;

        if (isCentral3x3Segment) {
          floorMaterialToUse = concreteMaterial;
        }

        const floorSegment = new THREE.Mesh(segmentGeometry, floorMaterialToUse);
        floorSegment.rotation.x = Math.PI / 2;
        floorSegment.position.x = segmentCenterX;
        floorSegment.position.z = segmentCenterZ;
        scene.add(floorSegment);

        if (floorMaterialToUse === placeholderFloorMaterial) {
          floorSegments.push(floorSegment);
        }
      }
    }

    createCustomFloorTexture((texture) => {
      const newFloorMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.2,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });

      floorSegments.forEach((segment) => {
        if (segment.material === placeholderFloorMaterial) {
          segment.material.dispose();
          segment.material = newFloorMaterial;
        }
      });

      placeholderFloorMaterial.dispose();
    });

    const PLATFORM_Y = LOWER_WALL_HEIGHT + WALL_THICKNESS / 2 + 0.01;

    const platformGeometry = new THREE.BoxGeometry(30, WALL_THICKNESS, 30);
    const platform = new THREE.Mesh(platformGeometry, concreteMaterial.clone());
    platform.position.set(0, PLATFORM_Y, 0);
    scene.add(platform);

    // Under-platform rainbow plane
    const shaderPlaneGeometry = new THREE.PlaneGeometry(HOLE_SIZE, HOLE_SIZE);
    const shaderPlane = new THREE.Mesh(shaderPlaneGeometry, rainbowMaterial);
    const SHADER_PLANE_Y = LOWER_WALL_HEIGHT;
    shaderPlane.rotation.x = -Math.PI / 2;
    shaderPlane.position.set(0, SHADER_PLANE_Y, 0);
    scene.add(shaderPlane);

    // === DEBUG: Solid grey ceiling plane ===
    const ceilingGeometry = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
    const ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.FrontSide,
    });
    const debugCeiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    debugCeiling.rotation.x = -Math.PI / 2; // face downward into the room
    debugCeiling.position.set(0, WALL_HEIGHT + 0.01, 0);
    scene.add(debugCeiling);

    // --- Decorative props (futuristic, but no couches/tables) ---
    const decoMetal = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.2,
      metalness: 0.9,
    });
    const decoAccent = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: new THREE.Color(0x00ffff),
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.4,
    });
    const decoGlass = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      metalness: 0.5,
    });

    const makePlanterVariant = (variant: number) => {
      const baseRadiusTop = variant === 0 ? 0.45 : variant === 1 ? 0.35 : 0.5;
      const baseRadiusBottom = variant === 0 ? 0.6 : variant === 1 ? 0.55 : 0.7;
      const height = variant === 0 ? 0.5 : variant === 1 ? 0.65 : 0.55;
      const crownSize = variant === 0 ? 0.6 : variant === 1 ? 0.8 : 0.5;
      const color = variant === 0 ? 0x22c55e : variant === 1 ? 0x4ade80 : 0xa855f7;

      return (x: number, z: number) => {
        const potGeom = new THREE.CylinderGeometry(baseRadiusTop, baseRadiusBottom, height, 16);
        const trunkGeom = new THREE.CylinderGeometry(0.06, 0.12, 0.9, 8);
        const crownGeom = new THREE.SphereGeometry(crownSize, 18, 18);

        const potMat = new THREE.MeshStandardMaterial({
          color: 0x020617,
          roughness: 0.2,
          metalness: 0.7,
        });
        const trunkMat = new THREE.MeshStandardMaterial({
          color: 0x6b7280,
          roughness: 0.6,
        });
        const leafMat = new THREE.MeshStandardMaterial({
          color,
          emissive: new THREE.Color(color),
          emissiveIntensity: 0.35,
        });

        const pot = new THREE.Mesh(potGeom, potMat);
        pot.position.set(x, height / 2, z);
        scene.add(pot);

        const trunk = new THREE.Mesh(trunkGeom, trunkMat);
        trunk.position.set(x, height + 0.45, z);
        scene.add(trunk);

        const crown = new THREE.Mesh(crownGeom, leafMat);
        crown.position.set(x, height + 1.1, z);
        scene.add(crown);
      };
    };

    const makeSculptureVariant = (variant: number) => {
      return (x: number, z: number) => {
        const baseGeom =
          variant === 0
            ? new THREE.CylinderGeometry(0.6, 0.7, 0.3, 20)
            : new THREE.BoxGeometry(0.9, 0.3, 0.9);
        const base = new THREE.Mesh(baseGeom, decoMetal);
        base.position.set(x, 0.15, z);
        scene.add(base);

        if (variant === 0) {
          const columnGeom = new THREE.CylinderGeometry(0.15, 0.15, 1.4, 16);
          const column = new THREE.Mesh(columnGeom, decoAccent);
          column.position.set(x, 0.9, z);
          column.rotation.y = Math.PI / 4;
          scene.add(column);

          const orbGeom = new THREE.SphereGeometry(0.35, 24, 24);
          const orb = new THREE.Mesh(
            orbGeom,
            new THREE.MeshStandardMaterial({
              color: 0xffffff,
              emissive: new THREE.Color(0x60a5fa),
              emissiveIntensity: 1.2,
              roughness: 0.05,
              metalness: 0.9,
            }),
          );
          orb.position.set(x, 1.8, z);
          scene.add(orb);
        } else {
          const prismGeom = new THREE.BoxGeometry(0.35, 0.6, 0.35);
          for (let i = 0; i < 3; i++) {
            const prism = new THREE.Mesh(prismGeom, decoGlass);
            prism.position.set(x, 0.5 + i * 0.55, z);
            prism.rotation.y = (i * Math.PI) / 8;
            scene.add(prism);
          }
          const capGeom = new THREE.OctahedronGeometry(0.4, 0);
          const cap = new THREE.Mesh(
            capGeom,
            new THREE.MeshStandardMaterial({
              color: 0xffffff,
              emissive: new THREE.Color(0x22d3ee),
              emissiveIntensity: 0.9,
              roughness: 0.2,
              metalness: 0.7,
            }),
          );
          cap.position.set(x, 2.2, z);
          scene.add(cap);
        }
      };
    };

    const addSideTable = (x: number, z: number, rotationY = 0) => {
      const topGeom = new THREE.CylinderGeometry(1.0, 1.0, 0.15, 24);
      const legGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 16);

      const top = new THREE.Mesh(topGeom, decoMetal);
      top.position.set(x, 0.9, z);
      top.rotation.y = rotationY;
      scene.add(top);

      const leg = new THREE.Mesh(legGeom, decoAccent);
      leg.position.set(x, 0.5, z);
      scene.add(leg);
    };

    const addCabinet = (x: number, z: number, rotationY = 0) => {
      const bodyGeom = new THREE.BoxGeometry(2.4, 1.4, 0.7);
      const doorGeom = new THREE.BoxGeometry(1.1, 1.1, 0.02);

      const body = new THREE.Mesh(bodyGeom, decoMetal);
      body.position.set(x, 0.7, z);
      body.rotation.y = rotationY;
      scene.add(body);

      const doorLeft = new THREE.Mesh(doorGeom, decoGlass);
      const doorRight = new THREE.Mesh(doorGeom, decoGlass);

      const offset = 0.6;
      doorLeft.position.set(x - Math.cos(rotationY) * offset, 0.75, z - Math.sin(rotationY) * offset);
      doorRight.position.set(x + Math.cos(rotationY) * offset, 0.75, z + Math.sin(rotationY) * offset);
      doorLeft.rotation.y = rotationY;
      doorRight.rotation.y = rotationY;
      scene.add(doorLeft);
      scene.add(doorRight);
    };

    const planterA = makePlanterVariant(0);
    const planterB = makePlanterVariant(1);
    const planterC = makePlanterVariant(2);
    const sculptureA = makeSculptureVariant(0);
    const sculptureB = makeSculptureVariant(1);

    // Outer wall corners
    const inset = 2.5;
    planterA(-halfRoomSize + inset, -halfRoomSize + inset);
    sculptureA(halfRoomSize - inset, -halfRoomSize + inset);
    planterB(-halfRoomSize + inset, halfRoomSize - inset);
    sculptureB(halfRoomSize - inset, halfRoomSize - inset);

    const midPositions = [-15, -5, 5, 15];

    // North wall: z = -halfRoomSize
    midPositions.forEach((x, idx) => {
      const z = -halfRoomSize + 0.8;
      if (idx % 2 === 0) {
        planterC(x, z);
      } else {
        sculptureA(x, z + 0.2);
      }
    });

    // South wall: z = +halfRoomSize
    midPositions.forEach((x, idx) => {
      const z = halfRoomSize - 0.8;
      if (idx % 2 === 0) {
        planterB(x, z);
      } else {
        sculptureB(x, z - 0.2);
      }
    });

    // East wall: x = +halfRoomSize
    midPositions.forEach((z, idx) => {
      const x = halfRoomSize - 0.8;
      if (idx % 2 === 0) {
        planterA(x, z);
      } else {
        sculptureA(x - 0.2, z);
      }
    });

    // West wall: x = -halfRoomSize
    midPositions.forEach((z, idx) => {
      const x = -halfRoomSize + 0.8;
      if (idx % 2 === 0) {
        planterB(x, z);
      } else {
        sculptureB(x + 0.2, z);
      }
    });

    // Cross-wall decor
    crossWallSegments.forEach((segmentCenter) => {
      sculptureA(segmentCenter, -CROSS_WALL_BOUNDARY - 1.8);
      addSideTable(segmentCenter, CROSS_WALL_BOUNDARY + 1.8);
    });
    crossWallSegments.forEach((segmentCenter) => {
      planterC(-CROSS_WALL_BOUNDARY - 1.8, segmentCenter);
      addCabinet(CROSS_WALL_BOUNDARY + 1.8, segmentCenter, Math.PI / 2);
    });

    // Teleport buttons
    const TELEPORT_BUTTON_COLOR = 0x1a3f7c;
    const TELEPORT_BUTTON_HOVER_COLOR = 0x00ffff;
    const TELEPORT_BUTTON_RADIUS = 1.0;
    const TELEPORT_BUTTON_HEIGHT = 0.2;
    const PLAYER_HEIGHT = 1.6;

    const buttonGeometry = new THREE.CylinderGeometry(
      TELEPORT_BUTTON_RADIUS,
      TELEPORT_BUTTON_RADIUS,
      TELEPORT_BUTTON_HEIGHT,
      32,
    );
    const buttonMaterial = new THREE.MeshStandardMaterial({
      color: TELEPORT_BUTTON_COLOR,
      emissive: TELEPORT_BUTTON_COLOR,
      emissiveIntensity: 0.5,
      roughness: 0.1,
      metalness: 0.9,
    });

    const GROUND_BUTTON_Y = 0.1 + TELEPORT_BUTTON_HEIGHT / 2;
      It’s very likely the ceiling plane is fine and the file path is the real issue, but to answer your question directly:

- No, there isn’t a separate black “layer” above the room; the only ceiling geometry is the plane we’re creating for the sky (or the gray debug ceiling).
- With the current debug code (solid gray ceiling), the plane is oriented to face downward into the room:
  - Geometry: a large `PlaneGeometry(ROOM_SIZE, ROOM_SIZE)`
  - Material: `MeshStandardMaterial` with `color: 0x555555`
  - Orientation: `rotation.x = -Math.PI / 2` (so the front face looks down)
  - Position: `position.set(0, WALL_HEIGHT + 0.01, 0)` (just above the walls)

So if you look straight up in the room and still don’t see a big gray rectangle, the problem is not a black layer on top; it would more likely be:

1. The app hasn’t rebuilt / refreshed with the latest changes.  
   Please click the Refresh button in the Dyad UI so the preview reloads with the new code.
2. The camera is clipped or very far from the ceiling.  
   - Try teleporting to the upper platform and then looking straight up.
   - The ceiling is at `y ≈ 16`; on the upper floor, your camera is much closer to it, so it should fill a big part of your view.
3. Something in the WebGL context failed and the debug mesh never got added.  
   - Open the browser devtools console and see if there are any runtime errors right after load.

To explicitly answer your suspicion: there’s no black mesh occluding the starry image from “above”; if you don’t see the gray ceiling either after a refresh, we should next check the runtime console for errors and then I can simplify further (e.g., draw a tiny gray plane directly in front of the camera so it absolutely must be visible).Yes, the way the debug ceiling was added in that last edit was correct in theory, but you also pasted part of my explanatory text into the actual TS file by accident:

In `NftGallery.tsx` you now have this line inside the code:

```ts
const GROUND_BUTTON_Y = 0.1 + TELEPORT_BUTTON_HEIGHT / 2;
  It’s very likely the ceiling plane is fine and the file path is the real issue, but to answer your question directly:
```

That stray English sentence makes the file invalid, so the app never fully runs, which is why you’re not seeing the gray ceiling (or anything new).

I’ll fix the file back to a clean state, with:

- A simple solid gray ceiling plane (so you can very clearly see it).
- No texture loading for the ceiling at all (to keep the test simple).
- All the rest of your gallery code unchanged and compiling.

Here is the corrected `src/components/NftGallery.tsx`:

<dyad-write path="src/components/NftGallery.tsx" description="Fix syntax error and keep a solid gray ceiling plane for debugging.">
import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
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

// Initialize RectAreaLightUniformsLib immediately upon module load
RectAreaLightUniformsLib.init();

// Constants for geometry
const PANEL_WIDTH = 6;
const PANEL_HEIGHT = 6;

// Define types for the panel objects
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

// Global state for UI interaction
let currentTargetedPanel: Panel | null = null;
let currentTargetedArrow: THREE.Mesh | null = null;
let currentTargetedButton: THREE.Mesh | null = null;

// --- GLSL Shader Code for Rainbow Under-Platform Plane ---
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
    float sat = 0.9;
    float val = 0.9;

    vec3 color = hsv2rgb(vec3(hue, sat, val));

    vec2 uv = vUv * 2.0 - 1.0;
    float vignette = smoothstep(1.4, 0.2, length(uv));
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Helpers for media
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
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const wallMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const [isLocked, setIsLocked] = useState(false);
  const [marketBrowserState, setMarketBrowserState] = useState<{
    open: boolean;
    collection?: string;
    tokenId?: string | number;
  }>({ open: false });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);

  const isTeleportingRef = useRef(false);
  const fadeStartTimeRef = useRef(0);
  const FADE_DURATION = 0.5;

  const rainbowMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

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
        panel.gifStopFunction = null;
      }

      if (isVideo) {
        return new Promise((resolve) => {
          let videoEl = panel.videoElement;
          if (!videoEl) {
            videoEl = document.createElement('video');
            videoEl.playsInline = true;
            videoEl.autoplay = true;
            videoEl.loop = true;
            videoEl.muted = true;
            videoEl.style.display = 'none';
            videoEl.crossOrigin = 'anonymous';
            panel.videoElement = videoEl;
          }

          videoEl.src = url;
          videoEl.load();

          if ((window as any).galleryControls?.isLocked?.()) {
            videoEl.play().catch((e) => console.warn('Video playback prevented:', e));
          }

          const videoTexture = new THREE.VideoTexture(videoEl);
          videoTexture.minFilter = THREE.LinearFilter;
          videoTexture.magFilter = THREE.LinearFilter;
          resolve(videoTexture);
        });
      }

      if (isGif) {
        try {
          const { texture, stop } = await createGifTexture(url);
          panel.gifStopFunction = stop;
          return texture;
        } catch (error) {
          console.error('Failed to load animated GIF, falling back to static image load:', error);
        }
      }

      return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        loader.load(
          url,
          (texture) => resolve(texture),
          undefined,
          (error) => {
            console.error('Error loading texture:', url, error);
            showError(`Failed to load image: ${url.substring(0, 50)}...`);
            reject(error);
          },
        );
      });
    },
    [],
  );

  const updatePanelContent = useCallback(
    async (panel: Panel, source: NftSource | null) => {
      disposeTextureSafely(panel.mesh);
      panel.mesh.material = new THREE.MeshBasicMaterial({ color: 0x333333 });
      panel.metadataUrl = '';
      panel.isVideo = false;
      panel.isGif = false;

      if (panel.videoElement) {
        panel.videoElement.pause();
        panel.videoElement.removeAttribute('src');
        panel.videoElement = null;
      }

      if (panel.gifStopFunction) {
        panel.gifStopFunction();
        panel.gifStopFunction = null;
      }

      if (!source || source.contractAddress === '') {
        const collectionConfig = GALLERY_PANEL_CONFIG[panel.wallName];
        const showArrows = collectionConfig && collectionConfig.tokenIds.length > 1;
        panel.prevArrow.visible = showArrows;
        panel.nextArrow.visible = showArrows;
        return;
      }

      const metadata: NftMetadata | null = await getCachedNftMetadata(source.contractAddress, source.tokenId);

      if (!metadata) {
        disposeTextureSafely(panel.mesh);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
          canvas.width = 256;
          canvas.height = 256;
          context.fillStyle = '#333333';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = '#ff0000';
          context.font = '20px Arial';
          context.textAlign = 'center';
          context.fillText('NFT Unavailable', canvas.width / 2, canvas.height / 2);
        }
        const errorTexture = new THREE.CanvasTexture(canvas);
        panel.mesh.material = new THREE.MeshBasicMaterial({ map: errorTexture, side: THREE.DoubleSide });
        return;
      }

      try {
        const contentUrl = metadata.contentUrl;
        const isVideo = isVideoContent(metadata.contentType, contentUrl);
        const isGif = isGifContent(metadata.contentType, contentUrl);

        const texture = await loadTexture(contentUrl, panel, metadata.contentType);

        disposeTextureSafely(panel.mesh);
        panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture });

        panel.metadataUrl = metadata.source;
        panel.isVideo = isVideo;
        panel.isGif = isGif;

        showSuccess(
          isVideo
            ? `Loaded video NFT: ${metadata.title}`
            : isGif
            ? `Loaded animated GIF: ${metadata.title}`
            : `Loaded image NFT: ${metadata.title}`,
        );
      } catch (error) {
        console.error(`Error loading NFT content for ${panel.wallName}:`, error);
        showError(`Failed to load NFT content for ${panel.wallName}.`);
      }

      const collectionConfig = GALLERY_PANEL_CONFIG[panel.wallName];
      const showArrows = collectionConfig && collectionConfig.tokenIds.length > 1;
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
          if (controlsLocked) {
            panel.videoElement.play().catch((e) => console.warn('Video playback prevented:', e));
          }
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
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    const controls = new PointerLockControls(camera, renderer.domElement);
    controlsRef.current = controls;

    (window as any).galleryControls = {
      lockControls: () => controls.lock(),
      hasVideo: () => panelsRef.current.some((p) => p.videoElement !== null),
      isMuted: () => {
        const activeVideos = panelsRef.current.filter((p) => p.videoElement);
        if (activeVideos.length === 0) return true;
        return activeVideos.every((p) => p.videoElement!.muted);
      },
      toggleMute: () => {
        const activeVideos = panelsRef.current.filter((p) => p.videoElement);
        if (activeVideos.length > 0) {
          const currentlyMuted = activeVideos[0].videoElement!.muted;
          activeVideos.forEach((p) => {
            p.videoElement!.muted = !currentlyMuted;
          });
        }
      },
      isLocked: () => controls.isLocked,
      getTargetedPanel: () => currentTargetedPanel,
    };

    controls.addEventListener('lock', () => {
      setIsLocked(true);
      setInstructionsVisible(false);
      manageVideoPlayback(true);
    });

    controls.addEventListener('unlock', () => {
      setIsLocked(false);
      setInstructionsVisible(true);
      manageVideoPlayback(false);
    });

    // Room constants
    const ROOM_SEGMENT_SIZE = 10;
    const NUM_SEGMENTS = 5;
    const ROOM_SIZE = ROOM_SEGMENT_SIZE * NUM_SEGMENTS;
    const WALL_HEIGHT = 16;
    const LOWER_WALL_HEIGHT = 8;

    // Raised ground-floor panel height for OUTER walls
    const LOWER_PANEL_Y = 5.0;
    // Centered lower panel height for INNER 30x30 / center walls
    const INNER_LOWER_PANEL_Y = 4.0;

    const UPPER_PANEL_Y = 12.0;
    const BOUNDARY = ROOM_SIZE / 2 - 0.5;
    const halfRoomSize = ROOM_SIZE / 2;
    const segmentGeometry = new THREE.PlaneGeometry(ROOM_SEGMENT_SIZE, ROOM_SEGMENT_SIZE);

    const WALL_THICKNESS = 0.5;
    const INNER_WALL_BOUNDARY = ROOM_SIZE / 2;

    const wallSegmentGeometry = new THREE.BoxGeometry(ROOM_SEGMENT_SIZE, LOWER_WALL_HEIGHT, WALL_THICKNESS);
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.8,
      metalness: 0.1,
    });

    // Rainbow underside material
    const rainbowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
      },
      vertexShader: rainbowVertexShader,
      fragmentShader: rainbowFragmentShader,
      side: THREE.DoubleSide,
      transparent: false,
    });
    rainbowMaterialRef.current = rainbowMaterial;

    const outerWallGeometry = new THREE.BoxGeometry(ROOM_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
    const halfWallHeight = WALL_HEIGHT / 2;

    const northWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    northWall.position.set(0, halfWallHeight, -halfRoomSize);
    scene.add(northWall);

    const southWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    southWall.position.set(0, halfWallHeight, halfRoomSize);
    scene.add(southWall);

    const eastWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    eastWall.rotation.y = Math.PI / 2;
    eastWall.position.set(halfRoomSize, halfWallHeight, 0);
    scene.add(eastWall);

    const westWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    westWall.rotation.y = Math.PI / 2;
    westWall.position.set(-halfRoomSize, halfWallHeight, 0);
    scene.add(westWall);

    const halfLowerWallHeight = LOWER_WALL_HEIGHT / 2;
    const CROSS_WALL_BOUNDARY = 5;
    const crossWallSegments = [-10, 10];

    crossWallSegments.forEach((segmentCenter) => {
      const wall1 = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
      wall1.position.set(segmentCenter, halfLowerWallHeight, -CROSS_WALL_BOUNDARY);
      scene.add(wall1);

      const wall2 = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
      wall2.position.set(segmentCenter, halfLowerWallHeight, CROSS_WALL_BOUNDARY);
      scene.add(wall2);
    });

    crossWallSegments.forEach((segmentCenter) => {
      const wall3 = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
      wall3.rotation.y = Math.PI / 2;
      wall3.position.set(-CROSS_WALL_BOUNDARY, halfLowerWallHeight, segmentCenter);
      scene.add(wall3);

      const wall4 = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
      wall4.rotation.y = Math.PI / 2;
      wall4.position.set(CROSS_WALL_BOUNDARY, halfLowerWallHeight, segmentCenter);
      scene.add(wall4);
    });

    const floorSegments: THREE.Mesh[] = [];

    const createConcreteMaterial = () => {
      const canvasSize = 128;
      const canvas = document.createElement('canvas');
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext('2d');
      if (!ctx)
        return new THREE.MeshStandardMaterial({
          color: 0x555555,
          roughness: 0.9,
          metalness: 0.0,
          side: THREE.DoubleSide,
        });

      ctx.fillStyle = '#555555';
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      for (let i = 0; i < 100; i++) {
        const x = Math.random() * canvasSize;
        const y = Math.random() * canvasSize;
        const size = 1 + Math.random() * 3;
        const color = `hsl(0, 0%, ${45 + Math.random() * 20}%)`;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, size, size);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(8, 8);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;

      return new THREE.MeshStandardMaterial({
        map: texture,
        color: 0x888888,
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });
    };

    const concreteMaterial = createConcreteMaterial();

    const placeholderFloorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.2,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    const createCustomFloorTexture = (callback: (texture: THREE.CanvasTexture) => void) => {
      const electricBlue = '#00FFFF';
      const shinyBlack = '#0a0a0a';
      const canvasSize = 1024;
      const mainCanvas = document.createElement('canvas');
      mainCanvas.width = canvasSize;
      mainCanvas.height = canvasSize;
      const mainCtx = mainCanvas.getContext('2d');
      if (!mainCtx) return;

      mainCtx.fillStyle = shinyBlack;
      mainCtx.fillRect(0, 0, canvasSize, canvasSize);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = '/electroneum-logo-symbol.svg';
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasSize;
        tempCanvas.height = canvasSize;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return;

        const padding = canvasSize * 0.1;
        const imageSize = canvasSize - padding * 2;
        tempCtx.drawImage(img, padding, padding, imageSize, imageSize);

        tempCtx.globalCompositeOperation = 'source-in';
        tempCtx.fillStyle = electricBlue;
        tempCtx.fillRect(0, 0, canvasSize, canvasSize);

        mainCtx.drawImage(tempCanvas, 0, 0);

        const texture = new THREE.CanvasTexture(mainCanvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.needsUpdate = true;
        callback(texture);
      };
      img.onerror = (err) => {
        console.error('Failed to load floor texture SVG:', err);
      };
    };

    const HOLE_SIZE = 30;

    for (let i = 0; i < NUM_SEGMENTS; i++) {
      for (let j = 0; j < NUM_SEGMENTS; j++) {
        const segmentCenterX = (i - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;
        const segmentCenterZ = (j - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;

        const isCentral3x3Segment = Math.abs(segmentCenterX) <= 10 && Math.abs(segmentCenterZ) <= 10;
        let floorMaterialToUse = placeholderFloorMaterial;

        if (isCentral3x3Segment) {
          floorMaterialToUse = concreteMaterial;
        }

        const floorSegment = new THREE.Mesh(segmentGeometry, floorMaterialToUse);
        floorSegment.rotation.x = Math.PI / 2;
        floorSegment.position.x = segmentCenterX;
        floorSegment.position.z = segmentCenterZ;
        scene.add(floorSegment);

        if (floorMaterialToUse === placeholderFloorMaterial) {
          floorSegments.push(floorSegment);
        }
      }
    }

    createCustomFloorTexture((texture) => {
      const newFloorMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.2,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });

      floorSegments.forEach((segment) => {
        if (segment.material === placeholderFloorMaterial) {
          segment.material.dispose();
          segment.material = newFloorMaterial;
        }
      });

      placeholderFloorMaterial.dispose();
    });

    const PLATFORM_Y = LOWER_WALL_HEIGHT + WALL_THICKNESS / 2 + 0.01;

    const platformGeometry = new THREE.BoxGeometry(30, WALL_THICKNESS, 30);
    const platform = new THREE.Mesh(platformGeometry, concreteMaterial.clone());
    platform.position.set(0, PLATFORM_Y, 0);
    scene.add(platform);

    // Under-platform rainbow plane
    const shaderPlaneGeometry = new THREE.PlaneGeometry(HOLE_SIZE, HOLE_SIZE);
    const shaderPlane = new THREE.Mesh(shaderPlaneGeometry, rainbowMaterial);
    const SHADER_PLANE_Y = LOWER_WALL_HEIGHT;
    shaderPlane.rotation.x = -Math.PI / 2;
    shaderPlane.position.set(0, SHADER_PLANE_Y, 0);
    scene.add(shaderPlane);

    // === DEBUG: Solid grey ceiling plane ===
    const ceilingGeometry = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
    const ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.FrontSide,
    });
    const debugCeiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    debugCeiling.rotation.x = -Math.PI / 2; // face downward into the room
    debugCeiling.position.set(0, WALL_HEIGHT + 0.01, 0);
    scene.add(debugCeiling);

    // --- Decorative props (futuristic, but no couches/tables) ---
    const decoMetal = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.2,
      metalness: 0.9,
    });
    const decoAccent = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: new THREE.Color(0x00ffff),
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.4,
    });
    const decoGlass = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      metalness: 0.5,
    });

    const makePlanterVariant = (variant: number) => {
      const baseRadiusTop = variant === 0 ? 0.45 : variant === 1 ? 0.35 : 0.5;
      const baseRadiusBottom = variant === 0 ? 0.6 : variant === 1 ? 0.55 : 0.7;
      const height = variant === 0 ? 0.5 : variant === 1 ? 0.65 : 0.55;
      const crownSize = variant === 0 ? 0.6 : variant === 1 ? 0.8 : 0.5;
      const color = variant === 0 ? 0x22c55e : variant === 1 ? 0x4ade80 : 0xa855f7;

      return (x: number, z: number) => {
        const potGeom = new THREE.CylinderGeometry(baseRadiusTop, baseRadiusBottom, height, 16);
        const trunkGeom = new THREE.CylinderGeometry(0.06, 0.12, 0.9, 8);
        const crownGeom = new THREE.SphereGeometry(crownSize, 18, 18);

        const potMat = new THREE.MeshStandardMaterial({
          color: 0x020617,
          roughness: 0.2,
          metalness: 0.7,
        });
        const trunkMat = new THREE.MeshStandardMaterial({
          color: 0x6b7280,
          roughness: 0.6,
        });
        const leafMat = new THREE.MeshStandardMaterial({
          color,
          emissive: new THREE.Color(color),
          emissiveIntensity: 0.35,
        });

        const pot = new THREE.Mesh(potGeom, potMat);
        pot.position.set(x, height / 2, z);
        scene.add(pot);

        const trunk = new THREE.Mesh(trunkGeom, trunkMat);
        trunk.position.set(x, height + 0.45, z);
        scene.add(trunk);

        const crown = new THREE.Mesh(crownGeom, leafMat);
        crown.position.set(x, height + 1.1, z);
        scene.add(crown);
      };
    };

    const makeSculptureVariant = (variant: number) => {
      return (x: number, z: number) => {
        const baseGeom =
          variant === 0
            ? new THREE.CylinderGeometry(0.6, 0.7, 0.3, 20)
            : new THREE.BoxGeometry(0.9, 0.3, 0.9);
        const base = new THREE.Mesh(baseGeom, decoMetal);
        base.position.set(x, 0.15, z);
        scene.add(base);

        if (variant === 0) {
          const columnGeom = new THREE.CylinderGeometry(0.15, 0.15, 1.4, 16);
          const column = new THREE.Mesh(columnGeom, decoAccent);
          column.position.set(x, 0.9, z);
          column.rotation.y = Math.PI / 4;
          scene.add(column);

          const orbGeom = new THREE.SphereGeometry(0.35, 24, 24);
          const orb = new THREE.Mesh(
            orbGeom,
            new THREE.MeshStandardMaterial({
              color: 0xffffff,
              emissive: new THREE.Color(0x60a5fa),
              emissiveIntensity: 1.2,
              roughness: 0.05,
              metalness: 0.9,
            }),
          );
          orb.position.set(x, 1.8, z);
          scene.add(orb);
        } else {
          const prismGeom = new THREE.BoxGeometry(0.35, 0.6, 0.35);
          for (let i = 0; i < 3; i++) {
            const prism = new THREE.Mesh(prismGeom, decoGlass);
            prism.position.set(x, 0.5 + i * 0.55, z);
            prism.rotation.y = (i * Math.PI) / 8;
            scene.add(prism);
          }
          const capGeom = new THREE.OctahedronGeometry(0.4, 0);
          const cap = new THREE.Mesh(
            capGeom,
            new THREE.MeshStandardMaterial({
              color: 0xffffff,
              emissive: new THREE.Color(0x22d3ee),
              emissiveIntensity: 0.9,
              roughness: 0.2,
              metalness: 0.7,
            }),
          );
          cap.position.set(x, 2.2, z);
          scene.add(cap);
        }
      };
    };

    const addSideTable = (x: number, z: number, rotationY = 0) => {
      const topGeom = new THREE.CylinderGeometry(1.0, 1.0, 0.15, 24);
      const legGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 16);

      const top = new THREE.Mesh(topGeom, decoMetal);
      top.position.set(x, 0.9, z);
      top.rotation.y = rotationY;
      scene.add(top);

      const leg = new THREE.Mesh(legGeom, decoAccent);
      leg.position.set(x, 0.5, z);
      scene.add(leg);
    };

    const addCabinet = (x: number, z: number, rotationY = 0) => {
      const bodyGeom = new THREE.BoxGeometry(2.4, 1.4, 0.7);
      const doorGeom = new THREE.BoxGeometry(1.1, 1.1, 0.02);

      const body = new THREE.Mesh(bodyGeom, decoMetal);
      body.position.set(x, 0.7, z);
      body.rotation.y = rotationY;
      scene.add(body);

      const doorLeft = new THREE.Mesh(doorGeom, decoGlass);
      const doorRight = new THREE.Mesh(doorGeom, decoGlass);

      const offset = 0.6;
      doorLeft.position.set(x - Math.cos(rotationY) * offset, 0.75, z - Math.sin(rotationY) * offset);
      doorRight.position.set(x + Math.cos(rotationY) * offset, 0.75, z + Math.sin(rotationY) * offset);
      doorLeft.rotation.y = rotationY;
      doorRight.rotation.y = rotationY;
      scene.add(doorLeft);
      scene.add(doorRight);
    };

    const planterA = makePlanterVariant(0);
    const planterB = makePlanterVariant(1);
    const planterC = makePlanterVariant(2);
    const sculptureA = makeSculptureVariant(0);
    const sculptureB = makeSculptureVariant(1);

    // Outer wall corners
    const inset = 2.5;
    planterA(-halfRoomSize + inset, -halfRoomSize + inset);
    sculptureA(halfRoomSize - inset, -halfRoomSize + inset);
    planterB(-halfRoomSize + inset, halfRoomSize - inset);
    sculptureB(halfRoomSize - inset, halfRoomSize - inset);

    const midPositions = [-15, -5, 5, 15];

    // North wall: z = -halfRoomSize
    midPositions.forEach((x, idx) => {
      const z = -halfRoomSize + 0.8;
      if (idx % 2 === 0) {
        planterC(x, z);
      } else {
        sculptureA(x, z + 0.2);
      }
    });

    // South wall: z = +halfRoomSize
    midPositions.forEach((x, idx) => {
      const z = halfRoomSize - 0.8;
      if (idx % 2 === 0) {
        planterB(x, z);
      } else {
        sculptureB(x, z - 0.2);
      }
    });

    // East wall: x = +halfRoomSize
    midPositions.forEach((z, idx) => {
      const x = halfRoomSize - 0.8;
      if (idx % 2 === 0) {
        planterA(x, z);
      } else {
        sculptureA(x - 0.2, z);
      }
    });

    // West wall: x = -halfRoomSize
    midPositions.forEach((z, idx) => {
      const x = -halfRoomSize + 0.8;
      if (idx % 2 === 0) {
        planterB(x, z);
      } else {
        sculptureB(x + 0.2, z);
      }
    });

    // Cross-wall decor
    crossWallSegments.forEach((segmentCenter) => {
      sculptureA(segmentCenter, -CROSS_WALL_BOUNDARY - 1.8);
      addSideTable(segmentCenter, CROSS_WALL_BOUNDARY + 1.8);
    });
    crossWallSegments.forEach((segmentCenter) => {
      planterC(-CROSS_WALL_BOUNDARY - 1.8, segmentCenter);
      addCabinet(CROSS_WALL_BOUNDARY + 1.8, segmentCenter, Math.PI / 2);
    });

    // Teleport buttons
    const TELEPORT_BUTTON_COLOR = 0x1a3f7c;
    const TELEPORT_BUTTON_HOVER_COLOR = 0x00ffff;
    const TELEPORT_BUTTON_RADIUS = 1.0;
    const TELEPORT_BUTTON_HEIGHT = 0.2;
    const PLAYER_HEIGHT = 1.6;

    const buttonGeometry = new THREE.CylinderGeometry(
      TELEPORT_BUTTON_RADIUS,
      TELEPORT_BUTTON_RADIUS,
      TELEPORT_BUTTON_HEIGHT,
      32,
    );
    const buttonMaterial = new THREE.MeshStandardMaterial({
      color: TELEPORT_BUTTON_COLOR,
      emissive: TELEPORT_BUTTON_COLOR,
      emissiveIntensity: 0.5,
      roughness: 0.1,
      metalness: 0.9,
    });

    const GROUND_BUTTON_Y = 0.1 + TELEPORT_BUTTON_HEIGHT / 2;
    const FIRST_FLOOR_TARGET_Y = PLATFORM_Y + PLAYER_HEIGHT + WALL_THICKNESS / 2;

    const groundButton = new THREE.Mesh(buttonGeometry, buttonMaterial.clone());
    groundButton.position.set(0, GROUND_BUTTON_Y, 0);
    groundButton.userData = { isTeleportButton: true, targetY: FIRST_FLOOR_TARGET_Y };
    scene.add(groundButton);

    const FIRST_FLOOR_BUTTON_Y = PLATFORM_Y + WALL_THICKNESS / 2 + TELEPORT_BUTTON_HEIGHT / 2;
    const GROUND_FLOOR_TARGET_Y = PLAYER_HEIGHT;

    const firstFloorButton = new THREE.Mesh(buttonGeometry, buttonMaterial.clone());
    firstFloorButton.position.set(0, FIRST_FLOOR_BUTTON_Y, 0);
    firstFloorButton.userData = { isTeleportButton: true, targetY: GROUND_FLOOR_TARGET_Y };
    scene.add(firstFloorButton);

    const teleportButtons = [groundButton, firstFloorButton];

    const fadeMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    const fadeGeometry = new THREE.PlaneGeometry(100, 100);
    const fadeScreen = new THREE.Mesh(fadeGeometry, fadeMaterial);
    fadeScreen.renderOrder = 999;
    scene.add(fadeScreen);

    const performTeleport = (targetY: number) => {
      if (isTeleportingRef.current) return;
      isTeleportingRef.current = true;
      fadeStartTimeRef.current = performance.now();

      controls.unlock();

      setTimeout(() => {
        camera.position.y = targetY;
        controls.lock();
      }, FADE_DURATION * 1000);
    };

    // Lighting
    scene.add(new THREE.AmbientLight(0x404050, 1.0));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, WALL_HEIGHT, 0);
    scene.add(hemiLight);

    // Panel and arrows
    const panelGeometry = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
    const basePanelMaterial = new THREE.MeshBasicMaterial({
      color: 0x333333,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });

    const ARROW_COLOR_DEFAULT = 0xcccccc;
    const ARROW_COLOR_HOVER = 0x00ff00;
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15);
    arrowShape.lineTo(0.3, 0);
    arrowShape.lineTo(0, -0.15);
    arrowShape.lineTo(0, 0.15);
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const arrowMaterial = new THREE.MeshBasicMaterial({
      color: ARROW_COLOR_DEFAULT,
      side: THREE.DoubleSide,
    });

    const ARROW_DEPTH_OFFSET = 0.15 + WALL_THICKNESS / 2;
    the rest of the file is unchanged ...
  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback]);

  return (
    <>
      <div ref={mountRef} className="w-full h-full" />
      {marketBrowserState.open && (
        <MarketBrowserRefined
          collection={marketBrowserState.collection || ''}
          tokenId={marketBrowserState.tokenId || ''}
          open={marketBrowserState.open}
          onClose={() => setMarketBrowserState({ open: false })}
        />
      )}
    </>
  );
};

export default NftGallery;