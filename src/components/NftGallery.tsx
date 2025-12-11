import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource, NftAttribute } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';
import { createGifTexture } from '@/utils/gifTexture';
import { MarketBrowserRefined } from './MarketBrowserRefined';

// Post-processing imports for the new aesthetic (Imported from three-stdlib to resolve module errors)
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";

// Initialize RectAreaLightUniformsLib immediately upon module load
RectAreaLightUniformsLib.init();

// Constants for geometry
const TEXT_PANEL_WIDTH = 2.5;
const TITLE_HEIGHT = 0.5;
const DESCRIPTION_HEIGHT = 1.5;
const ATTRIBUTES_HEIGHT = 1.5;
const DESCRIPTION_PANEL_HEIGHT = TITLE_HEIGHT + DESCRIPTION_HEIGHT;

// --- NEW ARCHITECTURE CONSTANTS (Updated for Neon Aesthetic) ---
const WALL_HEIGHT = 12; 
const NEON_COLOR_CYAN = 0x33f0ff; // Bright Cyan for strip lighting
const NEON_COLOR_MAGENTA = 0xff1bb3; // Bright Magenta for panel frames
const NEON_INTENSITY = 1.5;
const WALL_COLOR = 0x151217; // Dark, gritty wall color
const FLOOR_COLOR = 0x1b1416; // Dark floor color
const PANEL_Y_POSITION = 3.0; 
const PANEL_OFFSET = 0.15; 
const ARROW_PANEL_OFFSET = 1.5;
const TEXT_DEPTH_OFFSET = 0.16;
const TITLE_PANEL_WIDTH = 4.0;
const ARROW_COLOR_DEFAULT = 0xcccccc, ARROW_COLOR_HOVER = 0x00ff00;

// Collision constants
const PLAYER_RADIUS = 0.5;
const WALL_THICKNESS = 0.1;
const COLLISION_DISTANCE = PLAYER_RADIUS + WALL_THICKNESS;

// Octagon Hub dimensions
const OCTAGON_RADIUS = 10;
const OCTAGON_WALL_LENGTH = 2 * OCTAGON_RADIUS * Math.tan(Math.PI / 8); // Approx 8.28
const OCTAGON_APOTHEM = OCTAGON_RADIUS * Math.cos(Math.PI / 8); // Approx 9.24

// Corridor dimensions
const CORRIDOR_WIDTH = 5;
const CORRIDOR_LENGTH = 10;
const HALF_CORRIDOR_WIDTH = CORRIDOR_WIDTH / 2;

// Room dimensions
const ROOM_SIZE = 10;
const HALF_ROOM_SIZE = ROOM_SIZE / 2;

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
  const collisionSegmentsRef = useRef<[number, number, number, number][]>([]); // [x1, z1, x2, z2]
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

  // Helper function to create the framed panel structure
  const createFramedPanel = (w: number, h: number, emissiveColor: number) => {
      const group = new THREE.Group();
      
      // 1. Backboard (Dark, non-emissive)
      const backGeo = new THREE.PlaneGeometry(w, h);
      const backMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
      const back = new THREE.Mesh(backGeo, backMat);
      back.position.set(0, 0, 0.01);
      group.add(back);

      // 2. Frame Rim (Emissive border)
      const rimDepth = 0.06;
      const rimMat = new THREE.MeshStandardMaterial({
          color: 0x0b0b0b,
          emissive: emissiveColor,
          emissiveIntensity: 1.6,
          roughness: 0.25,
          metalness: 0.4,
      });
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, rimDepth), rimMat);
      rim.position.set(0, 0, -0.02);
      group.add(rim);

      // 3. Main NFT Display Plane (This will hold the texture/video)
      const imageMat = new THREE.MeshBasicMaterial({ color: 0x222122, side: THREE.DoubleSide });
      const imageGeo = new THREE.PlaneGeometry(w - 0.2, h - 0.2);
      const imageMesh = new THREE.Mesh(imageGeo, imageMat);
      imageMesh.position.set(0, 0, 0.02);
      group.add(imageMesh);
      
      // 4. Neon Border Line (Thin tube along frame)
      const neonMat = new THREE.MeshStandardMaterial({
          emissive: emissiveColor,
          emissiveIntensity: 1.4,
          roughness: 0.2,
      });

      const borderGeomH = new THREE.BoxGeometry(w + 0.05, 0.03, 0.015);
      const top = new THREE.Mesh(borderGeomH, neonMat);
      top.position.set(0, h / 2 + 0.06, 0.03);
      group.add(top);
      const bottom = top.clone();
      bottom.position.set(0, -h / 2 - 0.06, 0.03);
      group.add(bottom);

      const borderGeomV = new THREE.BoxGeometry(0.03, h + 0.05, 0.015);
      const left = new THREE.Mesh(borderGeomV, neonMat);
      left.position.set(-w / 2 - 0.06, 0, 0.03);
      group.add(left);
      const right = left.clone();
      right.position.set(w / 2 + 0.06, 0, 0.03);
      group.add(right);

      return { group, imageMesh };
  };

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
    // Note: We only dispose the map on the main mesh, the frame materials are reused.
    if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
        if (panel.mesh.material.map) {
            panel.mesh.material.map.dispose();
            panel.mesh.material.map = null;
        }
        panel.mesh.material.color.set(0x222122); // Dark placeholder color
    }
    
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
        
        // Display error texture on the main mesh
        if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
            const { texture: errorTexture } = createTextTexture("NFT Unavailable", 2, 2, 80, 'red', { wordWrap: false });
            panel.mesh.material.map = errorTexture;
            panel.mesh.material.color.set(0xff0000); // Red tint for error
        }
        
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
      if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
          panel.mesh.material.map = texture;
          panel.mesh.material.color.set(0xffffff); // Reset color to white for texture display
      }
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

  // Helper function to calculate distance from point (px, pz) to line segment (x1, z1) to (x2, z2)
  const distToSegment = (px: number, pz: number, x1: number, z1: number, x2: number, z2: number) => {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const lengthSq = dx * dx + dz * dz;

    if (lengthSq === 0) return Math.sqrt((px - x1) * (px - x1) + (pz - z1) * (pz - z1));

    // t is the projection of the point onto the line segment
    let t = ((px - x1) * dx + (pz - z1) * dz) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = x1 + t * dx;
    const closestZ = z1 + t * dz;

    const distSq = (px - closestX) * (px - closestX) + (pz - closestZ) * (pz - closestZ);
    return Math.sqrt(distSq);
  };


  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0410); // deep moody base
    scene.fog = new THREE.FogExp2(0x0a0410, 0.02);

    // Renderer (Updated for Bloom/Tone Mapping)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    // FIX: Use outputColorSpace instead of deprecated outputEncoding
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    // Camera
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0); // Start in the center of the Octagon Hub

    // Controls
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
    
    // --- Postprocessing (bloom + fxaa) ---
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.4, 0.85);
    bloomPass.threshold = 0.15;
    bloomPass.strength = 1.2;
    bloomPass.radius = 0.6;
    composer.addPass(bloomPass);

    const fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    fxaaPass.material.uniforms["resolution"].value.x = 1 / (window.innerWidth * pixelRatio);
    fxaaPass.material.uniforms["resolution"].value.y = 1 / (window.innerHeight * pixelRatio);
    composer.addPass(fxaaPass);


    // --- ROOM GEOMETRY SETUP (Electric Circuit Layout) ---

    const wallMaterial = new THREE.MeshStandardMaterial({ 
        color: WALL_COLOR, 
        side: THREE.DoubleSide, 
        roughness: 0.95, // Grittier look
        metalness: 0.1 
    });
    
    // 1. Floor and Ceiling (Complex Geometry)
    
    const FLOOR_SEGMENT_SIZE = 10;
    const NUM_SEGMENTS = 5; 
    
    const floorSegments: THREE.Mesh[] = [];
    const placeholderFloorMaterial = new THREE.MeshStandardMaterial({
        color: FLOOR_COLOR,
        roughness: 0.9,
        metalness: 0.05,
        side: THREE.DoubleSide,
    });
    const segmentGeometry = new THREE.PlaneGeometry(FLOOR_SEGMENT_SIZE, FLOOR_SEGMENT_SIZE);

    // Create floor and ceiling grid over the entire area
    for (let i = 0; i < NUM_SEGMENTS; i++) {
        for (let j = 0; j < NUM_SEGMENTS; j++) {
            const segmentCenter = (i - (NUM_SEGMENTS - 1) / 2) * FLOOR_SEGMENT_SIZE;
            const segmentCenterZ = (j - (NUM_SEGMENTS - 1) / 2) * FLOOR_SEGMENT_SIZE;

            // Floor Segment
            const floorSegment = new THREE.Mesh(segmentGeometry, placeholderFloorMaterial.clone());
            floorSegment.rotation.x = Math.PI / 2;
            floorSegment.position.x = segmentCenter;
            floorSegment.position.z = segmentCenterZ;
            scene.add(floorSegment);
            floorSegments.push(floorSegment);

            // Ceiling Segment
            const ceiling = new THREE.Mesh(segmentGeometry, new THREE.ShaderMaterial({
                uniforms: { time: { value: 0.0 }, opacity: { value: 1.0 } },
                vertexShader: ceilingVertexShader,
                fragmentShader: ceilingFragmentShader,
                side: THREE.DoubleSide,
                transparent: true,
            }));
            ceiling.rotation.x = Math.PI / 2;
            ceiling.position.x = segmentCenter;
            ceiling.position.z = segmentCenterZ;
            ceiling.position.y = WALL_HEIGHT;
            scene.add(ceiling);
        }
    }

    // Custom floor texture loading (reused from previous implementation)
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

    createCustomFloorTexture((texture) => {
        const newFloorMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            color: FLOOR_COLOR, // Use new dark color
            roughness: 0.9,
            metalness: 0.05,
            side: THREE.DoubleSide,
        });
        floorSegments.forEach(segment => {
            segment.material = newFloorMaterial;
        });
        placeholderFloorMaterial.dispose();
    });
    
    // --- 2. Structural Wall Definition (Kept Dynamic Layout) ---
    
    const WALL_SEGMENTS: {
        key: keyof PanelConfig;
        length: number;
        position: [number, number, number];
        rotationY: number;
        neonColor: number;
    }[] = [];
    
    const PANEL_KEYS = Object.keys(GALLERY_PANEL_CONFIG) as (keyof PanelConfig)[];
    let keyIndex = 0;
    
    // --- 2.1 Central Octagon Hub (8 walls) ---
    const OCTAGON_WALL_COUNT = 8;
    
    for (let i = 0; i < OCTAGON_WALL_COUNT; i++) {
        const angle = (i * 2 * Math.PI) / OCTAGON_WALL_COUNT;
        const rotationY = angle;
        
        const x = OCTAGON_APOTHEM * Math.sin(angle);
        const z = -OCTAGON_APOTHEM * Math.cos(angle);
        
        WALL_SEGMENTS.push({
            key: PANEL_KEYS[keyIndex++]!,
            length: OCTAGON_WALL_LENGTH,
            position: [x, WALL_HEIGHT / 2, z],
            rotationY: rotationY,
            neonColor: NEON_COLOR_CYAN,
        });
    }
    
    // --- 2.2 Corridors and Square Rooms (4 wings) ---
    
    const CORRIDOR_START = OCTAGON_APOTHEM + WALL_THICKNESS; 
    const CORRIDOR_END = CORRIDOR_START + CORRIDOR_LENGTH; 
    const ROOM_START = CORRIDOR_END + WALL_THICKNESS; 
    const ROOM_END = ROOM_START + ROOM_SIZE; 
    
    const createWing = (
        baseRotation: number, 
        corridorKeys: (keyof PanelConfig)[], 
        roomKeys: (keyof PanelConfig)[]
    ) => {
        const cosR = Math.cos(baseRotation);
        const sinR = Math.sin(baseRotation);
        
        // Corridor Walls
        const side1Center = CORRIDOR_START + CORRIDOR_LENGTH / 2;
        WALL_SEGMENTS.push({ key: corridorKeys[0]!, length: CORRIDOR_LENGTH, position: [side1Center * sinR - HALF_CORRIDOR_WIDTH * cosR, WALL_HEIGHT / 2, -side1Center * cosR - HALF_CORRIDOR_WIDTH * sinR], rotationY: baseRotation, neonColor: NEON_COLOR_CYAN });
        WALL_SEGMENTS.push({ key: corridorKeys[1]!, length: CORRIDOR_LENGTH, position: [side1Center * sinR + HALF_CORRIDOR_WIDTH * cosR, WALL_HEIGHT / 2, -side1Center * cosR + HALF_CORRIDOR_WIDTH * sinR], rotationY: baseRotation + Math.PI, neonColor: NEON_COLOR_CYAN });
        
        // Connector Walls (Short, length=CORRIDOR_WIDTH=5)
        WALL_SEGMENTS.push({ key: corridorKeys[2]!, length: CORRIDOR_WIDTH, position: [CORRIDOR_START * sinR, WALL_HEIGHT / 2, -CORRIDOR_START * cosR], rotationY: baseRotation + Math.PI / 2, neonColor: NEON_COLOR_CYAN });
        WALL_SEGMENTS.push({ key: corridorKeys[3]!, length: CORRIDOR_WIDTH, position: [CORRIDOR_END * sinR, WALL_HEIGHT / 2, -CORRIDOR_END * cosR], rotationY: baseRotation - Math.PI / 2, neonColor: NEON_COLOR_CYAN });
        
        // Room Walls
        const roomCenter = ROOM_START + HALF_ROOM_SIZE; 
        WALL_SEGMENTS.push({ key: roomKeys[0]!, length: ROOM_SIZE, position: [ROOM_END * sinR, WALL_HEIGHT / 2, -ROOM_END * cosR], rotationY: baseRotation, neonColor: NEON_COLOR_CYAN });
        WALL_SEGMENTS.push({ key: roomKeys[1]!, length: ROOM_SIZE, position: [roomCenter * sinR - HALF_ROOM_SIZE * cosR, WALL_HEIGHT / 2, -roomCenter * cosR - HALF_ROOM_SIZE * sinR], rotationY: baseRotation + Math.PI / 2, neonColor: NEON_COLOR_CYAN });
        WALL_SEGMENTS.push({ key: roomKeys[2]!, length: ROOM_SIZE, position: [roomCenter * sinR + HALF_ROOM_SIZE * cosR, WALL_HEIGHT / 2, -roomCenter * cosR + HALF_ROOM_SIZE * sinR], rotationY: baseRotation - Math.PI / 2, neonColor: NEON_COLOR_CYAN });
        WALL_SEGMENTS.push({ key: roomKeys[3]!, length: ROOM_SIZE, position: [ROOM_START * sinR, WALL_HEIGHT / 2, -ROOM_START * cosR], rotationY: baseRotation + Math.PI, neonColor: NEON_COLOR_CYAN });
    };
    
    const keys = PANEL_KEYS;
    
    // North Wing (Base Rotation 0)
    createWing(0, [keys[keyIndex++], keys[keyIndex++], keys[keyIndex++], keys[keyIndex++]], [keys[keyIndex++], keys[keyIndex++], keys[keyIndex++], keys[keyIndex++]]);
    // East Wing (Base Rotation PI/2)
    createWing(Math.PI / 2, [keys[keyIndex++], keys[keyIndex++], keys[keyIndex++], keys[keyIndex++]], [keys[keyIndex++], keys[keyIndex++], keys[keyIndex++], keys[keyIndex++]]);
    // South Wing (Base Rotation PI)
    createWing(Math.PI, [keys[keyIndex++], keys[keyIndex++], keys[keyIndex++], keys[keyIndex++]], [keys[keyIndex++], keys[keyIndex++], keys[keyIndex++], keys[keyIndex++]]);
    // West Wing (Base Rotation 3PI/2)
    createWing(3 * Math.PI / 2, [keys[keyIndex++], keys[keyIndex++], keys[keyIndex++], keys[keyIndex++]], [keys[keyIndex++], keys[keyIndex++], keys[keyIndex++], keys[keyIndex++]]);
    
    // --- 3. Render Walls, Panels, and Collision Segments ---
    
    const panelGeometry = new THREE.PlaneGeometry(2, 2);
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
    
    panelsRef.current = [];
    collisionSegmentsRef.current = [];

    WALL_SEGMENTS.forEach(config => {
        const wallGeo = new THREE.PlaneGeometry(config.length, WALL_HEIGHT);
        const wallMesh = new THREE.Mesh(wallGeo, wallMaterial.clone());
        wallMesh.position.set(config.position[0], config.position[1], config.position[2]);
        wallMesh.rotation.y = config.rotationY;
        scene.add(wallMesh);
        wallMeshesRef.current.set(config.key as string, wallMesh);
        
        // --- Collision Segment Calculation ---
        const halfLength = config.length / 2;
        const cosR = Math.cos(config.rotationY);
        const sinR = Math.sin(config.rotationY);
        const dx = halfLength * cosR;
        const dz = halfLength * sinR;
        const cx = config.position[0];
        const cz = config.position[2];
        const x1 = cx - dx;
        const z1 = cz + dz;
        const x2 = cx + dx;
        const z2 = cz - dz;
        collisionSegmentsRef.current.push([x1, z1, x2, z2]);
        // --- End Collision Segment Calculation ---

        // --- Panel Placement ---
        // Only place panels on walls longer than 6 units (skips the 8 short corridor connector walls)
        if (config.length > 6) { 
            
            const { group: panelGroup, imageMesh: mesh } = createFramedPanel(2, 2, NEON_COLOR_MAGENTA);
            
            // Panel position is slightly offset from the wall center towards the interior
            const panelOffsetVector = new THREE.Vector3(0, 0, PANEL_OFFSET).applyAxisAngle(new THREE.Vector3(0, 1, 0), config.rotationY);
            
            panelGroup.position.set(
                config.position[0] + panelOffsetVector.x, 
                PANEL_Y_POSITION, 
                config.position[2] + panelOffsetVector.z
            );
            panelGroup.rotation.y = config.rotationY;
            scene.add(panelGroup);
            
            const wallRotation = new THREE.Euler(0, config.rotationY, 0, 'XYZ');
            const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);
            const upVector = new THREE.Vector3(0, 1, 0).applyEuler(wallRotation);
            const forwardVector = new THREE.Vector3(0, 0, 1).applyEuler(wallRotation);
            
            const basePosition = panelGroup.position.clone();
            const TEXT_PANEL_OFFSET_X = 3.25; 
            
            // Title Panel
            const titleMesh = new THREE.Mesh(titleGeometry, createTextPanelMaterial());
            titleMesh.rotation.copy(wallRotation);
            const titleYOffset = -1 - (TITLE_HEIGHT / 2) - 0.1; 
            const titlePosition = basePosition.clone()
                .addScaledVector(upVector, titleYOffset)
                .addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
            titleMesh.position.copy(titlePosition);
            titleMesh.visible = false; 
            scene.add(titleMesh);

            // Description Panel (Left side relative to the NFT panel)
            const descriptionGroupPosition = basePosition.clone().addScaledVector(rightVector, -TEXT_PANEL_OFFSET_X);
            const descriptionMesh = new THREE.Mesh(descriptionGeometry, createTextPanelMaterial());
            descriptionMesh.rotation.copy(wallRotation);
            const descriptionPosition = descriptionGroupPosition.clone().addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
            descriptionMesh.position.copy(descriptionPosition);
            descriptionMesh.visible = false; 
            scene.add(descriptionMesh);
            
            // Arrows
            const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
            prevArrow.rotation.set(0, config.rotationY + Math.PI, 0);
            const prevPosition = basePosition.clone().addScaledVector(rightVector, -ARROW_PANEL_OFFSET);
            prevArrow.position.copy(prevPosition);
            scene.add(prevArrow);
            
            const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
            nextArrow.rotation.copy(wallRotation);
            const nextPosition = basePosition.clone().addScaledVector(rightVector, ARROW_PANEL_OFFSET);
            nextArrow.position.copy(nextPosition);
            scene.add(nextArrow);

            // Attributes Panel (Right side relative to the NFT panel)
            const collectionInfoGroupPosition = basePosition.clone().addScaledVector(rightVector, TEXT_PANEL_OFFSET_X);
            const attributesMesh = new THREE.Mesh(attributesGeometry, createTextPanelMaterial());
            attributesMesh.rotation.copy(wallRotation);
            const attributesPosition = collectionInfoGroupPosition.clone().addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
            attributesMesh.position.copy(attributesPosition);
            attributesMesh.visible = false; 
            scene.add(attributesMesh);

            // Wall Title Panel
            const wallTitleMesh = new THREE.Mesh(wallTitleGeometry, createTextPanelMaterial());
            wallTitleMesh.rotation.copy(wallRotation);
            const wallTitlePosition = basePosition.clone();
            wallTitlePosition.y = 3.2; 
            wallTitleMesh.position.copy(wallTitlePosition);
            wallTitleMesh.visible = false; 
            scene.add(wallTitleMesh);

            const panel: Panel = {
                mesh, wallName: config.key, metadataUrl: '', isVideo: false, isGif: false, prevArrow, nextArrow, titleMesh, descriptionMesh,
                attributesMesh, wallTitleMesh, currentDescription: '', descriptionScrollY: 0, descriptionTextHeight: 0, currentAttributes: [],
                videoElement: null, gifStopFunction: null,
            };
            panelsRef.current.push(panel);
        }
        // --- End Panel Placement ---
        
        // --- Lighting (Neon Strip) ---
        const neonStripGeo = new THREE.BoxGeometry(config.length, 0.1, 0.02);
        const neonStripMat = new THREE.MeshStandardMaterial({ 
            color: config.neonColor, 
            emissive: config.neonColor, 
            emissiveIntensity: NEON_INTENSITY * 0.5, 
            side: THREE.DoubleSide 
        });
        const neonStrip = new THREE.Mesh(neonStripGeo, neonStripMat);
        
        // Position the strip slightly above the panel, centered on the wall
        const stripY = PANEL_Y_POSITION + 2 + 0.1; 
        const stripOffsetVector = new THREE.Vector3(0, 0, WALL_THICKNESS / 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), config.rotationY);
        
        neonStrip.position.set(
            config.position[0] + stripOffsetVector.x, 
            stripY, 
            config.position[2] + stripOffsetVector.z
        );
        neonStrip.rotation.y = config.rotationY;
        scene.add(neonStrip);
    });
    
    // --- 4. Lighting Setup (Ambient and Ceiling Shader) ---
    // Ambient and Hemisphere lights updated for moody aesthetic
    scene.add(new THREE.AmbientLight(0x6b2b6b, 0.25)); // purple ambient
    const hemi = new THREE.HemisphereLight(0x202030, 0x080006, 0.3); // cold fill underneath
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.12); // directional rim light
    dir.position.set(5, 10, 5);
    scene.add(dir);

    // The ceiling shader material is already created in the floor/ceiling loop
    const ceilingMeshObject = scene.children.find(c => c instanceof THREE.Mesh && c.position.y === WALL_HEIGHT);
    const ceilingMesh = ceilingMeshObject instanceof THREE.Mesh ? ceilingMeshObject : null;
    const ceilingMaterial = ceilingMesh ? (ceilingMesh.material as THREE.ShaderMaterial) : null;

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
    renderer.domElement.addEventListener('click', onDocumentMouseDown);

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

      if (ceilingMaterial && ceilingMaterial.uniforms) {
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
        
        // --- Collision Detection (Complex Wall Segments) ---
        const currentX = camera.position.x;
        const currentZ = camera.position.z;
        
        let collisionDetected = false;
        
        for (const [x1, z1, x2, z2] of collisionSegmentsRef.current) {
            const distance = distToSegment(currentX, currentZ, x1, z1, x2, z2);
            
            if (distance < COLLISION_DISTANCE) {
                // Simple rollback: if collision detected, revert to previous position
                camera.position.x = prevX;
                camera.position.z = prevZ;
                collisionDetected = true;
                break; 
            }
        }
        
        // If collision was detected, we stop movement for this frame
        if (collisionDetected) {
            velocity.set(0, 0, 0);
        }
        
        camera.position.y = 1.6;
        
        raycaster.setFromCamera(center, camera);
        const intersects = raycaster.intersectObjects(panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow, p.descriptionMesh]), true);
        
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
      composer.render(); // Use composer for rendering
    };

    const onWindowResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      
      // Resize composer and FXAA pass
      composer.setSize(w, h);
      const pixelRatio = Math.min(window.devicePixelRatio, 2);
      fxaaPass.material.uniforms["resolution"].value.x = 1 / (w * pixelRatio);
      fxaaPass.material.uniforms["resolution"].value.y = 1 / (h * pixelRatio);
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
      document.removeEventListener('click', onDocumentMouseDown);
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
              if ('map' in m && m.map) m.map.dispose(); 
              m.dispose(); 
            });
          } else { 
            const mat = obj.material as THREE.Material;
            // FIX: Safely check for 'map' property before disposing
            if ('map' in mat && mat.map) mat.map.dispose(); 
            mat.dispose(); 
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