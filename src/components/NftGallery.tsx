import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';
import { createGifTexture } from '@/utils/gifTexture';

// Initialize RectAreaLightUniformsLib immediately upon module load
RectAreaLightUniformsLib.init();

// Constants for geometry
const PANEL_WIDTH = 6; // Increased from 4
const PANEL_HEIGHT = 6; // Increased from 4

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

// --- GLSL Shader Code for Pulsing Rainbow Ceiling ---
const ceilingVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ceilingFragmentShader = `
uniform float time;
uniform float opacity;

// Function to convert HSV to RGB (Hue, Saturation, Value)
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  // 1. Hue shift over time (0.0 to 1.0)
  float hue = mod(time * 0.05, 1.0);
  
  // 2. Pulsing brightness (Value/Lightness)
  // Pulse adjusted to be slower (0.5 speed) and darker (range 0.2 to 0.4)
  float pulse = 0.3 + sin(time * 0.5) * 0.1;
  
  // Saturation is high
  float saturation = 0.8;
  
  vec3 color = hsv2rgb(vec3(hue, saturation, pulse));
  
  gl_FragColor = vec4(color, opacity);
}
`;
// --- End GLSL Shader Code ---

// Helper function to determine if content is video or GIF
const isVideoContent = (contentType: string, url: string) => {
  return !!(contentType.startsWith('video/') || url.match(/\.(mp4|webm|ogg)(\?|$)/i));
};

const isGifContent = (contentType: string, url: string) => {
  return !!(contentType === "image/gif" || url.match(/\.gif(\?|$)/i));
};

// Helper function for texture cleanup
const disposeTextureSafely = (mesh: THREE.Mesh) => {
  if (mesh.material instanceof THREE.MeshBasicMaterial) {
    if (mesh.material.map && typeof mesh.material.map.dispose === 'function') {
      mesh.material.map.dispose();
      mesh.material.map = null;
    }
    mesh.material.dispose();
  }
};

const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const wallMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const [isLocked, setIsLocked] = useState(false);
  const [marketBrowserState, setMarketBrowserState] = useState<{ open: boolean; collection?: string; tokenId?: string | number; }>({ open: false });
  
  // Refactored loadTexture to handle Video, GIF, and Image - moved inside component
  const loadTexture = useCallback(async (url: string, panel: Panel, contentType: string): Promise<THREE.Texture | THREE.VideoTexture> => {
    const isVideo = isVideoContent(contentType, url);
    const isGif = isGifContent(contentType, url);

    // --- Cleanup previous media ---
    if (panel.videoElement) {
      panel.videoElement.pause();
      panel.videoElement.removeAttribute('src');
      panel.videoElement = null;
    }
    if (panel.gifStopFunction) {
      panel.gifStopFunction();
      panel.gifStopFunction = null;
    }
    // --- End Cleanup ---

    if (isVideo) {
      return new Promise(resolve => {
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
          videoEl.play().catch(e => console.warn("Video playback prevented:", e));
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
        console.error("Failed to load animated GIF, falling back to static image load:", error);
        // Fall through to image loader if GIF decoding fails
      }
    }

    // Default: Image/Static GIF/Fallback
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(url, (texture) => {
        resolve(texture);
      }, undefined, (error) => {
        console.error('Error loading texture:', url, error);
        showError(`Failed to load image: ${url.substring(0, 50)}...`);
        reject(error);
      });
    });
  }, []);

  const updatePanelContent = useCallback(async (panel: Panel, source: NftSource | null) => {
    // --- Reset NFT panel ---
    disposeTextureSafely(panel.mesh);
    panel.mesh.material = new THREE.MeshBasicMaterial({ color: 0x333333 }); // Dark gray placeholder
    panel.metadataUrl = '';
    panel.isVideo = false;
    panel.isGif = false;

    // Ensure media cleanup on failure/reset
    if (panel.videoElement) {
      panel.videoElement.pause();
      panel.videoElement.removeAttribute('src');
      panel.videoElement = null;
    }
    if (panel.gifStopFunction) {
      panel.gifStopFunction();
      panel.gifStopFunction = null;
    }

    // Handle blank panel case immediately
    if (!source || source.contractAddress === "") {
      const collectionConfig = GALLERY_PANEL_CONFIG[panel.wallName];
      const showArrows = collectionConfig && collectionConfig.tokenIds.length > 1;
      panel.prevArrow.visible = showArrows;
      panel.nextArrow.visible = showArrows;
      return;
    }

    // --- Fetch Metadata ---
    const metadata: NftMetadata | null = await getCachedNftMetadata(source.contractAddress, source.tokenId);

    if (!metadata) {
      // Graceful failure: metadata fetch failed
      console.warn(`Skipping panel ${panel.wallName} (${source.contractAddress}/${source.tokenId}) due to metadata fetch failure.`);
      
      // Display a simple error message on the main panel
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

      // AWAIT the texture loading to ensure the image data is ready
      const texture = await loadTexture(contentUrl, panel, metadata.contentType);

      // --- Main NFT Mesh Update ---
      disposeTextureSafely(panel.mesh);
      panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture });
      // --- End Main NFT Mesh Update ---

      panel.metadataUrl = metadata.source;
      panel.isVideo = isVideo;
      panel.isGif = isGif;

      showSuccess(isVideo ? `Loaded video NFT: ${metadata.title}` : isGif ? `Loaded animated GIF: ${metadata.title}` : `Loaded image NFT: ${metadata.title}`);

    } catch (error) {
      console.error(`Error loading NFT content for ${panel.wallName}:`, error);
      showError(`Failed to load NFT content for ${panel.wallName}.`);
      // If loading fails, the panel remains dark gray
    }

    // --- Update Arrow Visibility ---
    const collectionConfig = GALLERY_PANEL_CONFIG[panel.wallName];
    const showArrows = collectionConfig && collectionConfig.tokenIds.length > 1;
    panel.prevArrow.visible = showArrows;
    panel.nextArrow.visible = showArrows;
    // --- End Arrow Visibility Update ---

  }, [loadTexture]);

  const manageVideoPlayback = useCallback((shouldPlay: boolean) => {
    panelsRef.current.forEach(panel => {
      if (panel.videoElement) {
        if (shouldPlay) {
          const controlsLocked = (window as any).galleryControls?.isLocked?.() ?? false;
          if (controlsLocked) {
            // Attempt to play, ignoring promise rejection if user gesture is required
            panel.videoElement.play().catch(e => console.warn("Video playback prevented:", e));
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
    scene.background = new THREE.Color(0xaaaaaa);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, -20);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    const controls = new PointerLockControls(camera, renderer.domElement);

    (window as any).galleryControls = {
      lockControls: () => controls.lock(),
      hasVideo: () => panelsRef.current.some(p => p.videoElement !== null),
      isMuted: () => {
        const activeVideos = panelsRef.current.filter(p => p.videoElement);
        if (activeVideos.length === 0) return true;
        return activeVideos.every(p => p.videoElement!.muted);
      },
      toggleMute: () => {
        const activeVideos = panelsRef.current.filter(p => p.videoElement);
        if (activeVideos.length > 0) {
          const currentlyMuted = activeVideos[0].videoElement!.muted;
          activeVideos.forEach(p => {
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

    // --- ROOM GEOMETRY SETUP (50x50) ---
    const ROOM_SEGMENT_SIZE = 10;
    const NUM_SEGMENTS = 5;
    const ROOM_SIZE = ROOM_SEGMENT_SIZE * NUM_SEGMENTS;
    const WALL_HEIGHT = 16; // Total height
    const LOWER_WALL_HEIGHT = 8; // Height of individual stacked segments
    const PANEL_Y_POSITION = 4.0; // Center the 6m panel vertically on the LOWER 8m wall segment
    const BOUNDARY = ROOM_SIZE / 2 - 0.5;

    const roomSize = ROOM_SIZE,
      wallHeight = WALL_HEIGHT,
      panelYPosition = PANEL_Y_POSITION,
      boundary = BOUNDARY;
    const halfRoomSize = ROOM_SIZE / 2;

    const segmentGeometry = new THREE.PlaneGeometry(ROOM_SEGMENT_SIZE, ROOM_SEGMENT_SIZE);

    // Increase wall thickness by using BoxGeometry instead of PlaneGeometry
    const WALL_THICKNESS = 0.5; // Increased from 0 to 0.5 units thick
    
    // Define wall segment geometry once
    const wallSegmentGeometry = new THREE.BoxGeometry(ROOM_SEGMENT_SIZE, LOWER_WALL_HEIGHT, WALL_THICKNESS);
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8, metalness: 0.1 });

    // --- Floor Texture and Material ---
    const floorSegments: THREE.Mesh[] = [];

    // 1. Concrete Material (Synchronous) - Used for the central 30x30 area
    const createConcreteMaterial = () => {
      const canvasSize = 128;
      const canvas = document.createElement('canvas');
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) return new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });

      ctx.fillStyle = '#555555'; // Medium gray base
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      // Add noise/texture for timeworn look
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * canvasSize;
        const y = Math.random() * canvasSize;
        const size = 1 + Math.random() * 3;
        const color = `hsl(0, 0%, ${45 + Math.random() * 20}%)`; // Lighter/darker specks
        ctx.fillStyle = color;
        ctx.fillRect(x, y, size, size);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(8, 8); // Repeat the pattern more frequently for a smoother look
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;

      return new THREE.MeshStandardMaterial({
        map: texture,
        color: 0x888888, // Overall tint
        roughness: 0.9, // Smooth but timeworn implies high roughness
        metalness: 0.0,
        side: THREE.DoubleSide,
      });
    };
    const concreteMaterial = createConcreteMaterial();

    // 2. Placeholder Material for ETN Logo Floor (Async)
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
        const imageSize = canvasSize - (padding * 2);
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

    const innerSegmentCenters = [-20, -10, 0, 10, 20];

    // Constants for inner cross structure
    const CROSS_WALL_BOUNDARY = 5;
    const crossWallSegments = [-10, 10]; // Segments are 10 units wide, centered at -10 and 10.

    // 1. Create Modular Floor and Ceiling
    const ceilingMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        opacity: { value: 1.0 }
      },
      vertexShader: ceilingVertexShader,
      fragmentShader: ceilingFragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
    });

    // Define the area to cut out (30x30 room centered in the 50x50 space)
    const HOLE_SIZE = 30; // 30x30 room
    const HOLE_HALF_SIZE = HOLE_SIZE / 2;

    for (let i = 0; i < NUM_SEGMENTS; i++) {
      for (let j = 0; j < NUM_SEGMENTS; j++) {
        const segmentCenterX = (i - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;
        const segmentCenterZ = (j - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;
        
        // Check if this segment is within the 30x30 area (segments centered at -10, 0, 10)
        const isCentral3x3Segment = Math.abs(segmentCenterX) <= 10 && Math.abs(segmentCenterZ) <= 10;
        
        let floorMaterialToUse = placeholderFloorMaterial; // Default to ETN logo floor (outer 50x50)

        if (isCentral3x3Segment) {
          // If it's within the 30x30 center, use concrete material
          floorMaterialToUse = concreteMaterial;
        } 
        
        // Floor Segment
        const floorSegment = new THREE.Mesh(segmentGeometry, floorMaterialToUse);
        floorSegment.rotation.x = Math.PI / 2;
        floorSegment.position.x = segmentCenterX;
        floorSegment.position.z = segmentCenterZ;
        scene.add(floorSegment);
        
        // Only add segments that need the async texture update (ETN logo floor) to the list
        if (floorMaterialToUse === placeholderFloorMaterial) {
          floorSegments.push(floorSegment);
        }

        // Ceiling Segment (Always create ceiling)
        const ceiling = new THREE.Mesh(segmentGeometry, ceilingMaterial);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.x = segmentCenterX;
        ceiling.position.z = segmentCenterZ;
        ceiling.position.y = WALL_HEIGHT + 0.01; // Positioned slightly above the new wall height (16.01)
        scene.add(ceiling);
      }
    }

    // Asynchronously create and apply the custom floor texture to the segments that need it
    createCustomFloorTexture((texture) => {
      const newFloorMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.2,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });
      floorSegments.forEach(segment => {
        // Dispose of the placeholder material before replacing it
        if (segment.material === placeholderFloorMaterial) {
          segment.material.dispose();
          segment.material = newFloorMaterial;
        }
      });
      placeholderFloorMaterial.dispose();
    });

    // --- START OUTER ROOM SETUP (50x50) ---
    const INNER_WALL_BOUNDARY = halfRoomSize;
    const innerWallMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8, metalness: 0.1 });

    // Wall segments are 8m high (LOWER_WALL_HEIGHT)
    // wallSegmentGeometry is already defined above.
    const LOWER_WALL_CENTER_Y = LOWER_WALL_HEIGHT / 2; // 4.0
    const UPPER_WALL_CENTER_Y = LOWER_WALL_HEIGHT + LOWER_WALL_CENTER_Y; // 12.0

    innerSegmentCenters.forEach((segmentCenter, i) => {
      const index = i;

      // --- LOWER WALLS (Y=4.0) ---
      // North Outer Wall (Z = -25)
      const northWallKey = `north-wall-${index}`;
      const northLowerWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      northLowerWall.position.set(segmentCenter, LOWER_WALL_CENTER_Y, -INNER_WALL_BOUNDARY);
      scene.add(northLowerWall);
      wallMeshesRef.current.set(northWallKey, northLowerWall);

      // South Outer Wall (Z = 25)
      const southWallKey = `south-wall-${index}`;
      const southLowerWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      southLowerWall.position.set(segmentCenter, LOWER_WALL_CENTER_Y, INNER_WALL_BOUNDARY);
      scene.add(southLowerWall);
      wallMeshesRef.current.set(southWallKey, southLowerWall);

      // East Outer Wall (X = 25)
      const eastWallKey = `east-wall-${index}`;
      const eastLowerWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      eastLowerWall.rotation.y = -Math.PI / 2;
      eastLowerWall.position.set(INNER_WALL_BOUNDARY, LOWER_WALL_CENTER_Y, segmentCenter);
      scene.add(eastLowerWall);
      wallMeshesRef.current.set(eastWallKey, eastLowerWall);

      // West Outer Wall (X = -25)
      const westWallKey = `west-wall-${index}`;
      const westLowerWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      westLowerWall.rotation.y = Math.PI / 2;
      westLowerWall.position.set(-INNER_WALL_BOUNDARY, LOWER_WALL_CENTER_Y, segmentCenter);
      scene.add(westLowerWall);
      wallMeshesRef.current.set(westWallKey, westLowerWall);

      // --- UPPER WALLS (Y=12.0) ---
      // North Outer Wall (Z = -25)
      const northUpperWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      northUpperWall.position.set(segmentCenter, UPPER_WALL_CENTER_Y, -INNER_WALL_BOUNDARY);
      scene.add(northUpperWall);

      // South Outer Wall (Z = 25)
      const southUpperWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      southUpperWall.position.set(segmentCenter, UPPER_WALL_CENTER_Y, INNER_WALL_BOUNDARY);
      scene.add(southUpperWall);

      // East Outer Wall (X = 25)
      const eastUpperWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      eastUpperWall.rotation.y = -Math.PI / 2;
      eastUpperWall.position.set(INNER_WALL_BOUNDARY, UPPER_WALL_CENTER_Y, segmentCenter);
      scene.add(eastUpperWall);

      // West Outer Wall (X = -25)
      const westUpperWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      westUpperWall.rotation.y = Math.PI / 2;
      westUpperWall.position.set(-INNER_WALL_BOUNDARY, UPPER_WALL_CENTER_Y, segmentCenter);
      scene.add(westUpperWall);
    });

    // --- START INNER ROOM CROSS SETUP (Walls at X/Z = +/- 5) ---
    // Only create lower walls for the inner 30x30 area
    crossWallSegments.forEach((segmentCenter, i) => {
      const index = i;

      // 1. North Walls (Z = -5)
      // Outer side (facing North, towards Z=-15)
      const northInnerOuterKey = `north-inner-wall-outer-${index}`;
      const northInnerOuterLowerWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      northInnerOuterLowerWall.position.set(segmentCenter, LOWER_WALL_CENTER_Y, -CROSS_WALL_BOUNDARY);
      scene.add(northInnerOuterLowerWall);
      wallMeshesRef.current.set(northInnerOuterKey, northInnerOuterLowerWall);

      // Inner side (facing South, towards Z=0)
      const northInnerInnerKey = `north-inner-wall-inner-${index}`;
      const northInnerInnerLowerWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      northInnerInnerLowerWall.position.set(segmentCenter, LOWER_WALL_CENTER_Y, -CROSS_WALL_BOUNDARY);
      scene.add(northInnerInnerLowerWall);
      wallMeshesRef.current.set(northInnerInnerKey, northInnerInnerLowerWall);

      // 2. South Walls (Z = 5)
      // Outer side (facing South, towards Z=15)
      const southInnerOuterKey = `south-inner-wall-outer-${index}`;
      const southInnerOuterLowerWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      southInnerOuterLowerWall.position.set(segmentCenter, LOWER_WALL_CENTER_Y, CROSS_WALL_BOUNDARY);
      scene.add(southInnerOuterLowerWall);
      wallMeshesRef.current.set(southInnerOuterKey, southInnerOuterLowerWall);

      // Inner side (facing North, towards Z=0)
      const southInnerInnerKey = `south-inner-wall-inner-${index}`;
      const southInnerInnerLowerWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      southInnerInnerLowerWall.position.set(segmentCenter, LOWER_WALL_CENTER_Y, CROSS_WALL_BOUNDARY);
      scene.add(southInnerInnerLowerWall);
      wallMeshesRef.current.set(southInnerInnerKey, southInnerInnerLowerWall);

      // 3. East Walls (X = 5)
      // Outer side (facing East, towards X=15)
      const eastInnerOuterKey = `east-inner-wall-outer-${index}`;
      const eastInnerOuterLowerWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      eastInnerOuterLowerWall.rotation.y = -Math.PI / 2;
      eastInnerOuterLowerWall.position.set(CROSS_WALL_BOUNDARY, LOWER_WALL_CENTER_Y, segmentCenter);
      scene.add(eastInnerOuterLowerWall);
      wallMeshesRef.current.set(eastInnerOuterKey, eastInnerOuterLowerWall);

      // Inner side (facing West, towards X=0)
      const eastInnerInnerKey = `east-inner-wall-inner-${index}`;
      const eastInnerInnerLowerWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      eastInnerInnerLowerWall.rotation.y = -Math.PI / 2;
      eastInnerInnerLowerWall.position.set(CROSS_WALL_BOUNDARY, LOWER_WALL_CENTER_Y, segmentCenter);
      scene.add(eastInnerInnerLowerWall);
      wallMeshesRef.current.set(eastInnerInnerKey, eastInnerInnerLowerWall);

      // 4. West Walls (X = -5)
      // Outer side (facing West, towards X=-15)
      const westInnerOuterKey = `west-inner-wall-outer-${index}`;
      const westInnerOuterLowerWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      westInnerOuterLowerWall.rotation.y = Math.PI / 2;
      westInnerOuterLowerWall.position.set(-CROSS_WALL_BOUNDARY, LOWER_WALL_CENTER_Y, segmentCenter);
      scene.add(westInnerOuterLowerWall);
      wallMeshesRef.current.set(westInnerOuterKey, westInnerOuterLowerWall);

      // Inner side (facing East, towards X=0)
      const westInnerInnerKey = `west-inner-wall-inner-${index}`;
      const westInnerInnerLowerWall = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial.clone());
      westInnerInnerLowerWall.rotation.y = Math.PI / 2;
      westInnerInnerLowerWall.position.set(-CROSS_WALL_BOUNDARY, LOWER_WALL_CENTER_Y, segmentCenter);
      scene.add(westInnerInnerLowerWall);
      wallMeshesRef.current.set(westInnerInnerKey, westInnerInnerLowerWall);
    });

    // --- CREATE FLOOR PLATFORM FOR 1ST FLOOR ---
    // Create a platform that covers the inner 30x30 area walls
    const platformGeometry = new THREE.PlaneGeometry(30, 30);
    const platformMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.7,
      metalness: 0.3,
      side: THREE.DoubleSide
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.rotation.x = Math.PI / 2;
    platform.position.set(0, 8.1, 0); // Positioned at the top of the lower walls (8m height)
    scene.add(platform);
    // --- END POOL AND FOUNTAIN ---
    
    // 4. Lighting Setup
    scene.add(new THREE.AmbientLight(0x404050, 1.0));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, WALL_HEIGHT, 0);
    scene.add(hemiLight);

    // --- Panel and Arrow Constants ---
    const panelGeometry = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
    const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide, transparent: true, opacity: 0 });

    const ARROW_COLOR_DEFAULT = 0xcccccc,
      ARROW_COLOR_HOVER = 0x00ff00;

    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15);
    arrowShape.lineTo(0.3, 0);
    arrowShape.lineTo(0, -0.15);
    arrowShape.lineTo(0, 0.15);
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: ARROW_COLOR_DEFAULT, side: THREE.DoubleSide });

    const ARROW_DEPTH_OFFSET = 0.15 + WALL_THICKNESS/2; // Adjust for thicker walls
    const ARROW_PANEL_OFFSET = 3.2; // Adjusted for 6m panel width (6/2 + 0.2 padding)
    // --- End Panel and Arrow Constants ---

    // Dynamic Panel Configuration Generation
    const dynamicPanelConfigs: { wallName: keyof PanelConfig, position: [number, number, number], rotation: [number, number, number] }[] = [];

    const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall'];
    const MAX_SEGMENT_INDEX = 4; // Outer 50x50 walls

    for (let i = 0; i <= MAX_SEGMENT_INDEX; i++) {
      for (const wallNameBase of WALL_NAMES) {
        const panelKey = `${wallNameBase}-${i}` as keyof PanelConfig;
        let x = 0, z = 0;
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
          wallName: panelKey,
          position: [finalX, PANEL_Y_POSITION, finalZ],
          rotation: rotation,
        });
      }
    }

    // Inner 30x30 cross walls (at X/Z = +/- 5)
    // We reuse CROSS_WALL_BOUNDARY and crossWallSegments defined earlier in the useEffect scope.
    crossWallSegments.forEach((segmentCenter, i) => {
      const index = i;

      // 1. North Walls (Z = -5)
      // Outer side (facing North, towards Z=-15)
      dynamicPanelConfigs.push({
        wallName: `north-inner-wall-outer-${index}` as keyof PanelConfig,
        position: [segmentCenter, PANEL_Y_POSITION, -CROSS_WALL_BOUNDARY - ARROW_DEPTH_OFFSET],
        rotation: [0, Math.PI, 0], // Facing North (negative Z)
      });
      // Inner side (facing South, towards Z=0)
      dynamicPanelConfigs.push({
        wallName: `north-inner-wall-inner-${index}` as keyof PanelConfig,
        position: [segmentCenter, PANEL_Y_POSITION, -CROSS_WALL_BOUNDARY + ARROW_DEPTH_OFFSET],
        rotation: [0, 0, 0], // Facing South (positive Z)
      });

      // 2. South Walls (Z = 5)
      // Outer side (facing South, towards Z=15)
      dynamicPanelConfigs.push({
        wallName: `south-inner-wall-outer-${index}` as keyof PanelConfig,
        position: [segmentCenter, PANEL_Y_POSITION, CROSS_WALL_BOUNDARY + ARROW_DEPTH_OFFSET],
        rotation: [0, 0, 0], // Facing South (positive Z)
      });
      // Inner side (facing North, towards Z=0)
      dynamicPanelConfigs.push({
        wallName: `south-inner-wall-inner-${index}` as keyof PanelConfig,
        position: [segmentCenter, PANEL_Y_POSITION, CROSS_WALL_BOUNDARY - ARROW_DEPTH_OFFSET],
        rotation: [0, Math.PI, 0], // Facing North (negative Z)
      });

      // 3. East Walls (X = 5)
      // Outer side (facing East, towards X=15)
      dynamicPanelConfigs.push({
        wallName: `east-inner-wall-outer-${index}` as keyof PanelConfig,
        position: [CROSS_WALL_BOUNDARY + ARROW_DEPTH_OFFSET, PANEL_Y_POSITION, segmentCenter],
        rotation: [0, Math.PI / 2, 0], // Facing East (positive X)
      });
      // Inner side (facing West, towards X=0)
      dynamicPanelConfigs.push({
        wallName: `east-inner-wall-inner-${index}` as keyof PanelConfig,
        position: [CROSS_WALL_BOUNDARY - ARROW_DEPTH_OFFSET, PANEL_Y_POSITION, segmentCenter],
        rotation: [0, -Math.PI / 2, 0], // Facing West (negative X)
      });

      // 4. West Walls (X = -5)
      // Outer side (facing West, towards X=-15)
      dynamicPanelConfigs.push({
        wallName: `west-inner-wall-outer-${index}` as keyof PanelConfig,
        position: [-CROSS_WALL_BOUNDARY - ARROW_DEPTH_OFFSET, PANEL_Y_POSITION, segmentCenter],
        rotation: [0, -Math.PI / 2, 0], // Facing West (negative X)
      });
      // Inner side (facing East, towards X=0)
      dynamicPanelConfigs.push({
        wallName: `west-inner-wall-inner-${index}` as keyof PanelConfig,
        position: [-CROSS_WALL_BOUNDARY + ARROW_DEPTH_OFFSET, PANEL_Y_POSITION, segmentCenter],
        rotation: [0, Math.PI / 2, 0], // Facing East (positive X)
      });
    });

    // Clear existing panels before populating
    panelsRef.current = [];

    dynamicPanelConfigs.forEach(config => {
      const mesh = new THREE.Mesh(panelGeometry, panelMaterial.clone());
      mesh.position.set(config.position[0], config.position[1], config.position[2]);
      mesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      scene.add(mesh);

      const wallRotation = new THREE.Euler(config.rotation[0], config.rotation[1], config.rotation[2], 'XYZ');
      const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);
      const basePosition = new THREE.Vector3(config.position[0], config.position[1], config.position[2]);

      const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      prevArrow.rotation.set(config.rotation[0], config.rotation[1] + Math.PI, config.rotation[2]);
      const prevPosition = new THREE.Vector3(config.position[0], config.position[1], config.position[2]).addScaledVector(rightVector, -ARROW_PANEL_OFFSET);
      prevArrow.position.copy(prevPosition);
      scene.add(prevArrow);

      const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      nextArrow.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const nextPosition = new THREE.Vector3(config.position[0], config.position[1], config.position[2]).addScaledVector(rightVector, ARROW_PANEL_OFFSET);
      nextArrow.position.copy(nextPosition);
      scene.add(nextArrow);

      const panel: Panel = {
        mesh,
        wallName: config.wallName as keyof PanelConfig,
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

    let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
    const velocity = new THREE.Vector3(),
      direction = new THREE.Vector3(),
      speed = 20.0;

    // Collision constants - only outer boundary remains critical for simple controls
    const WALL_COLLISION_OFFSET = WALL_THICKNESS / 2; // Account for wall thickness in collision detection

    // The internal walls are thin meshes, relying on the player not clipping through them too much.

    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);
    const interactiveMeshes = panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow]);

    const onDocumentMouseDown = () => {
      if (!controls.isLocked) return;

      if (currentTargetedArrow) {
        const panel = panelsRef.current.find(p => p.prevArrow === currentTargetedArrow || p.nextArrow === currentTargetedArrow);
        if (panel) {
          const direction = currentTargetedArrow === panel.nextArrow ? 'next' : 'prev';
          if (updatePanelIndex(panel.wallName, direction)) {
            const newSource = getCurrentNftSource(panel.wallName);
            updatePanelContent(panel, newSource);
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
      }
    };
    document.addEventListener('mousedown', onDocumentMouseDown);

    let prevTime = performance.now();
    const startTime = performance.now();

    const animate = () => {
      requestAnimationFrame(animate);

      const time = performance.now(),
        delta = (time - prevTime) / 1000;
      const elapsedTime = (time - startTime) / 1000;
      
      // Update ceiling shader time uniform
      if (ceilingMaterial.uniforms) {
        ceilingMaterial.uniforms.time.value = elapsedTime;
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

        // --- Collision Detection (Only outer 50x50 boundary enforced) ---
        camera.position.x = Math.max(-boundary, Math.min(boundary, camera.position.x));
        camera.position.z = Math.max(-boundary, Math.min(boundary, camera.position.z));
        camera.position.y = 1.6;

        raycaster.setFromCamera(center, camera);
        const intersects = raycaster.intersectObjects(panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow]));

        panelsRef.current.forEach(p => {
          (p.prevArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_DEFAULT);
          (p.nextArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_DEFAULT);
        });

        currentTargetedPanel = null;
        currentTargetedArrow = null;

        if (intersects.length > 0 && intersects[0].distance < 5) {
          const intersectedMesh = intersects[0].object as THREE.Mesh;
          const panel = panelsRef.current.find(p => p.mesh === intersectedMesh || p.prevArrow === intersectedMesh || p.nextArrow === intersectedMesh);

          if (panel) {
            if (intersectedMesh === panel.mesh) currentTargetedPanel = panel;
            else if (intersectedMesh === panel.prevArrow || intersectedMesh === panel.nextArrow) {
              currentTargetedArrow = intersectedMesh;
              (intersectedMesh.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_HOVER);
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
      console.log("WebGL Context Restored. Reloading all panel content...");
      for (const panel of panelsRef.current) {
        const source = getCurrentNftSource(panel.wallName);
        if (source) {
          await updatePanelContent(panel, source);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      manageVideoPlayback(controls.isLocked);
    };

    // Context Loss Handling
    const canvas = renderer.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn("WebGL Context Lost. Screen may go white.");
    };

    const handleContextRestored = () => {
      console.log("WebGL Context Restored. Reinitializing resources.");
      reloadAllPanelContent();
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    const fetchAndRenderPanelsSequentially = async () => {
      await initializeGalleryConfig();

      // Apply wall colors from config
      for (const [panelKey, config] of Object.entries(GALLERY_PANEL_CONFIG)) {
        if (config.wall_color) {
          const wallMesh = wallMeshesRef.current.get(panelKey);
          if (wallMesh && wallMesh.material instanceof THREE.MeshStandardMaterial) {
            wallMesh.material.color.set(config.wall_color);
          }
        }
      }

      // Process panels sequentially
      for (const panel of panelsRef.current) {
        const source = getCurrentNftSource(panel.wallName);
        await updatePanelContent(panel, source);
        await new Promise(resolve => setTimeout(resolve, 100));
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

      // Cleanup individual video elements and Three.js resources
      panelsRef.current.forEach(panel => {
        if (panel.videoElement) {
          panel.videoElement.pause();
          panel.videoElement.removeAttribute('src');
        }
        if (panel.gifStopFunction) {
          panel.gifStopFunction();
        }
      });

      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => {
              if (m.map) m.map.dispose();
              m.dispose();
            });
          } else {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
        }
      });
      
      renderer.dispose();
      delete (window as any).galleryControls;
      currentTargetedPanel = null;
      currentTargetedArrow = null;
    };
  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback]);

  return (
    <>
      <div ref={mountRef} className="w-full h-full" />
      {marketBrowserState.open && (
        <MarketBrowserRefined
          collection={marketBrowserState.collection || ""}
          tokenId={marketBrowserState.tokenId || ""}
          open={marketBrowserState.open}
          onClose={() => setMarketBrowserState({ open: false })}
        />
      )}
    </>
  );
};

export default NftGallery;