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

// --- GLSL Shader Code for Starry Night Ceiling ---
const ceilingVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ceilingFragmentShader = `
  varying vec2 vUv;
  uniform float time;

  float rand(vec2 co) {
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
  }

  float noise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = rand(i);
    float b = rand(i + vec2(1.0, 0.0));
    float c = rand(i + vec2(0.0, 1.0));
    float d = rand(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) +
           (c - a)* u.y * (1.0 - u.x) +
           (d - b) * u.x * u.y;
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;

    // Base vertical gradient sky
    float height = uv.y * 0.6 + 0.5;
    vec3 topColor = vec3(0.02, 0.03, 0.08);
    vec3 bottomColor = vec3(0.01, 0.01, 0.04);
    vec3 skyColor = mix(bottomColor, topColor, height);

    // Soft moving clouds
    float t = time * 0.03;
    float n1 = noise(uv * 3.0 + vec2(t, 0.0));
    float n2 = noise(uv * 6.0 - vec2(0.0, t * 0.7));
    float clouds = smoothstep(0.4, 0.9, n1 + n2 * 0.5);
    vec3 cloudColor = vec3(0.06, 0.08, 0.18);
    skyColor = mix(skyColor, cloudColor, clouds * 0.7);

    // Main star field (bigger, twinkling stars)
    float starDensity = 80.0;
    float starField = 0.0;

    vec2 starUv = vUv * starDensity;

    vec2 id = floor(starUv);
    vec2 fracUv = fract(starUv);

    float rnd = rand(id * 37.0);

    // Stricter threshold so there are fewer grid stars
    float threshold = 0.992;
    if (rnd > threshold) {
      float d = length(fracUv - 0.5);
      float star = smoothstep(0.45, 0.0, d);

      // Gentle twinkle
      float twinkle = 0.55 + 0.45 * sin(time * (1.0 + rnd * 5.0) + rnd * 10.0);
      starField += star * twinkle;
    }

    // Very subtle scatter, almost imperceptible
    float scatterSeed = rand(vUv * 60.0 + time * 0.02);
    float scattered = pow(scatterSeed, 80.0);
    starField += scattered * 0.2;

    vec3 starColor = vec3(0.7, 0.9, 1.0);
    vec3 color = skyColor + starField * starColor;

    // Vignette
    float vignette = smoothstep(1.4, 0.2, length(uv));
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`;

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

  const ceilingMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
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

    // Starry ceiling material
    const ceilingMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
      },
      vertexShader: ceilingVertexShader,
      fragmentShader: ceilingFragmentShader,
      side: THREE.DoubleSide,
      transparent: false,
    });
    ceilingMaterialRef.current = ceilingMaterial;

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

        const ceilingSeg = new THREE.Mesh(segmentGeometry, ceilingMaterial);
        ceilingSeg.rotation.x = Math.PI / 2;
        ceilingSeg.position.x = segmentCenterX;
        ceilingSeg.position.z = segmentCenterZ;
        ceilingSeg.position.y = WALL_HEIGHT + 0.01;
        scene.add(ceilingSeg);
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

    // Outer wall corners (away from 10x10 couch areas)
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

    // Cross-wall decor (not inside 10x10 corners)
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
    const ARROW_PANEL_OFFSET = 3.2;

    const dynamicPanelConfigs: {
      wallName: keyof PanelConfig;
      position: [number, number, number];
      rotation: [number, number, number];
    }[] = [];

    const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall'];
    const MAX_SEGMENT_INDEX = 4;

    for (let i = 0; i <= MAX_SEGMENT_INDEX; i++) {
      for (const wallNameBase of WALL_NAMES) {
        const wallKey = `${wallNameBase}-${i}` as keyof PanelConfig;

        const yLevelsOuter = [LOWER_PANEL_Y, UPPER_PANEL_Y];

        for (const panelY of yLevelsOuter) {
          let x = 0;
          let z = 0;
          let rotation: [number, number, number] = [0, 0, 0];
          let depthSign = 0;
          let wallAxis: 'x' | 'z' = 'z';
          const centerIndex = i - 2;
          const segmentCenter = centerIndex * ROOM_SEGMENT_SIZE;

          if (wallNameBase === 'north-wall') {
            x = segmentCenter;
            z = -INNER_WALL_BOUNDARY;
            rotation = [0, 0, 0];
            depthSign = 1;
            wallAxis = 'z';
          } else if (wallNameBase === 'south-wall') {
            x = segmentCenter;
            z = INNER_WALL_BOUNDARY;
            rotation = [0, Math.PI, 0];
            depthSign = -1;
            wallAxis = 'z';
          } else if (wallNameBase === 'east-wall') {
            x = INNER_WALL_BOUNDARY;
            z = segmentCenter;
            rotation = [0, -Math.PI / 2, 0];
            depthSign = -1;
            wallAxis = 'x';
          } else if (wallNameBase === 'west-wall') {
            x = -INNER_WALL_BOUNDARY;
            z = segmentCenter;
            rotation = [0, Math.PI / 2, 0];
            depthSign = 1;
            wallAxis = 'x';
          }

          let finalX = x;
          let finalZ = z;
          if (wallAxis === 'x') {
            finalX += depthSign * ARROW_DEPTH_OFFSET;
          } else {
            finalZ += depthSign * ARROW_DEPTH_OFFSET;
          }

          dynamicPanelConfigs.push({
            wallName: wallKey,
            position: [finalX, panelY, finalZ],
            rotation,
          });
        }
      }
    }

    crossWallSegments.forEach((segmentCenter, i) => {
      const index = i;

      dynamicPanelConfigs.push({
        wallName: `north-inner-wall-outer-${index}` as keyof PanelConfig,
        position: [segmentCenter, INNER_LOWER_PANEL_Y, -CROSS_WALL_BOUNDARY - ARROW_DEPTH_OFFSET],
        rotation: [0, Math.PI, 0],
      });

      dynamicPanelConfigs.push({
        wallName: `north-inner-wall-inner-${index}` as keyof PanelConfig,
        position: [segmentCenter, INNER_LOWER_PANEL_Y, -CROSS_WALL_BOUNDARY + ARROW_DEPTH_OFFSET],
        rotation: [0, 0, 0],
      });

      dynamicPanelConfigs.push({
        wallName: `south-inner-wall-outer-${index}` as keyof PanelConfig,
        position: [segmentCenter, INNER_LOWER_PANEL_Y, CROSS_WALL_BOUNDARY + ARROW_DEPTH_OFFSET],
        rotation: [0, 0, 0],
      });

      dynamicPanelConfigs.push({
        wallName: `south-inner-wall-inner-${index}` as keyof PanelConfig,
        position: [segmentCenter, INNER_LOWER_PANEL_Y, CROSS_WALL_BOUNDARY - ARROW_DEPTH_OFFSET],
        rotation: [0, Math.PI, 0],
      });

      dynamicPanelConfigs.push({
        wallName: `east-inner-wall-outer-${index}` as keyof PanelConfig,
        position: [CROSS_WALL_BOUNDARY + ARROW_DEPTH_OFFSET, INNER_LOWER_PANEL_Y, segmentCenter],
        rotation: [0, Math.PI / 2, 0],
      });

      dynamicPanelConfigs.push({
        wallName: `east-inner-wall-inner-${index}` as keyof PanelConfig,
        position: [CROSS_WALL_BOUNDARY - ARROW_DEPTH_OFFSET, INNER_LOWER_PANEL_Y, segmentCenter],
        rotation: [0, -Math.PI / 2, 0],
      });

      dynamicPanelConfigs.push({
        wallName: `west-inner-wall-outer-${index}` as keyof PanelConfig,
        position: [-CROSS_WALL_BOUNDARY - ARROW_DEPTH_OFFSET, INNER_LOWER_PANEL_Y, segmentCenter],
        rotation: [0, -Math.PI / 2, 0],
      });

      dynamicPanelConfigs.push({
        wallName: `west-inner-wall-inner-${index}` as keyof PanelConfig,
        position: [-CROSS_WALL_BOUNDARY + ARROW_DEPTH_OFFSET, INNER_LOWER_PANEL_Y, segmentCenter],
        rotation: [0, Math.PI / 2, 0],
      });
    });

    panelsRef.current = [];

    dynamicPanelConfigs.forEach((config) => {
      const mesh = new THREE.Mesh(panelGeometry, basePanelMaterial.clone());
      mesh.position.set(config.position[0], config.position[1], config.position[2]);
      mesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      scene.add(mesh);

      const wallRotation = new THREE.Euler(config.rotation[0], config.rotation[1], config.rotation[2], 'XYZ');
      const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);

      const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      prevArrow.rotation.set(config.rotation[0], config.rotation[1] + Math.PI, config.rotation[2]);
      const prevPosition = new THREE.Vector3(
        config.position[0],
        config.position[1],
        config.position[2],
      ).addScaledVector(rightVector, -ARROW_PANEL_OFFSET);
      prevArrow.position.copy(prevPosition);
      scene.add(prevArrow);

      const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      nextArrow.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const nextPosition = new THREE.Vector3(
        config.position[0],
        config.position[1],
        config.position[2],
      ).addScaledVector(rightVector, ARROW_PANEL_OFFSET);
      nextArrow.position.copy(nextPosition);
      scene.add(nextArrow);

      const panel: Panel = {
        mesh,
        wallName: config.wallName,
        metadataUrl: '',
        isVideo: false,
        isGif: false,
        prevArrow,
        nextArrow,
        videoElement: null,
        gifStopFunction: null,
      };

      panelsRef.current.push(panel);
    });

    // Movement, raycasting, rendering, cleanup ...
    let moveForward = false,
      moveBackward = false,
      moveLeft = false,
      moveRight = false;
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const speed = 20.0;

    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
          moveForward = true;
          break;
        case 'KeyA':
          moveLeft = true;
          break;
        case 'KeyS':
          moveBackward = true;
          break;
        case 'KeyD':
          moveRight = true;
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
          moveForward = false;
          break;
        case 'KeyA':
          moveLeft = false;
          break;
        case 'KeyS':
          moveBackward = false;
          break;
        case 'KeyD':
          moveRight = false;
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);

    const interactiveMeshes = panelsRef.current
      .flatMap((p) => [p.mesh, p.prevArrow, p.nextArrow])
      .concat(teleportButtons);

    const onDocumentMouseDown = () => {
      if (!controls.isLocked) return;

      if (currentTargetedArrow) {
        const panel = panelsRef.current.find(
          (p) => p.prevArrow === currentTargetedArrow || p.nextArrow === currentTargetedArrow,
        );
        if (panel) {
          const dir = currentTargetedArrow === panel.nextArrow ? 'next' : 'prev';

          if (updatePanelIndex(panel.wallName, dir)) {
            const sameWallPanels = panelsRef.current.filter((p) => p.wallName === panel.wallName);
            const source = getCurrentNftSource(panel.wallName);
            sameWallPanels.forEach((pnl) => {
              updatePanelContent(pnl, source);
            });
          }
        }
      } else if (currentTargetedPanel) {
        const source = getCurrentNftSource(currentTargetedPanel.wallName);
        if (source) {
          setMarketBrowserState({
            open: true,
            collection: source.contractAddress,
            tokenId: source.tokenId,
          });
          controls.unlock();
        }
      } else if (currentTargetedButton) {
        performTeleport(currentTargetedButton.userData.targetY);
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown);

    let prevTime = performance.now();
    const startTime = performance.now();

    const animate = () => {
      requestAnimationFrame(animate);

      const time = performance.now();
      const delta = (time - prevTime) / 1000;
      const elapsedTime = (time - startTime) / 1000;

      if (ceilingMaterialRef.current) {
        ceilingMaterialRef.current.uniforms.time.value = elapsedTime;
      }
      if (rainbowMaterialRef.current) {
        rainbowMaterialRef.current.uniforms.time.value = elapsedTime;
      }

      if (isTeleportingRef.current) {
        const elapsed = (time - fadeStartTimeRef.current) / 1000;
        let opacity = 0;

        if (elapsed < FADE_DURATION) {
          opacity = Math.min(1, elapsed / FADE_DURATION);
        } else if (elapsed < FADE_DURATION * 2) {
          opacity = Math.max(0, 1 - (elapsed - FADE_DURATION) / FADE_DURATION);
        } else {
          isTeleportingRef.current = false;
          opacity = 0;
        }

        fadeMaterial.opacity = opacity;

        fadeScreen.position.copy(camera.position);
        fadeScreen.position.add(
          camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.1),
        );
        fadeScreen.quaternion.copy(camera.quaternion);
      }

      if (controls.isLocked) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        camera.position.x = Math.max(-BOUNDARY, Math.min(BOUNDARY, camera.position.x));
        camera.position.z = Math.max(-BOUNDARY, Math.min(BOUNDARY, camera.position.z));

        raycaster.setFromCamera(center, camera);
        const intersects = raycaster.intersectObjects(interactiveMeshes);

        panelsRef.current.forEach((p) => {
          (p.prevArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_DEFAULT);
          (p.nextArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_DEFAULT);
        });

        teleportButtons.forEach((b) => {
          (b.material as THREE.MeshStandardMaterial).color.setHex(TELEPORT_BUTTON_COLOR);
          (b.material as THREE.MeshStandardMaterial).emissive.setHex(TELEPORT_BUTTON_COLOR);
        });

        currentTargetedPanel = null;
        currentTargetedArrow = null;
        currentTargetedButton = null;

        if (intersects.length > 0 && intersects[0].distance < 5) {
          const intersectedMesh = intersects[0].object as THREE.Mesh;

          if (intersectedMesh.userData.isTeleportButton) {
            currentTargetedButton = intersectedMesh;
            (intersectedMesh.material as THREE.MeshStandardMaterial).color.setHex(
              TELEPORT_BUTTON_HOVER_COLOR,
            );
            (intersectedMesh.material as THREE.MeshStandardMaterial).emissive.setHex(
              TELEPORT_BUTTON_HOVER_COLOR,
            );
          } else {
            const panel = panelsRef.current.find(
              (p) =>
                p.mesh === intersectedMesh ||
                p.prevArrow === intersectedMesh ||
                p.nextArrow === intersectedMesh,
            );

            if (panel) {
              if (intersectedMesh === panel.mesh) currentTargetedPanel = panel;
              else if (
                intersectedMesh === panel.prevArrow ||
                intersectedMesh === panel.nextArrow
              ) {
                currentTargetedArrow = intersectedMesh;
                (intersectedMesh.material as THREE.MeshBasicMaterial).color.setHex(
                  ARROW_COLOR_HOVER,
                );
              }
            }
          }
        }
      }

      prevTime = time;
      renderer.render(scene, camera);
    };

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', onWindowResize);

    const reloadAllPanelContent = async () => {
      console.log('WebGL Context Restored. Reloading all panel content...');
      for (const panel of panelsRef.current) {
        const source = getCurrentNftSource(panel.wallName);
        if (source) {
          await updatePanelContent(panel, source);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      manageVideoPlayback(controls.isLocked);
    };

    const canvas = renderer.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn('WebGL Context Lost. Screen may go white.');
    };

    const handleContextRestored = () => {
      console.log('WebGL Context Restored. Reinitializing resources.');
      reloadAllPanelContent();
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    const fetchAndRenderPanelsSequentially = async () => {
      await initializeGalleryConfig();

      for (const [panelKey, config] of Object.entries(GALLERY_PANEL_CONFIG)) {
        if (config.wall_color) {
          const wallMesh = wallMeshesRef.current.get(panelKey);
          if (wallMesh && wallMesh.material instanceof THREE.MeshStandardMaterial) {
            wallMesh.material.color.set(config.wall_color);
          }
        }
      }

      for (const panel of panelsRef.current) {
        const source = getCurrentNftSource(panel.wallName);
        await updatePanelContent(panel, source);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };

    fetchAndRenderPanelsSequentially();
    animate();

    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onWindowResize);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      mountRef.current?.removeChild(renderer.domElement);
      controls.dispose();

      panelsRef.current.forEach((panel) => {
        if (panel.videoElement) {
          panel.videoElement.pause();
          panel.videoElement.removeAttribute('src');
        }
        if (panel.gifStopFunction) {
          panel.gifStopFunction();
        }
      });

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => {
              if ((m as any).map) (m as any).map.dispose();
              m.dispose();
            });
          } else {
            const mat = obj.material as any;
            if (mat.map) mat.map.dispose();
            mat.dispose();
          }
        }
      });

      renderer.dispose();
      delete (window as any).galleryControls;
      currentTargetedPanel = null;
      currentTargetedArrow = null;
      currentTargetedButton = null;
    };
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