import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';
import { createGifTexture } from '@/utils/gifTexture';
import { MarketBrowserRefined } from '@/components/MarketBrowserRefined';

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
let currentTargetedButton: THREE.Mesh | null = null; // New global state for button

// --- GLSL Shader Code for Pulsing Rainbow Platform Underside ---
const platformVertexShader = `
 varying vec2 vUv;
 void main() {
   vUv = uv;
   gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
 }
`;

const platformFragmentShader = `
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
// --- End GLSL Shader Code for Platform Underside ---

// --- GLSL Shader Code for Starry Night Ceiling ---
const starryNightVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const starryNightFragmentShader = `
  uniform float time;
  uniform vec2 resolution;
  
  // Hash function for pseudo-random numbers
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(41.41, 28.28))) * 43758.5453);
  }

  // 3D Noise function (simplified for 2D use with time)
  float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    
    vec2 uv = (p.xy + vec2(37.0, 17.0) * p.z) + f.xy;
    vec2 rg = textureLod(iChannel0, (uv + 0.5) / 256.0, 0.0).yx;
    return mix(rg.x, rg.y, f.z);
  }
  
  // Star field generation
  float star(vec2 uv, float flare) {
    float d = length(uv);
    float m = 0.05 + 0.05 * sin(time * 0.1);
    float star_shape = 0.01 / d;
    float star_glow = 0.001 / (d * d);
    return star_shape + star_glow * flare;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = uv * 10.0;
    vec3 color = vec3(0.0);
    
    // 1. Nebula background (slowly shifting noise)
    float n = hash(floor(p * 0.5));
    float nebula_speed = time * 0.01;
    float nebula_scale = 0.5;
    
    // Use a simple noise pattern for nebulas
    float nebula_noise = hash(p * 0.1 + nebula_speed);
    nebula_noise += hash(p * 0.2 + nebula_speed * 1.5) * 0.5;
    nebula_noise = fract(nebula_noise);
    
    // Color the nebula (electric blue/purple shift)
    vec3 nebula_color = mix(vec3(0.1, 0.1, 0.3), vec3(0.0, 0.5, 0.5), nebula_noise);
    color += nebula_color * 0.5;
    
    // 2. Star field
    p = uv * 100.0;
    vec2 grid = floor(p);
    vec2 f = fract(p);
    
    // Add subtle movement to stars
    vec2 offset = vec2(sin(time * 0.05), cos(time * 0.03)) * 0.1;
    
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        vec2 g = grid + vec2(float(i), float(j));
        float h = hash(g);
        
        // Star position within the cell
        vec2 center = vec2(h, fract(h * 10.0)) + offset;
        
        // Only draw bright stars based on hash threshold
        if (h > 0.99) {
          float flare = h * 10.0;
          vec3 star_color = mix(vec3(1.0, 0.9, 0.8), vec3(0.8, 0.9, 1.0), fract(h * 100.0));
          color += star_color * star(f - center, flare);
        }
      }
    }
    
    gl_FragColor = vec4(color, 1.0);
  }
`;
// --- End GLSL Shader Code for Starry Night Ceiling ---


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
  const [marketBrowserState, setMarketBrowserState] = useState<{ 
    open: boolean; 
    collection?: string; 
    tokenId?: string | number; 
  }>({ open: false });
  
  // Refs for teleport functionality
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  
  // Teleport state management
  const isTeleportingRef = useRef(false);
  const fadeStartTimeRef = useRef(0);
  const FADE_DURATION = 0.5; // seconds

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
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xaaaaaa);
    
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
    const halfRoomSize = ROOM_SIZE / 2; // 25
    const segmentGeometry = new THREE.PlaneGeometry(ROOM_SEGMENT_SIZE, ROOM_SEGMENT_SIZE);
    
    // Increase wall thickness by using BoxGeometry instead of PlaneGeometry
    const WALL_THICKNESS = 0.5; // Increased from 0 to 0.5 units thick
    
    // Define the boundary for the outer walls where panels are placed (50 / 2 = 25)
    const INNER_WALL_BOUNDARY = ROOM_SIZE / 2; // 25

    // Define wall segment geometry once
    const wallSegmentGeometry = new THREE.BoxGeometry(ROOM_SEGMENT_SIZE, LOWER_WALL_HEIGHT, WALL_THICKNESS);
    const wallMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x666666, 
      roughness: 0.8, 
      metalness: 0.1 
    });
    
    // --- NEW: Create Outer Walls (50x16) ---
    const outerWallGeometry = new THREE.BoxGeometry(ROOM_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS); // Add thickness buffer
    const halfWallHeight = WALL_HEIGHT / 2; // 8.0
    
    // North Wall (Z = -25)
    const northWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    northWall.position.set(0, halfWallHeight, -halfRoomSize);
    scene.add(northWall);
    
    // South Wall (Z = 25)
    const southWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    southWall.position.set(0, halfWallHeight, halfRoomSize);
    scene.add(southWall);
    
    // East Wall (X = 25)
    const eastWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    eastWall.rotation.y = Math.PI / 2;
    eastWall.position.set(halfRoomSize, halfWallHeight, 0);
    scene.add(eastWall);
    
    // West Wall (X = -25)
    const westWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    westWall.rotation.y = Math.PI / 2;
    westWall.position.set(-halfRoomSize, halfWallHeight, 0);
    scene.add(westWall);
    
    // --- NEW: Create Inner Cross Walls (8m high, 10m segments) ---
    const halfLowerWallHeight = LOWER_WALL_HEIGHT / 2; // 4.0
    const CROSS_WALL_BOUNDARY = 5;
    const crossWallSegments = [-10, 10];
    
    // Horizontal Walls (Z = +/- 5)
    crossWallSegments.forEach(segmentCenter => { 
        // Z = -CROSS_WALL_BOUNDARY (-5)
        let wall1 = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
        wall1.position.set(segmentCenter, halfLowerWallHeight, -CROSS_WALL_BOUNDARY);
        scene.add(wall1);

        // Z = CROSS_WALL_BOUNDARY (5)
        let wall2 = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
        wall2.position.set(segmentCenter, halfLowerWallHeight, CROSS_WALL_BOUNDARY);
        scene.add(wall2);
    });

    // Vertical Walls (X = +/- 5)
    crossWallSegments.forEach(segmentCenter => { 
        // X = -CROSS_WALL_BOUNDARY (-5)
        let wall3 = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
        wall3.rotation.y = Math.PI / 2;
        wall3.position.set(-CROSS_WALL_BOUNDARY, halfLowerWallHeight, segmentCenter);
        scene.add(wall3);

        // X = CROSS_WALL_BOUNDARY (5)
        let wall4 = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
        wall4.rotation.y = Math.PI / 2;
        wall4.position.set(CROSS_WALL_BOUNDARY, halfLowerWallHeight, segmentCenter);
        scene.add(wall4);
    });
    
    // --- Floor Texture and Material ---
    const floorSegments: THREE.Mesh[] = [];
    
    // 1. Concrete Material (Synchronous) - Used for the central 30x30 area
    const createConcreteMaterial = () => {
      const canvasSize = 128;
      const canvas = document.createElement('canvas');
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) return new THREE.MeshStandardMaterial({ 
        color: 0x555555, 
        roughness: 0.9, 
        metalness: 0.0, 
        side: THREE.DoubleSide 
      });
      
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
    
    // 1. Create Modular Floor and Ceiling
    
    // Material for the pulsing rainbow effect (under platform)
    const platformShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        opacity: { value: 1.0 }
      },
      vertexShader: platformVertexShader,
      fragmentShader: platformFragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
    });
    
    // Material for the starry night effect (main ceiling)
    const starryNightMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        // iChannel0 is a placeholder for a texture, but we'll rely on procedural noise for simplicity
      },
      vertexShader: starryNightVertexShader,
      fragmentShader: starryNightFragmentShader,
      side: THREE.DoubleSide,
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
        
        // Ceiling Segment (Use starry night material for the main ceiling)
        const ceiling = new THREE.Mesh(segmentGeometry, starryNightMaterial);
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
    
    // --- CREATE FLOOR PLATFORM FOR 1ST FLOOR ---
    // Calculate new platform Y to sit above 8m walls (LOWER_WALL_HEIGHT)
    const PLATFORM_Y = LOWER_WALL_HEIGHT + WALL_THICKNESS / 2 + 0.01; // 8.0 + 0.25 + 0.01 = 8.26
    
    // Create a platform that covers the inner 30x30 area walls with same thickness as walls
    const platformGeometry = new THREE.BoxGeometry(30, WALL_THICKNESS, 30); // Make it thick like walls
    const platform = new THREE.Mesh(platformGeometry, concreteMaterial.clone()); // Use concrete material
    platform.position.set(0, PLATFORM_Y, 0); // Positioned at the top of the lower walls, adjusted for thickness
    scene.add(platform);
    
    // --- Add Shader Plane underneath the 1st floor platform (30x30 area) ---
    const shaderPlaneGeometry = new THREE.PlaneGeometry(HOLE_SIZE, HOLE_SIZE); // 30x30
    const shaderPlane = new THREE.Mesh(shaderPlaneGeometry, platformShaderMaterial);
    
    // Position calculation: SHADER_PLANE_Y should be exactly at Y=8.0 (top of the lower walls)
    const SHADER_PLANE_Y = LOWER_WALL_HEIGHT; // 8.0
    
    shaderPlane.rotation.x = -Math.PI / 2; // Rotate to face downwards
    shaderPlane.position.set(0, SHADER_PLANE_Y, 0);
    scene.add(shaderPlane);
    
    // --- Teleport Button Setup ---
    const TELEPORT_BUTTON_COLOR = 0x1a3f7c; // Dark blue base
    const TELEPORT_BUTTON_HOVER_COLOR = 0x00ffff; // Bright cyan hover
    const TELEPORT_BUTTON_RADIUS = 1.0;
    const TELEPORT_BUTTON_HEIGHT = 0.2;
    const PLAYER_HEIGHT = 1.6;
    
    const buttonGeometry = new THREE.CylinderGeometry(TELEPORT_BUTTON_RADIUS, TELEPORT_BUTTON_RADIUS, TELEPORT_BUTTON_HEIGHT, 32);
    const buttonMaterial = new THREE.MeshStandardMaterial({ 
        color: TELEPORT_BUTTON_COLOR, 
        emissive: TELEPORT_BUTTON_COLOR, 
        emissiveIntensity: 0.5,
        roughness: 0.1, // Added standard material properties
        metalness: 0.9,
    });
    
    // Ground Floor Button (Teleports to 1st floor)
    const GROUND_BUTTON_Y = 0.1 + TELEPORT_BUTTON_HEIGHT / 2; // 0.2
    // Target Y: PLATFORM_Y + Player height (1.6) + half wall thickness (0.25) = 8.26 + 1.6 + 0.25 = 10.11
    const FIRST_FLOOR_TARGET_Y = PLATFORM_Y + PLAYER_HEIGHT + WALL_THICKNESS / 2; 
    
    const groundButton = new THREE.Mesh(buttonGeometry, buttonMaterial.clone());
    groundButton.position.set(0, GROUND_BUTTON_Y, 0);
    groundButton.userData = { isTeleportButton: true, targetY: FIRST_FLOOR_TARGET_Y };
    scene.add(groundButton);
    
    // First Floor Button (Teleports to Ground floor)
    // Button Y: PLATFORM_Y + half wall thickness (0.25) + half button height (0.1) = 8.26 + 0.25 + 0.1 = 8.61
    const FIRST_FLOOR_BUTTON_Y = PLATFORM_Y + WALL_THICKNESS / 2 + TELEPORT_BUTTON_HEIGHT / 2; 
    const GROUND_FLOOR_TARGET_Y = PLAYER_HEIGHT; // 1.6
    
    const firstFloorButton = new THREE.Mesh(buttonGeometry, buttonMaterial.clone());
    firstFloorButton.position.set(0, FIRST_FLOOR_BUTTON_Y, 0);
    firstFloorButton.userData = { isTeleportButton: true, targetY: GROUND_FLOOR_TARGET_Y };
    scene.add(firstFloorButton);
    
    const teleportButtons = [groundButton, firstFloorButton];
    
    // --- Teleport Fade Overlay Setup ---
    const fadeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false });
    const fadeGeometry = new THREE.PlaneGeometry(100, 100);
    const fadeScreen = new THREE.Mesh(fadeGeometry, fadeMaterial);
    fadeScreen.renderOrder = 999; // Ensure it renders last
    scene.add(fadeScreen);
    
    const performTeleport = (targetY: number) => {
        if (isTeleportingRef.current) return;
        isTeleportingRef.current = true;
        fadeStartTimeRef.current = performance.now();
        
        // Unlock controls during teleport to prevent movement during fade
        controls.unlock(); 
        
        // The actual teleport happens mid-fade
        setTimeout(() => {
            camera.position.y = targetY;
            // Re-lock controls after teleport
            controls.lock(); 
        }, FADE_DURATION * 1000); // Wait for full fade in (0.5s) before teleporting and starting fade out
    };
    
    // 4. Lighting Setup
    scene.add(new THREE.AmbientLight(0x404050, 1.0));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, WALL_HEIGHT, 0);
    scene.add(hemiLight);
    
    // --- Panel and Arrow Constants ---
    const panelGeometry = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
    const panelMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x333333, 
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0
    });
    
    const ARROW_COLOR_DEFAULT = 0xcccccc,
      ARROW_COLOR_HOVER = 0x00ff00;
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15);
    arrowShape.lineTo(0.3, 0);
    arrowShape.lineTo(0, -0.15);
    arrowShape.lineTo(0, 0.15);
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const arrowMaterial = new THREE.MeshBasicMaterial({ 
      color: ARROW_COLOR_DEFAULT, 
      side: THREE.DoubleSide 
    });
    
    const ARROW_DEPTH_OFFSET = 0.15 + WALL_THICKNESS/2; // Adjust for thicker walls
    const ARROW_PANEL_OFFSET = 3.2; // Adjusted for 6m panel width (6/2 + 0.2 padding)
    // --- End Panel and Arrow Constants ---
    
    // Dynamic Panel Configuration Generation
    const dynamicPanelConfigs: { 
      wallName: keyof PanelConfig, 
      position: [number, number, number], 
      rotation: [number, number, number] 
    }[] = [];
    
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
    // We reuse CROSS_WALL_BOUNDARY and crossWallSegments defined earlier in the geometry setup section.
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
    
    // Include teleport buttons in interactive meshes
    const interactiveMeshes = panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow]).concat(teleportButtons);
    
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
          setMarketBrowserState({ open: true, collection: source.contractAddress, tokenId: source.tokenId });
          controls.unlock();
        }
      } else if (currentTargetedButton) {
        // New teleport logic
        performTeleport(currentTargetedButton.userData.targetY);
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
      
      // Update shader time uniforms
      if (platformShaderMaterial.uniforms) {
        platformShaderMaterial.uniforms.time.value = elapsedTime;
      }
      if (starryNightMaterial.uniforms) {
        starryNightMaterial.uniforms.time.value = elapsedTime;
      }
      
      // --- Teleport Fade Animation ---
      if (isTeleportingRef.current) {
          const elapsed = (time - fadeStartTimeRef.current) / 1000;
          let opacity = 0;
          
          if (elapsed < FADE_DURATION) {
              // Fade in (0 to 1)
              opacity = Math.min(1, elapsed / FADE_DURATION);
          } else if (elapsed < FADE_DURATION * 2) {
              // Fade out (1 to 0)
              opacity = Math.max(0, 1 - (elapsed - FADE_DURATION) / FADE_DURATION);
          } else {
              // Animation finished
              isTeleportingRef.current = false;
              opacity = 0;
          }
          
          fadeMaterial.opacity = opacity;
          
          // Keep fade screen in front of camera
          fadeScreen.position.copy(camera.position);
          fadeScreen.position.add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.1));
          fadeScreen.quaternion.copy(camera.quaternion);
      }
      // --- End Teleport Fade Animation ---
      
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
        camera.position.y = camera.position.y; // Y position is handled by teleport
        
        raycaster.setFromCamera(center, camera);
        const intersects = raycaster.intersectObjects(interactiveMeshes);
        
        panelsRef.current.forEach(p => {
          (p.prevArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_DEFAULT);
          (p.nextArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_DEFAULT);
        });
        
        teleportButtons.forEach(b => {
            // Fixed TS errors by casting to MeshStandardMaterial
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
              // Fixed TS errors by casting to MeshStandardMaterial
              (intersectedMesh.material as THREE.MeshStandardMaterial).color.setHex(TELEPORT_BUTTON_HOVER_COLOR);
              (intersectedMesh.material as THREE.MeshStandardMaterial).emissive.setHex(TELEPORT_BUTTON_HOVER_COLOR);
          } else {
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
      }
      
      prevTime = time;
      renderer.render(scene, camera);
    };
    
    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      
      // Update resolution uniform for the starry night shader
      if (starryNightMaterial.uniforms) {
        starryNightMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
      }
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
      currentTargetedButton = null;
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