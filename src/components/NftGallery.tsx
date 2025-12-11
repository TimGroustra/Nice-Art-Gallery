import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource, NftAttribute } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';
import { createGifTexture } from '@/utils/gifTexture';
import { MarketBrowserRefined } from './MarketBrowserRefined';

// Initialize RectAreaLightUniformsLib immediately upon module load
RectAreaLightUniformsLib.init();

// Constants for geometry
const TEXT_PANEL_WIDTH = 2.5;
const TITLE_HEIGHT = 0.5;
const DESCRIPTION_HEIGHT = 1.5;
const ATTRIBUTES_HEIGHT = 1.5;
const DESCRIPTION_PANEL_HEIGHT = TITLE_HEIGHT + DESCRIPTION_HEIGHT;

// --- NEW ARCHITECTURE CONSTANTS ---
const WALL_HEIGHT = 12; // Much higher ceiling
const ROOM_SIZE = 50;
const HALF_ROOM = ROOM_SIZE / 2; // 25
const PILLAR_RADIUS = 0.5;
const PILLAR_HEIGHT = WALL_HEIGHT;
const NEON_COLOR = 0x00FFFF; // Cyan/Electric Blue
const NEON_INTENSITY = 1.5;
const WALL_COLOR = 0x111111; // Very dark wall color
const FLOOR_COLOR = 0x0a0a0a;
const PANEL_Y_POSITION = 3.0; // Higher up on the tall walls
const BOUNDARY = HALF_ROOM - PILLAR_RADIUS; // 24.5
const PANEL_OFFSET = 0.15; // Panel depth offset
const ARROW_PANEL_OFFSET = 1.5;
const TEXT_DEPTH_OFFSET = 0.16;
const TITLE_PANEL_WIDTH = 4.0;
const ARROW_COLOR_DEFAULT = 0xcccccc, ARROW_COLOR_HOVER = 0x00ff00;
// --- END NEW ARCHITECTURE CONSTANTS ---


// Define types for the panel objects
interface Panel {
  mesh: THREE.Mesh;
  wallName: keyof PanelConfig;
  metadataUrl: string;
  isVideo: boolean;
  isGif: boolean;
  prevArrow: THREE.Mesh;
  nextArrow: THREE.Mesh;
  titleMesh: THREE.Mesh;
  descriptionMesh: THREE.Mesh;
  attributesMesh: THREE.Mesh;
  wallTitleMesh: THREE.Mesh;
  currentDescription: string;
  descriptionScrollY: number;
  descriptionTextHeight: number;
  currentAttributes: NftAttribute[];
  videoElement: HTMLVideoElement | null;
  gifStopFunction: (() => void) | null;
}

// Global state for UI interaction
let currentTargetedPanel: Panel | null = null;
let currentTargetedArrow: THREE.Mesh | null = null;
let currentTargetedDescriptionPanel: Panel | null = null;

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


// Helper function to create a text texture using Canvas
const createTextTexture = (text: string, width: number, height: number, fontSize: number = 30, color: string = 'white', options: { scrollY?: number, wordWrap?: boolean } = {}): { texture: THREE.CanvasTexture, totalHeight: number } => {
    const { scrollY = 0, wordWrap = false } = options;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return { texture: new THREE.CanvasTexture(document.createElement('canvas')), totalHeight: 0 };

    const resolution = 512;
    canvas.width = resolution * (width / height);
    canvas.height = resolution;

    context.clearRect(0, 0, canvas.width, canvas.height);

    const actualFontSize = fontSize;
    context.font = `bold ${actualFontSize}px Arial`;
    context.fillStyle = color;
    
    const padding = 40;
    const lineHeight = actualFontSize * 1.2;
    let totalHeight = 0;

    if (wordWrap) {
        context.textAlign = 'left';
        context.textBaseline = 'top';
        let y = padding;
        const words = text.split(' ');
        let line = '';
        const maxTextWidth = canvas.width - 2 * padding;

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = context.measureText(testLine);
            const testWidth = metrics.width;

            if (testWidth > maxTextWidth && n > 0) {
                context.fillText(line, padding, y - scrollY);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        context.fillText(line, padding, y - scrollY);
        totalHeight = y + lineHeight - padding;
    } else {
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        totalHeight = lineHeight;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return { texture, totalHeight };
};

const createAttributesTextTexture = (attributes: NftAttribute[], width: number, height: number, fontSize: number, color: string = 'white'): { texture: THREE.CanvasTexture } => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return { texture: new THREE.CanvasTexture(document.createElement('canvas')) };

    const resolution = 512;
    canvas.width = resolution * (width / height);
    canvas.height = resolution;

    context.clearRect(0, 0, canvas.width, canvas.height);

    context.font = `bold ${fontSize}px Arial`;
    context.fillStyle = color;
    context.textAlign = 'left';
    context.textBaseline = 'top';

    const padding = 40;
    const lineHeight = fontSize * 1.2;
    let y = padding;
    const maxTextWidth = canvas.width - 2 * padding;

    if (!attributes || attributes.length === 0) {
        context.fillText('No attributes found.', padding, y);
    } else {
        attributes.forEach(attr => {
            if (attr.trait_type && attr.value) {
                const line = `${attr.trait_type}: ${attr.value}`;
                
                // Word wrapping logic
                const words = line.split(' ');
                let currentLine = '';
                for (let n = 0; n < words.length; n++) {
                    const testLine = currentLine + words[n] + ' ';
                    const metrics = context.measureText(testLine);
                    const testWidth = metrics.width;
                    if (testWidth > maxTextWidth && n > 0) {
                        context.fillText(currentLine, padding, y);
                        currentLine = words[n] + ' ';
                        y += lineHeight;
                    } else {
                        currentLine = testLine;
                    }
                }
                context.fillText(currentLine, padding, y);
                y += lineHeight;
            }
        });
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return { texture };
};

interface NftGalleryProps {
    setInstructionsVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

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

  const manageVideoPlayback = useCallback((shouldPlay: boolean) => {
    panelsRef.current.forEach(panel => {
        if (panel.videoElement) {
            if (shouldPlay) {
                const controlsLocked = (window as any).galleryControls?.isLocked?.() ?? false;
                if (controlsLocked) {
                    panel.videoElement.play().catch(e => console.warn("Video playback prevented:", e));
                }
            } else {
                panel.videoElement.pause();
            }
        }
    });
  }, []);

  const isVideoContent = (contentType: string, url: string) => {
      return !!(contentType.startsWith('video/') || url.match(/\.(mp4|webm|ogg)(\?|$)/i));
  };
  
  const isGifContent = (contentType: string, url: string) => {
      return !!(contentType === "image/gif" || url.match(/\.gif(\?|$)/i));
  };

  const disposeTextureSafely = (mesh: THREE.Mesh) => {
    if (mesh.material instanceof THREE.MeshBasicMaterial) {
      if (mesh.material.map && typeof mesh.material.map.dispose === 'function') {
        mesh.material.map.dispose();
        mesh.material.map = null;
      }
      mesh.material.dispose();
    }
  };

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
        
        loader.load(url, 
            (texture) => {
                resolve(texture);
            }, 
            undefined, 
            (error) => {
                console.error('Error loading texture:', url, error);
                showError(`Failed to load image: ${url.substring(0, 50)}...`);
                reject(error);
            }
        );
    });
  }, []);

  const updatePanelContent = useCallback(async (panel: Panel, source: NftSource | null) => {
    const collectionConfig = GALLERY_PANEL_CONFIG[panel.wallName];
    const collectionName = collectionConfig?.name || '...';
    const textColor = collectionConfig?.text_color || 'white';

    // --- 1. Always update Wall Title (Collection Name) first ---
    disposeTextureSafely(panel.wallTitleMesh);
    const { texture: wallTitleTexture } = createTextTexture(collectionName, 8, 0.75, 120, textColor, { wordWrap: false });
    (panel.wallTitleMesh.material as THREE.MeshBasicMaterial).map = wallTitleTexture;
    panel.wallTitleMesh.visible = true;
    // --- End Wall Title Update ---

    // --- 2. Reset NFT and Metadata panels ---
    disposeTextureSafely(panel.mesh);
    panel.mesh.material = new THREE.MeshBasicMaterial({ color: 0x333333 }); // Dark gray placeholder
    panel.metadataUrl = '';
    panel.isVideo = false;
    panel.isGif = false;
    if (panel.titleMesh) panel.titleMesh.visible = false;
    if (panel.descriptionMesh) panel.descriptionMesh.visible = false;
    if (panel.attributesMesh) panel.attributesMesh.visible = false;
    
    if (panel.videoElement) {
        panel.videoElement.pause();
        panel.videoElement.removeAttribute('src');
        panel.videoElement = null;
    }
    if (panel.gifStopFunction) {
        panel.gifStopFunction();
        panel.gifStopFunction = null;
    }
    
    if (!source || source.contractAddress === "") {
        const showArrows = collectionConfig && collectionConfig.tokenIds.length > 1;
        panel.prevArrow.visible = showArrows;
        panel.nextArrow.visible = showArrows;
        return;
    }

    // --- 3. Fetch Metadata ---
    const metadata: NftMetadata | null = await getCachedNftMetadata(source.contractAddress, source.tokenId);
    
    if (!metadata) {
        console.warn(`Skipping panel ${panel.wallName} (${source.contractAddress}/${source.tokenId}) due to metadata fetch failure.`);
        
        disposeTextureSafely(panel.mesh);
        const { texture: errorTexture } = createTextTexture("NFT Unavailable", 2, 2, 80, 'red', { wordWrap: false });
        panel.mesh.material = new THREE.MeshBasicMaterial({ map: errorTexture, side: THREE.DoubleSide });
        
        if (panel.titleMesh) panel.titleMesh.visible = false;
        if (panel.descriptionMesh) panel.descriptionMesh.visible = false;
        if (panel.attributesMesh) panel.attributesMesh.visible = false;
        
        return;
    }

    try {
      const contentUrl = metadata.contentUrl;
      const isVideo = isVideoContent(metadata.contentType, contentUrl);
      const isGif = isGifContent(metadata.contentType, contentUrl);
      
      const texture = await loadTexture(contentUrl, panel, metadata.contentType);
      
      // --- Main NFT Mesh Update ---
      disposeTextureSafely(panel.mesh);
      panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture });
      // --- End Main NFT Mesh Update ---

      panel.metadataUrl = metadata.source;
      panel.isVideo = isVideo;
      panel.isGif = isGif;

      // Title update
      disposeTextureSafely(panel.titleMesh);
      const { texture: titleTexture } = createTextTexture(metadata.title, TITLE_PANEL_WIDTH, TITLE_HEIGHT, 120, textColor, { wordWrap: false });
      (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTexture;
      panel.titleMesh.visible = true;

      // Description update
      disposeTextureSafely(panel.descriptionMesh);
      const descriptionText = metadata.description;
      const { texture: descriptionTexture, totalHeight } = createTextTexture(descriptionText, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, textColor, { wordWrap: true });
      (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = descriptionTexture;
      panel.descriptionMesh.visible = true;

      panel.currentDescription = descriptionText;
      panel.descriptionTextHeight = totalHeight;
      panel.descriptionScrollY = 0;

      // Attributes update
      disposeTextureSafely(panel.attributesMesh);
      const attributes = metadata.attributes || [];
      panel.currentAttributes = attributes;
      const { texture: attributesTexture } = createAttributesTextTexture(attributes, TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT, 40, textColor);
      (panel.attributesMesh.material as THREE.MeshBasicMaterial).map = attributesTexture;
      panel.attributesMesh.visible = true;

      showSuccess(isVideo ? `Loaded video NFT: ${metadata.title}` : isGif ? `Loaded animated GIF: ${metadata.title}` : `Loaded image NFT: ${metadata.title}`);
      
    } catch (error) {
      console.error(`Error loading NFT content for ${panel.wallName}:`, error);
      showError(`Failed to load NFT content for ${panel.wallName}. Displaying collection name only.`);
    }

    // --- 4. Update Arrow Visibility ---
    const showArrows = collectionConfig && collectionConfig.tokenIds.length > 1;
    panel.prevArrow.visible = showArrows;
    panel.nextArrow.visible = showArrows;
    // --- End Arrow Visibility Update ---

  }, [loadTexture]);
  
  // Helper function for creating RectAreaLights and visual glow
  const createCoveLighting = useCallback((
      scene: THREE.Scene,
      position: [number, number, number],
      rotation: [number, number, number],
      color: number,
      intensity: number,
      width: number,
      height: number,
      order: THREE.EulerOrder = 'XYZ'
  ) => {
      const rectLight = new THREE.RectAreaLight(color, intensity, width, height);
      rectLight.position.set(...position);
      rectLight.rotation.set(rotation[0], rotation.length > 1 ? rotation[1] : 0, rotation.length > 2 ? rotation[2] : 0, order);
      scene.add(rectLight);

      // Visual glow mesh
      const glowGeo = new THREE.BoxGeometry(width, height, 0.02);
      const glowMat = new THREE.MeshBasicMaterial({ color: color, toneMapped: false, side: THREE.DoubleSide });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      glowMesh.position.set(...position);
      glowMesh.rotation.set(rotation[0], rotation.length > 1 ? rotation[1] : 0, rotation.length > 2 ? rotation[2] : 0, order);
      scene.add(glowMesh);
  }, []);


  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Dark background
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, -20); // Start in the outer corridor
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
    const PILLAR_COLLISION_RADIUS = PILLAR_RADIUS + 0.5; // Player radius 0.5 + Pillar radius 0.5 = 1.0

    const wallMaterial = new THREE.MeshStandardMaterial({ color: WALL_COLOR, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });
    const pillarGeometry = new THREE.CylinderGeometry(PILLAR_RADIUS, PILLAR_RADIUS, PILLAR_HEIGHT, 16);
    const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.5 });
    // FIX 4: Use MeshStandardMaterial for neon glow to support emissive
    const neonMaterial = new THREE.MeshStandardMaterial({ 
        color: NEON_COLOR, 
        emissive: NEON_COLOR, 
        emissiveIntensity: NEON_INTENSITY, 
        side: THREE.DoubleSide,
        roughness: 0.1,
        metalness: 0.9,
    });
    
    // 1. Floor and Ceiling (50x50)
    const floorSegments: THREE.Mesh[] = [];
    const placeholderFloorMaterial = new THREE.MeshStandardMaterial({
        color: FLOOR_COLOR,
        roughness: 0.2,
        metalness: 0.1,
        side: THREE.DoubleSide,
    });
    const segmentGeometry = new THREE.PlaneGeometry(ROOM_SEGMENT_SIZE, ROOM_SEGMENT_SIZE);

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
    
    for (let i = 0; i < NUM_SEGMENTS; i++) {
        for (let j = 0; j < NUM_SEGMENTS; j++) {
            const segmentCenter = (i - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;
            const segmentCenterZ = (j - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;

            // Floor Segment
            const floorSegment = new THREE.Mesh(segmentGeometry, placeholderFloorMaterial);
            floorSegment.rotation.x = Math.PI / 2;
            floorSegment.position.x = segmentCenter;
            floorSegment.position.z = segmentCenterZ;
            scene.add(floorSegment);
            floorSegments.push(floorSegment);

            // Ceiling Segment
            const ceiling = new THREE.Mesh(segmentGeometry, ceilingMaterial);
            ceiling.rotation.x = Math.PI / 2;
            ceiling.position.x = segmentCenter;
            ceiling.position.z = segmentCenterZ;
            ceiling.position.y = WALL_HEIGHT;
            scene.add(ceiling);
        }
    }

    createCustomFloorTexture((texture) => {
        const newFloorMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.2,
            metalness: 0.1,
            side: THREE.DoubleSide,
        });
        floorSegments.forEach(segment => {
            segment.material = newFloorMaterial;
        });
        placeholderFloorMaterial.dispose();
    });

    // --- 2. Structural Elements (Pillars, Walls, Arches) ---
    
    // --- 2.1 Outer 50x50 Perimeter Walls ---
    const OUTER_BOUNDARY = HALF_ROOM; // 25
    const OUTER_WALL_LENGTH = ROOM_SIZE;
    const outerWallGeometry = new THREE.PlaneGeometry(OUTER_WALL_LENGTH, WALL_HEIGHT);
    
    // North Wall (Z = -25)
    const northOuterWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    northOuterWall.position.set(0, WALL_HEIGHT / 2, -OUTER_BOUNDARY);
    scene.add(northOuterWall);
    
    // South Wall (Z = 25)
    const southOuterWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    southOuterWall.rotation.y = Math.PI;
    southOuterWall.position.set(0, WALL_HEIGHT / 2, OUTER_BOUNDARY);
    scene.add(southOuterWall);

    // East Wall (X = 25)
    const eastOuterWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    eastOuterWall.rotation.y = -Math.PI / 2;
    eastOuterWall.position.set(OUTER_BOUNDARY, WALL_HEIGHT / 2, 0);
    scene.add(eastOuterWall);

    // West Wall (X = -25)
    const westOuterWall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
    westOuterWall.rotation.y = Math.PI / 2;
    westOuterWall.position.set(-OUTER_BOUNDARY, WALL_HEIGHT / 2, 0);
    scene.add(westOuterWall);
    
    // --- 2.2 Pillars defining 10x10 and 30x30 areas ---
    const INNER_BOUNDARY = 5;
    const CORRIDOR_PILLAR_BOUNDARY = 15;
    
    const PILLAR_POSITIONS: [number, number, number][] = [
        // Central 10x10 Pillars
        [INNER_BOUNDARY, 0, INNER_BOUNDARY],
        [INNER_BOUNDARY, 0, -INNER_BOUNDARY],
        [-INNER_BOUNDARY, 0, INNER_BOUNDARY],
        [-INNER_BOUNDARY, 0, -INNER_BOUNDARY],
        // 30x30 Corridor Pillars (Corners)
        [CORRIDOR_PILLAR_BOUNDARY, 0, CORRIDOR_PILLAR_BOUNDARY],
        [CORRIDOR_PILLAR_BOUNDARY, 0, -CORRIDOR_PILLAR_BOUNDARY],
        [-CORRIDOR_PILLAR_BOUNDARY, 0, CORRIDOR_PILLAR_BOUNDARY],
        [-CORRIDOR_PILLAR_BOUNDARY, 0, -CORRIDOR_PILLAR_BOUNDARY],
        // 30x30 Corridor Pillars (Mid-points)
        [CORRIDOR_PILLAR_BOUNDARY, 0, 0],
        [-CORRIDOR_PILLAR_BOUNDARY, 0, 0],
        [0, 0, CORRIDOR_PILLAR_BOUNDARY],
        [0, 0, -CORRIDOR_PILLAR_BOUNDARY],
    ];
    
    const COLLISION_POINTS: [number, number, number][] = [];

    PILLAR_POSITIONS.forEach(([x, y, z]) => {
        const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial.clone());
        pillar.position.set(x, PILLAR_HEIGHT / 2, z);
        scene.add(pillar);
        COLLISION_POINTS.push([x, y, z]);
        
        // Add neon strip along the pillar height
        const neonStrip = new THREE.Mesh(new THREE.BoxGeometry(0.1, PILLAR_HEIGHT, 0.1), neonMaterial.clone());
        neonStrip.position.set(x, PILLAR_HEIGHT / 2, z);
        scene.add(neonStrip);
    });
    
    // --- 2.3 Beams connecting the pillars (Arches) ---
    // FIX 1: Renaming BEAM_HEIGHT to BEAM_VISUAL_HEIGHT
    const BEAM_VISUAL_HEIGHT = 0.5; 
    const BEAM_Y = WALL_HEIGHT - BEAM_VISUAL_HEIGHT / 2;
    const BEAM_MATERIAL = pillarMaterial.clone();
    
    // Central 10x10 Beams (length 10)
    for (const z of [-INNER_BOUNDARY, INNER_BOUNDARY]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(10, BEAM_VISUAL_HEIGHT, PILLAR_RADIUS * 2), BEAM_MATERIAL);
        beam.position.set(0, BEAM_Y, z);
        scene.add(beam);
    }
    for (const x of [-INNER_BOUNDARY, INNER_BOUNDARY]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(PILLAR_RADIUS * 2, BEAM_VISUAL_HEIGHT, 10), BEAM_MATERIAL);
        beam.position.set(x, BEAM_Y, 0);
        scene.add(beam);
    }
    
    // 30x30 Corridor Beams (length 30)
    for (const z of [-CORRIDOR_PILLAR_BOUNDARY, CORRIDOR_PILLAR_BOUNDARY]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(30, BEAM_VISUAL_HEIGHT, PILLAR_RADIUS * 2), BEAM_MATERIAL);
        beam.position.set(0, BEAM_Y, z);
        scene.add(beam);
    }
    for (const x of [-CORRIDOR_PILLAR_BOUNDARY, CORRIDOR_PILLAR_BOUNDARY]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(PILLAR_RADIUS * 2, BEAM_VISUAL_HEIGHT, 30), BEAM_MATERIAL);
        beam.position.set(x, BEAM_Y, 0);
        scene.add(beam);
    }
    
    // --- 3. Panel Placement and Wall Coloring ---
    
    const panelGeometry = new THREE.PlaneGeometry(2, 2);
    const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide, transparent: true, opacity: 0 });
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15); arrowShape.lineTo(0.3, 0); arrowShape.lineTo(0, -0.15); arrowShape.lineTo(0, 0.15);
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: ARROW_COLOR_DEFAULT, side: THREE.DoubleSide });
    
    const createTextPanelMaterial = () => {
        return new THREE.MeshBasicMaterial({ map: null, transparent: true, side: THREE.DoubleSide, alphaTest: 0.01, depthWrite: false });
    };

    const titleGeometry = new THREE.PlaneGeometry(TITLE_PANEL_WIDTH, TITLE_HEIGHT);
    const descriptionGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT);
    const attributesGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT);
    const wallTitleGeometry = new THREE.PlaneGeometry(8, 0.75); 

    const dynamicPanelConfigs: { wallName: keyof PanelConfig, position: [number, number, number], rotation: [number, number, number], textOffsetSign: number }[] = [];
    const SEGMENT_CENTERS = [-20, -10, 0, 10, 20]; 
    
    // 3.1 Outer Walls (50x50) - 20 panels
    SEGMENT_CENTERS.forEach((segmentCenter, i) => {
        const index = i;
        
        // North Wall (Z = -25, faces +Z)
        const northWallKey = `north-wall-${index}`;
        wallMeshesRef.current.set(northWallKey, northOuterWall);
        dynamicPanelConfigs.push({
            wallName: northWallKey as keyof PanelConfig,
            position: [segmentCenter, PANEL_Y_POSITION, -OUTER_BOUNDARY + PANEL_OFFSET],
            rotation: [0, 0, 0],
            textOffsetSign: 1,
        });

        // South Wall (Z = 25, faces -Z)
        const southWallKey = `south-wall-${index}`;
        wallMeshesRef.current.set(southWallKey, southOuterWall);
        dynamicPanelConfigs.push({
            wallName: southWallKey as keyof PanelConfig,
            position: [segmentCenter, PANEL_Y_POSITION, OUTER_BOUNDARY - PANEL_OFFSET],
            rotation: [0, Math.PI, 0],
            textOffsetSign: 1,
        });

        // East Wall (X = 25, faces -X)
        const eastWallKey = `east-wall-${index}`;
        wallMeshesRef.current.set(eastWallKey, eastOuterWall);
        dynamicPanelConfigs.push({
            wallName: eastWallKey as keyof PanelConfig,
            position: [OUTER_BOUNDARY - PANEL_OFFSET, PANEL_Y_POSITION, segmentCenter],
            rotation: [0, -Math.PI / 2, 0],
            textOffsetSign: 1,
        });

        // West Wall (X = -25, faces +X)
        const westWallKey = `west-wall-${index}`;
        wallMeshesRef.current.set(westWallKey, westOuterWall);
        dynamicPanelConfigs.push({
            wallName: westWallKey as keyof PanelConfig,
            position: [-OUTER_BOUNDARY + PANEL_OFFSET, PANEL_Y_POSITION, segmentCenter],
            rotation: [0, Math.PI / 2, 0],
            textOffsetSign: 1,
        });
    });
    
    // 3.2 Inner 30x30 Walls (16 panels) - Placed on small wall segments connecting the 30x30 pillars.
    const INNER_CORRIDOR_WALL_LENGTH = 10; 
    const INNER_CORRIDOR_WALL_GEOMETRY = new THREE.PlaneGeometry(INNER_CORRIDOR_WALL_LENGTH, WALL_HEIGHT);
    const INNER_CORRIDOR_WALL_MATERIAL = wallMaterial.clone();
    const INNER_CORRIDOR_BOUNDARY = 15;
    const INNER_SEGMENT_CENTERS = [-10, 10]; 
    
    INNER_SEGMENT_CENTERS.forEach((segmentCenter, i) => {
        const index = i;
        
        // North Inner Wall (Z = -15)
        // Outer side (in 50x50 corridor, faces +Z)
        const northInnerOuterKey = `north-inner-wall-outer-${index}`;
        const northInnerOuterWall = new THREE.Mesh(INNER_CORRIDOR_WALL_GEOMETRY, INNER_CORRIDOR_WALL_MATERIAL.clone());
        northInnerOuterWall.position.set(segmentCenter, WALL_HEIGHT / 2, -INNER_CORRIDOR_BOUNDARY);
        scene.add(northInnerOuterWall);
        wallMeshesRef.current.set(northInnerOuterKey, northInnerOuterWall);
        dynamicPanelConfigs.push({
            wallName: northInnerOuterKey as keyof PanelConfig,
            position: [segmentCenter, PANEL_Y_POSITION, -INNER_CORRIDOR_BOUNDARY + PANEL_OFFSET],
            rotation: [0, 0, 0],
            textOffsetSign: 1,
        });

        // Inner side (in 30x30 room, faces -Z)
        const northInnerInnerKey = `north-inner-wall-inner-${index}`;
        const northInnerInnerWall = new THREE.Mesh(INNER_CORRIDOR_WALL_GEOMETRY, INNER_CORRIDOR_WALL_MATERIAL.clone());
        northInnerInnerWall.rotation.y = Math.PI;
        northInnerInnerWall.position.set(segmentCenter, WALL_HEIGHT / 2, -INNER_CORRIDOR_BOUNDARY);
        scene.add(northInnerInnerWall);
        wallMeshesRef.current.set(northInnerInnerKey, northInnerInnerWall);
        dynamicPanelConfigs.push({
            wallName: northInnerInnerKey as keyof PanelConfig,
            position: [segmentCenter, PANEL_Y_POSITION, -INNER_CORRIDOR_BOUNDARY - PANEL_OFFSET],
            rotation: [0, Math.PI, 0],
            textOffsetSign: 1,
        });

        // South Inner Wall (Z = 15)
        // Outer side (in 50x50 corridor, faces -Z)
        const southInnerOuterKey = `south-inner-wall-outer-${index}`;
        const southInnerOuterWall = new THREE.Mesh(INNER_CORRIDOR_WALL_GEOMETRY, INNER_CORRIDOR_WALL_MATERIAL.clone());
        southInnerOuterWall.rotation.y = Math.PI;
        southInnerOuterWall.position.set(segmentCenter, WALL_HEIGHT / 2, INNER_CORRIDOR_BOUNDARY);
        scene.add(southInnerOuterWall);
        wallMeshesRef.current.set(southInnerOuterKey, southInnerOuterWall);
        dynamicPanelConfigs.push({
            wallName: southInnerOuterKey as keyof PanelConfig,
            position: [segmentCenter, PANEL_Y_POSITION, INNER_CORRIDOR_BOUNDARY - PANEL_OFFSET],
            rotation: [0, Math.PI, 0],
            textOffsetSign: 1,
        });

        // Inner side (in 30x30 room, faces +Z)
        const southInnerInnerKey = `south-inner-wall-inner-${index}`;
        const southInnerInnerWall = new THREE.Mesh(INNER_CORRIDOR_WALL_GEOMETRY, INNER_CORRIDOR_WALL_MATERIAL.clone());
        southInnerInnerWall.position.set(segmentCenter, WALL_HEIGHT / 2, INNER_CORRIDOR_BOUNDARY);
        scene.add(southInnerInnerWall);
        wallMeshesRef.current.set(southInnerInnerKey, southInnerInnerWall);
        dynamicPanelConfigs.push({
            wallName: southInnerInnerKey as keyof PanelConfig,
            position: [segmentCenter, PANEL_Y_POSITION, INNER_CORRIDOR_BOUNDARY + PANEL_OFFSET],
            rotation: [0, 0, 0],
            textOffsetSign: 1,
        });
        
        // East Inner Wall (X = 15)
        // Outer side (in 50x50 corridor, faces -X)
        const eastInnerOuterKey = `east-inner-wall-outer-${index}`;
        const eastInnerOuterWall = new THREE.Mesh(INNER_CORRIDOR_WALL_GEOMETRY, INNER_CORRIDOR_WALL_MATERIAL.clone());
        eastInnerOuterWall.rotation.y = -Math.PI / 2;
        eastInnerOuterWall.position.set(INNER_CORRIDOR_BOUNDARY, WALL_HEIGHT / 2, segmentCenter);
        scene.add(eastInnerOuterWall);
        wallMeshesRef.current.set(eastInnerOuterKey, eastInnerOuterWall);
        dynamicPanelConfigs.push({
            wallName: eastInnerOuterKey as keyof PanelConfig,
            position: [INNER_CORRIDOR_BOUNDARY - PANEL_OFFSET, PANEL_Y_POSITION, segmentCenter],
            rotation: [0, -Math.PI / 2, 0],
            textOffsetSign: 1,
        });

        // Inner side (in 30x30 room, faces +X)
        const eastInnerInnerKey = `east-inner-wall-inner-${index}`;
        const eastInnerInnerWall = new THREE.Mesh(INNER_CORRIDOR_WALL_GEOMETRY, INNER_CORRIDOR_WALL_MATERIAL.clone());
        eastInnerInnerWall.rotation.y = Math.PI / 2;
        eastInnerInnerWall.position.set(INNER_CORRIDOR_BOUNDARY, WALL_HEIGHT / 2, segmentCenter);
        scene.add(eastInnerInnerWall);
        wallMeshesRef.current.set(eastInnerInnerKey, eastInnerInnerWall);
        dynamicPanelConfigs.push({
            wallName: eastInnerInnerKey as keyof PanelConfig,
            position: [INNER_CORRIDOR_BOUNDARY + PANEL_OFFSET, PANEL_Y_POSITION, segmentCenter],
            rotation: [0, Math.PI / 2, 0],
            textOffsetSign: 1,
        });

        // West Inner Wall (X = -15)
        // Outer side (in 50x50 corridor, faces +X)
        const westInnerOuterKey = `west-inner-wall-outer-${index}`;
        const westInnerOuterWall = new THREE.Mesh(INNER_CORRIDOR_WALL_GEOMETRY, INNER_CORRIDOR_WALL_MATERIAL.clone());
        westInnerOuterWall.rotation.y = Math.PI / 2;
        westInnerOuterWall.position.set(-INNER_CORRIDOR_BOUNDARY, WALL_HEIGHT / 2, segmentCenter);
        scene.add(westInnerOuterWall);
        wallMeshesRef.current.set(westInnerOuterKey, westInnerOuterWall);
        dynamicPanelConfigs.push({
            wallName: westInnerOuterKey as keyof PanelConfig,
            position: [-INNER_CORRIDOR_BOUNDARY + PANEL_OFFSET, PANEL_Y_POSITION, segmentCenter],
            rotation: [0, Math.PI / 2, 0],
            textOffsetSign: 1,
        });

        // Inner side (in 30x30 room, faces -X)
        const westInnerInnerKey = `west-inner-wall-inner-${index}`;
        const westInnerInnerWall = new THREE.Mesh(INNER_CORRIDOR_WALL_GEOMETRY, INNER_CORRIDOR_WALL_MATERIAL.clone());
        westInnerInnerWall.rotation.y = -Math.PI / 2;
        westInnerInnerWall.position.set(-INNER_CORRIDOR_BOUNDARY, WALL_HEIGHT / 2, segmentCenter);
        scene.add(westInnerInnerWall);
        wallMeshesRef.current.set(westInnerInnerKey, westInnerInnerWall);
        dynamicPanelConfigs.push({
            wallName: westInnerInnerKey as keyof PanelConfig,
            position: [-INNER_CORRIDOR_BOUNDARY - PANEL_OFFSET, PANEL_Y_POSITION, segmentCenter],
            rotation: [0, -Math.PI / 2, 0],
            textOffsetSign: 1,
        });
    });
    
    // 3.3 Center 10x10 Walls (4 panels)
    const CENTER_WALL_LENGTH = 10 - PILLAR_RADIUS * 2; 
    const CENTER_WALL_GEOMETRY = new THREE.PlaneGeometry(CENTER_WALL_LENGTH, WALL_HEIGHT);
    const CENTER_WALL_MATERIAL = wallMaterial.clone();
    const CENTER_BOUNDARY = 5;
    const centerWallSegmentCenter = 0;
    
    // North Center Wall (Z = -5, faces +Z)
    const northCenterKey = `north-center-wall-0`;
    const northCenterWall = new THREE.Mesh(CENTER_WALL_GEOMETRY, CENTER_WALL_MATERIAL.clone());
    northCenterWall.position.set(0, WALL_HEIGHT / 2, -CENTER_BOUNDARY);
    scene.add(northCenterWall);
    wallMeshesRef.current.set(northCenterKey, northCenterWall);
    dynamicPanelConfigs.push({
        wallName: northCenterKey as keyof PanelConfig,
        position: [0, PANEL_Y_POSITION, -CENTER_BOUNDARY + PANEL_OFFSET],
        rotation: [0, 0, 0],
        textOffsetSign: 1,
    });

    // South Center Wall (Z = 5, faces -Z)
    const southCenterKey = `south-center-wall-0`;
    const southCenterWall = new THREE.Mesh(CENTER_WALL_GEOMETRY, CENTER_WALL_MATERIAL.clone());
    southCenterWall.rotation.y = Math.PI;
    southCenterWall.position.set(0, WALL_HEIGHT / 2, CENTER_BOUNDARY);
    scene.add(southCenterWall);
    wallMeshesRef.current.set(southCenterKey, southCenterWall);
    dynamicPanelConfigs.push({
        wallName: southCenterKey as keyof PanelConfig,
        position: [0, PANEL_Y_POSITION, CENTER_BOUNDARY - PANEL_OFFSET],
        rotation: [0, Math.PI, 0],
        textOffsetSign: 1,
    });

    // East Center Wall (X = 5, faces -X)
    const eastCenterKey = `east-center-wall-0`;
    const eastCenterWall = new THREE.Mesh(CENTER_WALL_GEOMETRY, CENTER_WALL_MATERIAL.clone());
    eastCenterWall.rotation.y = -Math.PI / 2;
    eastCenterWall.position.set(CENTER_BOUNDARY, WALL_HEIGHT / 2, 0);
    scene.add(eastCenterWall);
    wallMeshesRef.current.set(eastCenterKey, eastCenterWall);
    dynamicPanelConfigs.push({
        wallName: eastCenterKey as keyof PanelConfig,
        position: [CENTER_BOUNDARY - PANEL_OFFSET, PANEL_Y_POSITION, 0],
        rotation: [0, -Math.PI / 2, 0],
        textOffsetSign: 1,
    });

    // West Center Wall (X = -5, faces +X)
    const westCenterKey = `west-center-wall-0`;
    const westCenterWall = new THREE.Mesh(CENTER_WALL_GEOMETRY, CENTER_WALL_MATERIAL.clone());
    westCenterWall.rotation.y = Math.PI / 2;
    westCenterWall.position.set(-CENTER_BOUNDARY, WALL_HEIGHT / 2, 0);
    scene.add(westCenterWall);
    wallMeshesRef.current.set(westCenterKey, westCenterWall);
    dynamicPanelConfigs.push({
        wallName: westCenterKey as keyof PanelConfig,
        position: [-CENTER_BOUNDARY + PANEL_OFFSET, PANEL_Y_POSITION, 0],
        rotation: [0, Math.PI / 2, 0],
        textOffsetSign: 1,
    });
    
    // --- 4. Lighting Setup (Revised for Neon Aesthetic) ---
    scene.add(new THREE.AmbientLight(0x404050, 0.5)); 
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.3);
    hemiLight.position.set(0, WALL_HEIGHT, 0);
    scene.add(hemiLight);

    const coveLightColor = NEON_COLOR; 
    const coveLightIntensity = 5; 
    const coveLightWidth = ROOM_SEGMENT_SIZE; 
    const coveLightHeight = 0.1;
    const innerYPos = WALL_HEIGHT - 0.1;
    const wallThicknessOffset = 0.05; 
    const innerOffset = 0.1;

    // Outer Perimeter (50x50)
    SEGMENT_CENTERS.forEach(segmentCenter => {
        // North Outer Wall (Z = -25). Faces +Z (Inward)
        createCoveLighting(scene, [segmentCenter, innerYPos, -HALF_ROOM + innerOffset + wallThicknessOffset], [0, 0, 0], coveLightColor, coveLightIntensity, coveLightWidth, coveLightHeight);

        // South Outer Wall (Z = 25). Faces -Z (Inward)
        createCoveLighting(scene, [segmentCenter, innerYPos, HALF_ROOM - innerOffset - wallThicknessOffset], [0, Math.PI, 0], coveLightColor, coveLightIntensity, coveLightWidth, coveLightHeight);
        
        // East Outer Wall (X = 25). Faces -X (Inward)
        createCoveLighting(scene, [HALF_ROOM - innerOffset - wallThicknessOffset, innerYPos, segmentCenter], [0, -Math.PI / 2, 0], coveLightColor, coveLightIntensity, coveLightWidth, coveLightHeight);

        // West Outer Wall (X = -25). Faces +X (Inward)
        createCoveLighting(scene, [-HALF_ROOM + innerOffset + wallThicknessOffset, innerYPos, segmentCenter], [0, Math.PI / 2, 0], coveLightColor, coveLightIntensity, coveLightWidth, coveLightHeight);
    });
    
    // Central Beams (10x10 structure) - Add small lights above the beams
    // FIX 2: Renaming BEAM_HEIGHT to BEAM_LIGHT_HEIGHT
    const BEAM_LIGHT_HEIGHT = 0.5;
    const BEAM_LIGHT_Y = WALL_HEIGHT - BEAM_LIGHT_HEIGHT - 0.1;
    const BEAM_LIGHT_INTENSITY = 3;
    
    // X-axis beams (length 10)
    for (const z of [-INNER_BOUNDARY, INNER_BOUNDARY]) {
        const rectLight = new THREE.RectAreaLight(coveLightColor, BEAM_LIGHT_INTENSITY, 10, 0.1);
        rectLight.position.set(0, BEAM_LIGHT_Y, z);
        rectLight.rotation.set(-Math.PI / 2, 0, 0); // Shine downwards
        scene.add(rectLight);
    }
    // Z-axis beams (length 10)
    for (const x of [-INNER_BOUNDARY, INNER_BOUNDARY]) {
        const rectLight = new THREE.RectAreaLight(coveLightColor, BEAM_LIGHT_INTENSITY, 10, 0.1);
        rectLight.position.set(x, BEAM_LIGHT_Y, 0);
        rectLight.rotation.set(-Math.PI / 2, 0, Math.PI / 2); // Shine downwards
        scene.add(rectLight);
    }
    
    // --- 5. Panel Mesh Creation ---
    panelsRef.current = [];

    const TEXT_PANEL_OFFSET_X = 3.25; 

    dynamicPanelConfigs.forEach(config => {
      const mesh = new THREE.Mesh(panelGeometry, panelMaterial.clone());
      mesh.position.set(config.position[0], config.position[1], config.position[2]);
      mesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      scene.add(mesh);
      
      const wallRotation = new THREE.Euler(config.rotation[0], config.rotation[1], config.rotation[2], 'XYZ');
      const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);
      const upVector = new THREE.Vector3(0, 1, 0).applyEuler(wallRotation);
      const forwardVector = new THREE.Vector3(0, 0, 1).applyEuler(wallRotation);
      
      const basePosition = new THREE.Vector3(config.position[0], config.position[1], config.position[2]);
      
      // Title Panel
      const titleMesh = new THREE.Mesh(titleGeometry, createTextPanelMaterial());
      titleMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const titleYOffset = -1 - (TITLE_HEIGHT / 2) - 0.1; 
      const titlePosition = basePosition.clone()
          .addScaledVector(upVector, titleYOffset)
          .addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      titleMesh.position.copy(titlePosition);
      titleMesh.visible = false; 
      scene.add(titleMesh);

      // Description Panel (Left side relative to the NFT panel)
      const descriptionGroupPosition = basePosition.clone().addScaledVector(rightVector, -TEXT_PANEL_OFFSET_X * config.textOffsetSign);
      const descriptionMesh = new THREE.Mesh(descriptionGeometry, createTextPanelMaterial());
      descriptionMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const descriptionPosition = descriptionGroupPosition.clone().addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      descriptionMesh.position.copy(descriptionPosition);
      descriptionMesh.visible = false; 
      scene.add(descriptionMesh);
      
      // Arrows
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

      // Attributes Panel (Right side relative to the NFT panel)
      const collectionInfoGroupPosition = basePosition.clone().addScaledVector(rightVector, TEXT_PANEL_OFFSET_X * config.textOffsetSign);
      const attributesMesh = new THREE.Mesh(attributesGeometry, createTextPanelMaterial());
      attributesMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const attributesPosition = collectionInfoGroupPosition.clone().addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      attributesMesh.position.copy(attributesPosition);
      attributesMesh.visible = false; 
      scene.add(attributesMesh);

      // Wall Title Panel
      const wallTitleMesh = new THREE.Mesh(wallTitleGeometry, createTextPanelMaterial());
      wallTitleMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const wallTitlePosition = new THREE.Vector3(config.position[0], config.position[1], config.position[2]);
      wallTitlePosition.y = 3.2; 
      wallTitleMesh.position.copy(wallTitlePosition);
      wallTitleMesh.visible = false; 
      scene.add(wallTitleMesh);

      const panel: Panel = {
        mesh, wallName: config.wallName as keyof PanelConfig, metadataUrl: '', isVideo: false, isGif: false, prevArrow, nextArrow, titleMesh, descriptionMesh,
        attributesMesh, wallTitleMesh, currentDescription: '', descriptionScrollY: 0, descriptionTextHeight: 0, currentAttributes: [],
        videoElement: null, gifStopFunction: null,
      };
      panelsRef.current.push(panel);
    });

    let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
    const velocity = new THREE.Vector3(), direction = new THREE.Vector3(), speed = 20.0;

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
    // interactiveMeshes is not strictly needed here as raycaster is run every frame

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

    const updateDescriptionTexture = (panel: Panel) => {
      if (panel.descriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.descriptionMesh.material.map) {
        panel.descriptionMesh.material.map.dispose();
        (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = null; 
      }
      const textColor = GALLERY_PANEL_CONFIG[panel.wallName]?.text_color || 'white';
      const { texture } = createTextTexture(panel.currentDescription, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, textColor, { wordWrap: true, scrollY: panel.descriptionScrollY });
      (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = texture;
    };

    const onDocumentWheel = (event: WheelEvent) => {
      if (!controls.isLocked || !currentTargetedDescriptionPanel) return;
      const panel = currentTargetedDescriptionPanel;
      const scrollAmount = event.deltaY * 0.5;
      
      const canvasHeight = 512;
      const padding = 40; 
      const effectiveViewportHeight = canvasHeight - 2 * padding;
      const maxScroll = Math.max(0, panel.descriptionTextHeight - effectiveViewportHeight);

      let newScrollY = panel.descriptionScrollY + scrollAmount;
      newScrollY = Math.max(0, Math.min(newScrollY, maxScroll));
      
      if (panel.descriptionScrollY !== newScrollY) {
        panel.descriptionScrollY = newScrollY;
        updateDescriptionTexture(panel);
      }
    };
    document.addEventListener('wheel', onDocumentWheel);

    let prevTime = performance.now();
    const startTime = performance.now();
    
    const animate = () => {
      requestAnimationFrame(animate);
      const time = performance.now(), delta = (time - prevTime) / 1000;
      const elapsedTime = (time - startTime) / 1000;

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
        
        const prevX = camera.position.x;
        const prevZ = camera.position.z;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        
        // --- Collision Detection ---
        
        // 1. Outer Boundary (50x50 room)
        camera.position.x = Math.max(-BOUNDARY, Math.min(BOUNDARY, camera.position.x));
        camera.position.z = Math.max(-BOUNDARY, Math.min(BOUNDARY, camera.position.z));

        // 2. Pillar Collision (Check against all 12 pillars)
        COLLISION_POINTS.forEach(([px, py, pz]) => {
            const dx = camera.position.x - px;
            const dz = camera.position.z - pz;
            const distanceSq = dx * dx + dz * dz;

            if (distanceSq < PILLAR_COLLISION_RADIUS * PILLAR_COLLISION_RADIUS) {
                const distance = Math.sqrt(distanceSq);
                const overlap = PILLAR_COLLISION_RADIUS - distance;

                if (distance > 0) {
                    const pushbackX = dx / distance * overlap;
                    const pushbackZ = dz / distance * overlap;

                    camera.position.x += pushbackX;
                    camera.position.z += pushbackZ;
                } else {
                    // Fallback if player is inside the pillar
                    camera.position.x = prevX;
                    camera.position.z = prevZ;
                }
            }
        });
        
        camera.position.y = 1.6;
        
        raycaster.setFromCamera(center, camera);
        const intersects = raycaster.intersectObjects(panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow, p.descriptionMesh]));
        
        panelsRef.current.forEach(p => {
          (p.prevArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_DEFAULT);
          (p.nextArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_DEFAULT);
        });
        
        currentTargetedPanel = null;
        currentTargetedArrow = null;
        currentTargetedDescriptionPanel = null;

        if (intersects.length > 0 && intersects[0].distance < 5) {
          const intersectedMesh = intersects[0].object as THREE.Mesh;
          const panel = panelsRef.current.find(p => p.mesh === intersectedMesh || p.prevArrow === intersectedMesh || p.nextArrow === intersectedMesh || p.descriptionMesh === intersectedMesh);
          if (panel) {
            if (intersectedMesh === panel.mesh) currentTargetedPanel = panel;
            else if (intersectedMesh === panel.prevArrow || intersectedMesh === panel.nextArrow) {
              currentTargetedArrow = intersectedMesh;
              (intersectedMesh.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_HOVER);
            } else if (intersectedMesh === panel.descriptionMesh) {
              currentTargetedDescriptionPanel = panel;
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
      
      // Apply wall colors from config to the main wall meshes
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
        await new Promise(resolve => setTimeout(resolve, 100)); 
      }
    };

    fetchAndRenderPanelsSequentially();

    animate();

    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('wheel', onDocumentWheel);
      window.removeEventListener('resize', onWindowResize);
      
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      
      mountRef.current?.removeChild(renderer.domElement);
      controls.dispose();
      
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
      currentTargetedDescriptionPanel = null;
    };
  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback, createCoveLighting]);

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