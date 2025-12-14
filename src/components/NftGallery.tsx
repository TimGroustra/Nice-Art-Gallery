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
    
    // --- Window Materials and Geometries ---
    const GLASS_COLOR = 0xddddff;
    const FRAME_COLOR = 0xffffff;
    const upperWallCenterY = LOWER_WALL_HEIGHT + LOWER_WALL_HEIGHT / 2; // 12.0

    const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: GLASS_COLOR,
        metalness: 0.0,
        roughness: 0.1,
        transmission: 0.9,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
    });

    const frameMaterial = new THREE.MeshStandardMaterial({
        color: FRAME_COLOR,
        roughness: 0.5,
        metalness: 0.1,
    });

    const windowSegmentGeometry = new THREE.PlaneGeometry(ROOM_SEGMENT_SIZE, LOWER_WALL_HEIGHT); // 10x8 plane
    const postGeometry = new THREE.BoxGeometry(WALL_THICKNESS, LOWER_WALL_HEIGHT, WALL_THICKNESS); // 0.5 x 8 x 0.5
    const longFrameGeometry = new THREE.BoxGeometry(ROOM_SIZE + WALL_THICKNESS, WALL_THICKNESS, WALL_THICKNESS); // 50.5 x 0.5 x 0.5
    
    const postPositions = [-25, -15, -5, 5, 15, 25]; // 6 posts, 5 segments
    
    // Helper function to create windows for a given wall
    const createWindows = (wallName: string, rotationY: number, depthAxis: 'x' | 'z', depthSign: number) => {
        const depthOffset = halfRoomSize * depthSign; // Z = +/- 25 or X = +/- 25
        const glassZOffset = WALL_THICKNESS / 2 * depthSign; // Offset for glass plane to sit inside the frame
        
        // Top Frame (Y=16)
        const topFrame = new THREE.Mesh(longFrameGeometry, frameMaterial.clone());
        topFrame.rotation.y = rotationY;
        if (depthAxis === 'z') {
            topFrame.position.set(0, WALL_HEIGHT - WALL_THICKNESS / 2, depthOffset);
        } else {
            topFrame.position.set(depthOffset, WALL_HEIGHT - WALL_THICKNESS / 2, 0);
        }
        scene.add(topFrame);

        // Bottom Frame (Y=8)
        const bottomFrame = new THREE.Mesh(longFrameGeometry, frameMaterial.clone());
        bottomFrame.rotation.y = rotationY;
        if (depthAxis === 'z') {
            bottomFrame.position.set(0, LOWER_WALL_HEIGHT + WALL_THICKNESS / 2, depthOffset);
        } else {
            bottomFrame.position.set(depthOffset, LOWER_WALL_HEIGHT + WALL_THICKNESS / 2, 0);
        }
        scene.add(bottomFrame);

        // Vertical Posts and Glass Panes
        for (let i = 0; i < postPositions.length; i++) {
            const postCenter = postPositions[i];
            
            // Vertical Post
            const post = new THREE.Mesh(postGeometry, frameMaterial.clone());
            post.rotation.y = rotationY;
            if (depthAxis === 'z') {
                post.position.set(postCenter, upperWallCenterY, depthOffset);
            } else {
                post.position.set(depthOffset, upperWallCenterY, postCenter);
            }
            scene.add(post);
            
            // Glass Pane (5 segments, between posts)
            if (i < postPositions.length - 1) {
                const segmentCenterX = (postPositions[i] + postPositions[i+1]) / 2;
                const glass = new THREE.Mesh(windowSegmentGeometry, glassMaterial.clone());
                glass.rotation.y = rotationY;
                
                if (depthAxis === 'z') {
                    glass.position.set(segmentCenterX, upperWallCenterY, depthOffset + glassZOffset);
                } else {
                    glass.position.set(depthOffset + glassZOffset, upperWallCenterY, segmentCenterX);
                }
                scene.add(glass);
            }
        }
    };
    
    // --- NEW: Create Outer Walls (50x8, Lower Segment) ---
    const lowerOuterWallGeometry = new THREE.BoxGeometry(ROOM_SIZE + WALL_THICKNESS, LOWER_WALL_HEIGHT, WALL_THICKNESS); 
    const halfLowerWallHeight = LOWER_WALL_HEIGHT / 2; // 4.0

    // North Wall (Z = -25)
    const northWall = new THREE.Mesh(lowerOuterWallGeometry, wallMaterial.clone());
    northWall.position.set(0, halfLowerWallHeight, -halfRoomSize); // Center Y is 4.0
    scene.add(northWall);
    
    // South Wall (Z = 25)
    const southWall = new THREE.Mesh(lowerOuterWallGeometry, wallMaterial.clone());
    southWall.position.set(0, halfLowerWallHeight, halfRoomSize);
    scene.add(southWall);
    
    // East Wall (X = 25)
    const eastWall = new THREE.Mesh(lowerOuterWallGeometry, wallMaterial.clone());
    eastWall.rotation.y = Math.PI / 2;
    eastWall.position.set(halfRoomSize, halfLowerWallHeight, 0);
    scene.add(eastWall);
    
    // West Wall (X = -25)
    const westWall = new THREE.Mesh(lowerOuterWallGeometry, wallMaterial.clone());
    westWall.rotation.y = Math.PI / 2;
    westWall.position.set(-halfRoomSize, halfLowerWallHeight, 0);
    scene.add(westWall);
    
    // --- NEW: Create Panoramic Windows (Y=8 to Y=16) ---
    createWindows('north-wall', 0, 'z', -1);
    createWindows('south-wall', Math.PI, 'z', 1);
    createWindows('east-wall', Math.PI / 2, 'x', 1);
    createWindows('west-wall', -Math.PI / 2, 'x', -1);

    // --- NEW: Create Inner Cross Walls (8m high, 10m segments) ---
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
// ... (rest of the file)