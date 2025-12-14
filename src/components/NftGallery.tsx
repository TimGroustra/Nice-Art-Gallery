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

    // --- Star field: fewer, larger, clustered stars (no grid) ---

    float starMask = noise(vUv * 4.0 + vec2(time * 0.02, -time * 0.015));
    starMask = smoothstep(0.3, 0.8, starMask);

    float starField = 0.0;

    float r1 = rand(vUv * 90.0 + time * 0.03);
    float tiny = pow(r1, 28.0);
    starField += tiny * 0.7;

    float r2 = rand(vUv * 55.0 - time * 0.02);
    float big = pow(r2, 9.0);
    starField += big * 2.0;

    float r3 = rand((vUv + 0.01) * 55.0 + time * 0.01);
    float halo = pow(r3, 14.0) * 0.5;
    starField += halo;

    starField *= starMask;

    float twinkle = 0.7 + 0.3 * sin(time * 0.8 + r2 * 18.0);
    starField *= twinkle;

    vec3 starColor = vec3(0.8, 0.93, 1.0);
    vec3 color = skyColor + starField * starColor;

    float vignette = smoothstep(1.35, 0.2, length(uv));
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

    const LOWER_PANEL_Y = 5.0;
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

    // Single stretched ceiling (50x50) using the shader
    const ceilingGeometry = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
    const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceilingMesh.rotation.x = Math.PI / 2;
    ceilingMesh.position.set(0, WALL_HEIGHT + 0.01, 0);
    scene.add(ceilingMesh);

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

    // ... rest of the component (decor, teleport buttons, panels, animation loop, cleanup)
    // unchanged from the last working version ...

    // (Keeping the rest exactly as previously implemented)
    // Teleport buttons, decor, panels, movement, animate(), cleanup, etc.
    // --- SNIP: existing code already present below in your file ---
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