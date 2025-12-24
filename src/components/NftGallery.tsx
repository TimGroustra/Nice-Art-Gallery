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
import { useIsMobile } from '@/hooks/use-mobile';
import { useTouchControls } from '@/hooks/use-touch-controls';

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
  isWalking: boolean; // New prop for mobile movement state
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

const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible, isWalking }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [marketBrowserState, setMarketBrowserState] = useState<{
    open: boolean;
    collection?: string;
    tokenId?: string | number;
  }>({ open: false });

  const isMobile = useIsMobile();

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const teleportButtonsRef = useRef<THREE.Mesh[]>([]);
  const fadeScreenRef = useRef<THREE.Mesh | null>(null);
  const fadeMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);

  const isTeleportingRef = useRef(false);
  const fadeStartTimeRef = useRef(0);
  const FADE_DURATION = 0.5;

  const rainbowMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  // Desktop Movement state
  const moveForwardRef = useRef(false);
  const moveBackwardRef = useRef(false);
  const moveLeftRef = useRef(false);
  const moveRightRef = useRef(false);
  const velocityRef = useRef(new THREE.Vector3());
  const directionRef = useRef(new THREE.Vector3());
  const prevTimeRef = useRef(performance.now());

  // Mobile Controls Hook
  const { updateMovement: updateTouchMovement } = useTouchControls({
    camera: cameraRef.current!,
    rendererDomElement: rendererRef.current?.domElement!,
    isMobile,
    isWalking,
    onInteraction: (event) => handleInteraction(event),
  });

  const loadTexture = useCallback(
    async (url: string, panel: Panel, contentType: string): Promise<THREE.Texture | THREE.VideoTexture> => {
      disposeTextureSafely(panel.mesh);
      
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

          // Only attempt to play if controls are active (locked on desktop, or just active on mobile)
          const controlsActive = isMobile || (window as any).galleryControls?.isLocked?.();
          if (controlsActive) {
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
    [isMobile],
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

      const metadata: NftMetadata | null = await getCachedNftMetadata(
        source.contractAddress,
        source.tokenId,
      );

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
        panel.mesh.material = new THREE.MeshBasicMaterial({
          map: errorTexture,
          side: THREE.DoubleSide,
        });
        return;
      }

      try {
        const contentUrl = metadata.contentUrl;
        const contentType = metadata.contentType || '';
        const isVideo = isVideoContent(contentType, contentUrl);
        const isGif = isGifContent(contentType, contentUrl);

        const texture = await loadTexture(contentUrl, panel, contentType);

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
          // Check if controls are locked (desktop) or if walking (mobile)
          const controlsActive = isMobile ? isWalking : (window as any).galleryControls?.isLocked?.() ?? false;
          if (controlsActive) {
            panel.videoElement
              .play()
              .catch((e) => console.warn('Video playback prevented:', e));
          }
        } else {
          panel.videoElement.pause();
        }
      }
    });
  }, [isMobile, isWalking]);
  
  // Re-run video playback management when isWalking changes on mobile
  useEffect(() => {
    if (isMobile) {
        manageVideoPlayback(isWalking);
    }
  }, [isMobile, isWalking, manageVideoPlayback]);


  const performTeleport = useCallback((targetY: number) => {
    if (isTeleportingRef.current || !cameraRef.current || !controlsRef.current) return;
    isTeleportingRef.current = true;
    fadeStartTimeRef.current = performance.now();

    // On desktop, unlock controls during fade
    if (!isMobile) {
        controlsRef.current.unlock();
    }

    setTimeout(() => {
      if (cameraRef.current) {
        cameraRef.current.position.y = targetY;
      }
      // On desktop, relock controls after fade
      if (!isMobile) {
        controlsRef.current.lock();
      }
      // Note: isTeleportingRef is reset in the animation loop after fade out
    }, FADE_DURATION * 1000);
  }, [isMobile]);

  // Unified interaction handler for both desktop click and mobile tap
  const handleInteraction = useCallback((event: MouseEvent | TouchEvent) => {
    // Determine interaction coordinates (normalized to -1 to 1)
    let clientX, clientY;
    if (event instanceof MouseEvent) {
        if (!controlsRef.current?.isLocked && !isMobile) return; // Only interact if locked on desktop
        clientX = event.clientX;
        clientY = event.clientY;
    } else if (event instanceof TouchEvent) {
        if (event.touches.length !== 1) return;
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else {
        return;
    }

    const rect = rendererRef.current?.domElement.getBoundingClientRect();
    if (!rect) return;

    const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -(((clientY - rect.top) / rect.height) * 2 - 1)
    );

    if (!cameraRef.current || !raycasterRef.current) return;

    const raycaster = raycasterRef.current;
    const cam = cameraRef.current;

    // For mobile, raycast from the tap point
    if (isMobile) {
        raycaster.setFromCamera(mouse, cam);
    } else {
        // For desktop, raycast from the center (0, 0)
        raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);
    }

    const objectsToTest: THREE.Object3D[] = [];
    panelsRef.current.forEach((p) => {
        objectsToTest.push(p.mesh, p.prevArrow, p.nextArrow);
    });
    objectsToTest.push(...teleportButtonsRef.current);

    const intersects = raycaster.intersectObjects(objectsToTest, false);

    if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        
        // 1. Teleport button click
        if (hit.userData?.isTeleportButton) {
            const targetY = hit.userData.targetY as number;
            performTeleport(targetY);
            return;
        }

        // 2. Arrow click to change NFT
        const panelHit = panelsRef.current.find(
            (p) => p.prevArrow === hit || p.nextArrow === hit,
        );
        if (panelHit) {
            const direction = hit.userData?.direction as 'next' | 'prev';
            const updated = updatePanelIndex(panelHit.wallName, direction);
            if (updated) {
                const src = getCurrentNftSource(panelHit.wallName);
                updatePanelContent(panelHit, src);
            }
            return;
        }

        // 3. Panel click: open marketplace browser
        const panelMeshHit = panelsRef.current.find(p => p.mesh === hit);
        if (panelMeshHit && panelMeshHit.metadataUrl) {
            const config = GALLERY_PANEL_CONFIG[panelMeshHit.wallName];
            if (config && config.contractAddress && config.tokenIds.length > 0) {
                const tokenId = config.tokenIds[config.currentIndex];
                setMarketBrowserState({
                    open: true,
                    collection: config.contractAddress,
                    tokenId,
                });
            }
        }
    }
  }, [isMobile, performTeleport, updatePanelContent]);


  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    cameraRef.current = camera;
    camera.position.set(0, 1.6, -20);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current = renderer;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    // Initialize controls based on platform
    let controls: PointerLockControls | null = null;
    if (!isMobile) {
        controls = new PointerLockControls(camera, renderer.domElement);
        controlsRef.current = controls;
        
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
    } else {
        // Mobile: No pointer lock, always active
        setIsLocked(true); 
        setInstructionsVisible(false);
    }

    (window as any).galleryControls = {
      lockControls: () => controls?.lock(),
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
      isLocked: () => controls?.isLocked ?? true, // Always return true on mobile
      getTargetedPanel: () => currentTargetedPanel,
    };

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

    const wallSegmentGeometry = new THREE.BoxGeometry(
      ROOM_SEGMENT_SIZE,
      LOWER_WALL_HEIGHT,
      WALL_THICKNESS,
    );
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

    const outerWallGeometry = new THREE.BoxGeometry(
      ROOM_SIZE + WALL_THICKNESS,
      WALL_HEIGHT,
      WALL_THICKNESS,
    );
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

        const isCentral3x3Segment =
          Math.abs(segmentCenterX) <= 10 && Math.abs(segmentCenterZ) <= 10;
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

    // Main upper ceiling with same rainbow shader effect
    const ceilingGeometry = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
    const rainbowCeiling = new THREE.Mesh(ceilingGeometry, rainbowMaterial);
    rainbowCeiling.rotation.x = Math.PI / 2;
    rainbowCeiling.position.set(0, WALL_HEIGHT + 0.01, 0);
    scene.add(rainbowCeiling);

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

    const FIRST_FLOOR_BUTTON_Y =
      PLATFORM_Y + WALL_THICKNESS / 2 + TELEPORT_BUTTON_HEIGHT / 2;
    const GROUND_FLOOR_TARGET_Y = PLAYER_HEIGHT;

    const firstFloorButton = new THREE.Mesh(buttonGeometry, buttonMaterial.clone());
    firstFloorButton.position.set(0, FIRST_FLOOR_BUTTON_Y, 0);
    firstFloorButton.userData = { isTeleportButton: true, targetY: GROUND_FLOOR_TARGET_Y };
    scene.add(firstFloorButton);

    teleportButtonsRef.current = [groundButton, firstFloorButton];

    const fadeMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    fadeMaterialRef.current = fadeMaterial;
    const fadeGeometry = new THREE.PlaneGeometry(100, 100);
    const fadeScreen = new THREE.Mesh(fadeGeometry, fadeMaterial);
    fadeScreenRef.current = fadeScreen;
    fadeScreen.renderOrder = 999;
    scene.add(fadeScreen);

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
    const ARROW_PANEL_OFFSET = 3.2;

    const dynamicPanelConfigs: {
      wallName: keyof PanelConfig;
      position: [number, number, number];
      rotation: [number, number, number];
    }[] = [];

    const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall'] as const;
    const MAX_SEGMENT_INDEX = 4;

    // OUTER WALL PANELS: Now using full keys including -ground/-first suffix
    for (let i = 0; i <= MAX_SEGMENT_INDEX; i++) {
      for (const wallNameBase of WALL_NAMES) {
        const centerIndex = i - 2;
        const segmentCenter = centerIndex * ROOM_SEGMENT_SIZE;

        const tiers: { y: number; suffix: '-ground' | '-first' }[] = [
          { y: LOWER_PANEL_Y, suffix: '-ground' }, // ground tier
          { y: UPPER_PANEL_Y, suffix: '-first' }, // first floor tier
        ];

        for (const tier of tiers) {
          const wallKey = `${wallNameBase}-${i}${tier.suffix}` as keyof PanelConfig;

          let x = 0;
          let z = 0;
          let rotation: [number, number, number] = [0, 0, 0];
          let depthSign = 0;
          let wallAxis: 'x' | 'z' = 'z';

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
            position: [finalX, tier.y, finalZ],
            rotation,
          });
        }
      }
    }

    // INNER 30x30 walls – single tier (keys already match galleryConfig)
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

      const wallRotation = new THREE.Euler(
        config.rotation[0],
        config.rotation[1],
        config.rotation[2],
        'XYZ',
      );
      const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);

      const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      prevArrow.rotation.set(config.rotation[0], config.rotation[1] + Math.PI, config.rotation[2]);
      const prevPosition = new THREE.Vector3(
        config.position[0],
        config.position[1],
        config.position[2],
      ).addScaledVector(rightVector, -ARROW_PANEL_OFFSET);
      prevArrow.position.copy(prevPosition);
      prevArrow.userData = { isArrow: true, direction: 'prev' };
      scene.add(prevArrow);

      const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      nextArrow.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const nextPosition = new THREE.Vector3(
        config.position[0],
        config.position[1],
        config.position[2],
      ).addScaledVector(rightVector, ARROW_PANEL_OFFSET);
      nextArrow.position.copy(nextPosition);
      nextArrow.userData = { isArrow: true, direction: 'next' };
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

    // Raycaster
    const raycaster = new THREE.Raycaster();
    raycasterRef.current = raycaster;

    // --- Desktop Controls Setup ---
    const onKeyDown = (event: KeyboardEvent) => {
      if (isMobile) return;
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          moveForwardRef.current = true;
          break;
        case 'ArrowLeft':
        case 'KeyA':
          moveLeftRef.current = true;
          break;
        case 'ArrowDown':
        case 'KeyS':
          moveBackwardRef.current = true;
          break;
        case 'ArrowRight':
        case 'KeyD':
          moveRightRef.current = true;
          break;
        default:
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (isMobile) return;
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          moveForwardRef.current = false;
          break;
        case 'ArrowLeft':
        case 'KeyA':
          moveLeftRef.current = false;
          break;
        case 'ArrowDown':
        case 'KeyS':
          moveBackwardRef.current = false;
          break;
        case 'ArrowRight':
        case 'KeyD':
          moveRightRef.current = false;
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    // --- End Desktop Controls Setup ---


    // Resize handling
    const onWindowResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      const cam = cameraRef.current;
      const rend = rendererRef.current;
      cam.aspect = window.innerWidth / window.innerHeight;
      cam.updateProjectionMatrix();
      rend.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onWindowResize);

    // Context lost / restore
    const onContextLost = (event: WebGLContextEvent) => {
      event.preventDefault();
      console.warn('[NftGallery] WebGL context lost');
    };
    const onContextRestored = () => {
      console.info('[NftGallery] WebGL context restored');
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost as any, false);
    renderer.domElement.addEventListener(
      'webglcontextrestored',
      onContextRestored as any,
      false,
    );

    // Initial config + panel loading
    let stopAnimation = false;

    const fetchAndRenderPanelsSequentially = async () => {
      try {
        await initializeGalleryConfig();
        for (const panel of panelsRef.current) {
          const src = getCurrentNftSource(panel.wallName);
          await updatePanelContent(panel, src);
        }
      } catch (e) {
        console.error('Failed to initialize gallery panels:', e);
      }
    };

    fetchAndRenderPanelsSequentially();

    // Animation loop
    const animate = () => {
      if (stopAnimation) return;

      const time = performance.now();
      const delta = (time - prevTimeRef.current) / 1000;
      prevTimeRef.current = time;

      // Update movement
      if (!isMobile && controlsRef.current?.isLocked) {
        // Desktop movement (WASD)
        const velocity = velocityRef.current;
        const direction = directionRef.current;

        direction.z = Number(moveForwardRef.current) - Number(moveBackwardRef.current);
        direction.x = Number(moveRightRef.current) - Number(moveLeftRef.current);
        direction.normalize();

        const speed = 20.0;

        if (moveForwardRef.current || moveBackwardRef.current)
          velocity.z -= direction.z * speed * delta;
        if (moveLeftRef.current || moveRightRef.current)
          velocity.x -= direction.x * speed * delta;

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        controlsRef.current.moveRight(-velocity.x * delta);
        controlsRef.current.moveForward(-velocity.z * delta);
      } else if (isMobile) {
        // Mobile movement (Walk Toggle)
        updateTouchMovement(delta);
      }

      // Clamp within bounds (applies to both mobile and desktop)
      if (cameraRef.current) {
        const pos = cameraRef.current.position;
        pos.x = Math.max(-BOUNDARY, Math.min(BOUNDARY, pos.x));
        pos.z = Math.max(-BOUNDARY, Math.min(BOUNDARY, pos.z));
      }


      // Update shader time
      if (rainbowMaterialRef.current) {
        rainbowMaterialRef.current.uniforms.time.value += delta;
      }

      // Position fade screen in front of camera
      if (fadeScreenRef.current && cameraRef.current) {
        const cam = cameraRef.current;
        fadeScreenRef.current.position.copy(cam.position);
        fadeScreenRef.current.quaternion.copy(cam.quaternion);
      }

      // Fade animation
      if (isTeleportingRef.current && fadeMaterialRef.current) {
        const elapsed = (time - fadeStartTimeRef.current) / 1000;
        const half = FADE_DURATION;
        if (elapsed < half) {
          fadeMaterialRef.current.opacity = elapsed / half;
        } else if (elapsed < 2 * half) {
          fadeMaterialRef.current.opacity = 1 - (elapsed - half) / half;
        } else {
          fadeMaterialRef.current.opacity = 0;
          isTeleportingRef.current = false;
        }
      }

      // Raycast for hover/highlight (Desktop only, using center reticle)
      if (!isMobile && controlsRef.current?.isLocked && cameraRef.current && raycasterRef.current) {
        const cam = cameraRef.current;
        const raycaster = raycasterRef.current;

        raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);

        const objectsToTest: THREE.Object3D[] = [];
        panelsRef.current.forEach((p) => {
          objectsToTest.push(p.mesh, p.prevArrow, p.nextArrow);
        });
        objectsToTest.push(...teleportButtonsRef.current);

        const intersects = raycaster.intersectObjects(objectsToTest, false);

        currentTargetedPanel = null;
        currentTargetedArrow = null;
        currentTargetedButton = null;

        // Reset arrow colors and button colors
        panelsRef.current.forEach((p) => {
          if (p.prevArrow.material instanceof THREE.MeshBasicMaterial) {
            (p.prevArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_DEFAULT);
          }
          if (p.nextArrow.material instanceof THREE.MeshBasicMaterial) {
            (p.nextArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_DEFAULT);
          }
        });
        teleportButtonsRef.current.forEach((btn) => {
          if (btn.material instanceof THREE.MeshStandardMaterial) {
            (btn.material as THREE.MeshStandardMaterial).color.setHex(TELEPORT_BUTTON_COLOR);
            (btn.material as THREE.MeshStandardMaterial).emissive.setHex(TELEPORT_BUTTON_COLOR);
          }
        });

        if (intersects.length > 0) {
          const hit = intersects[0].object as THREE.Mesh;
          const panelHit = panelsRef.current.find(
            (p) => p.mesh === hit || p.prevArrow === hit || p.nextArrow === hit,
          );

          if (hit.userData?.isTeleportButton) {
            currentTargetedButton = hit;
            if (hit.material instanceof THREE.MeshStandardMaterial) {
              (hit.material as THREE.MeshStandardMaterial).color.setHex(
                TELEPORT_BUTTON_HOVER_COLOR,
              );
              (hit.material as THREE.MeshStandardMaterial).emissive.setHex(
                TELEPORT_BUTTON_HOVER_COLOR,
              );
            }
          } else if (panelHit) {
            if (hit === panelHit.prevArrow || hit === panelHit.nextArrow) {
              currentTargetedArrow = hit;
              if (hit.material instanceof THREE.MeshBasicMaterial) {
                (hit.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_HOVER);
              }
            } else if (hit === panelHit.mesh) {
              currentTargetedPanel = panelHit;
            }
          }
        }
      }

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    prevTimeRef.current = performance.now();
    requestAnimationFrame(animate);

    // Cleanup
    return () => {
      stopAnimation = true;
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      // Interaction listener is managed by useTouchControls hook now, but we remove the old one if it existed
      renderer.domElement.removeEventListener('click', handleInteraction); 
      window.removeEventListener('resize', onWindowResize);
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        onContextLost as any,
        false,
      );
      renderer.domElement.removeEventListener(
        'webglcontextrestored',
        onContextRestored as any,
        false,
      );

      (window as any).galleryControls = undefined;

      panelsRef.current.forEach((panel) => {
        disposeTextureSafely(panel.mesh);
        if (panel.videoElement) {
          panel.videoElement.pause();
          panel.videoElement.removeAttribute('src');
          panel.videoElement = null;
        }
        if (panel.gifStopFunction) {
          panel.gifStopFunction();
          panel.gifStopFunction = null;
        }
      });

      scene.traverse((obj) => {
        if ((obj as any).geometry) {
          (obj as any).geometry.dispose();
        }
        if ((obj as any).material) {
          const mat = (obj as any).material;
          if (Array.isArray(mat)) {
            mat.forEach((m: THREE.Material) => m.dispose());
          } else {
            (mat as THREE.Material).dispose();
          }
        }
      });

      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback, isMobile, updateTouchMovement, handleInteraction, performTeleport]);

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