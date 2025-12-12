import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource, NftAttribute } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';
import { createGifTexture } from '@/utils/gifTexture';
import { MarketBrowserRefined } from './MarketBrowserRefined';
import { GalleryInfo } from './GalleryInfo';
import {
  EffectComposer,
  RenderPass,
  UnrealBloomPass,
  FXAAShader,
  ShaderPass,
} from 'three-stdlib';
import { GalleryLayout, MaterialId } from '@/scene/unrealUnityLayout';

// Initialize post‑processing utilities
RectAreaLightUniformsLib.init();

// ---------------------------
// ** NEW CONSTANTS & TYPES **
// ---------------------------

const TEXT_PANEL_OFFSET_X = 0.8; // spacing for description/attributes panels
const TEXT_DEPTH_OFFSET = 0.05; // Offset text panels slightly from the wall

// Panel interface – mirrors the structure used throughout the component
interface Panel {
  mesh: THREE.Mesh;
  wallName: string;
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
  currentAttributes: any[];
  videoElement: HTMLVideoElement | null;
  gifStopFunction: (() => void) | null;
}

// -------------------------------------------------------------------
// Helper: creates the framed panel (backboard, frame, image plane)
// -------------------------------------------------------------------
function createFramedPanel(width: number, height: number, emissiveColor: number) {
  const group = new THREE.Group();

  // Backboard (dark matte)
  const backGeo = new THREE.PlaneGeometry(width, height);
  const backMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a,
    roughness: 0.8, // fixed: use decimal value
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const back = new THREE.Mesh(backGeo, backMat);
  back.position.set(0, 0, 0.01);
  group.add(back);

  // Frame rim (emissive)
  const rimDepth = 0.06;
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x0b0b0b,
    emissive: emissiveColor,
    emissiveIntensity: 1.6,
    roughness: 0.25,
    metalness: 0.4,
  });
  const rim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.12, height + 0.12, rimDepth), rimMat);
  rim.position.set(0, 0, -0.02);
  group.add(rim);

  // Image plane (will receive textures)
  const imgMat = new THREE.MeshBasicMaterial({ color: 0x222122, side: THREE.DoubleSide });
  const imgGeo = new THREE.PlaneGeometry(width - 0.2, height - 0.2);
  const imageMesh = new THREE.Mesh(imgGeo, imgMat);
  imageMesh.position.set(0, 0, 0.02);
  group.add(imageMesh);

  // Neon border lines (optional visual flair)
  const neonMat = new THREE.MeshStandardMaterial({
    emissive: emissiveColor,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  const horizGeom = new THREE.BoxGeometry(width + 0.05, 0.03, 0.015);
  const vertGeom = new THREE.BoxGeometry(0.03, height + 0.05, 0.015);
  const top = new THREE.Mesh(horizGeom, neonMat);
  top.position.set(0, height / 2 + 0.06, 0.03);
  const bottom = top.clone();
  bottom.position.set(0, -height / 2 - 0.06, 0.03);
  const left = new THREE.Mesh(vertGeom, neonMat);
  left.position.set(-width / 2 - 0.06, 0, 0.03);
  const right = left.clone();
  right.position.set(width / 2 + 0.06, 0, 0.03);
  group.add(top, bottom, left, right);

  return { group, imageMesh };
}

// -------------------------------------------------------------------
// Helper: create text canvas textures (unchanged)
// -------------------------------------------------------------------
const createTextTexture = (text: string, width: number, height: number, fontSize: number = 30, color: string = 'white', options: { scrollY?: number; wordWrap?: boolean } = {}): { texture: THREE.CanvasTexture; totalHeight: number } => {
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
      if (metrics.width > maxTextWidth && n > 0) {
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
        const words = line.split(' ');
        let currentLine = '';
        for (let n = 0; n < words.length; n++) {
          const testLine = currentLine + words[n] + ' ';
          const metrics = context.measureText(testLine);
          if (metrics.width > maxTextWidth && n > 0) {
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
  const collisionSegmentsRef = useRef<[number, number, number, number][]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [marketBrowserState, setMarketBrowserState] = useState<{
    open: boolean;
    collection?: string;
    tokenId?: string | number;
  }>({ open: false });

  // Click‑activated info panel state
  const [selectedInfo, setSelectedInfo] = useState<{
    title?: string;
    description?: string;
    collection?: string;
    tokenId?: string | number;
  } | null>(null);

  // Constants
  const TEXT_PANEL_WIDTH = 2.5;
  const TITLE_HEIGHT = 0.5;
  const DESCRIPTION_HEIGHT = 1.5;
  const ATTRIBUTES_HEIGHT = 1.5;
  const DESCRIPTION_PANEL_HEIGHT = TITLE_HEIGHT + DESCRIPTION_HEIGHT;
  const TITLE_PANEL_WIDTH = 4.0;
  const FLOOR_COLOR = 0x1b1416;
  const ARROW_COLOR = 0xcccccc;
  const ARROW_COLOR_HOVER = 0x00ff00;
  const ARROW_PANEL_OFFSET = 1.5;
  const PANEL_OFFSET = 0.15;
  const PLAYER_RADIUS = 0.5;
  const WALL_THICKNESS = 0.1;
  const COLLISION_DISTANCE = PLAYER_RADIUS + WALL_THICKNESS;
  const NEON_COLOR_MAGENTA = 0xff1bb3;

  // Resize‑related globals
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let composer: EffectComposer;
  let fxaaPass: ShaderPass;
  let ceilingMaterial: THREE.ShaderMaterial | null = null;

  // -----------------------------------------------------------------
  // Video / GIF handling (unchanged)
  // -----------------------------------------------------------------
  const manageVideoPlayback = useCallback((shouldPlay: boolean) => {
    panelsRef.current.forEach(panel => {
      if (panel.videoElement) {
        if (shouldPlay) {
          const controlsLocked = (window as any).galleryControls?.isLocked?.() ?? false;
          if (controlsLocked) {
            panel.videoElement.play().catch(e => console.warn('Video playback prevented:', e));
          }
        } else {
          panel.videoElement.pause();
        }
      }
    });
  }, []);

  const isVideoContent = (contentType: string, url: string) => !!(contentType.startsWith('video/') || url.match(/\.(mp4|webm|ogg)(\?|$)/i));
  const isGifContent = (contentType: string, url: string) => !!(contentType === 'image/gif' || url.match(/\.gif(\?|$)/i));

  const disposeTextureSafely = (mesh: THREE.Mesh) => {
    if (mesh.material instanceof THREE.MeshBasicMaterial) {
      if (mesh.material.map && typeof mesh.material.map.dispose === 'function') {
        mesh.material.map.dispose();
        mesh.material.map = null;
      }
      mesh.material.dispose();
    }
  };

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
        panel.gifStopFunction();
        panel.gifStopFunction = null;
      }

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
            videoEl.play().catch(e => console.warn('Video playback prevented:', e));
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
          console.error('GIF decode failed, falling back to static image:', error);
        }
      }

      return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        loader.load(
          url,
          texture => resolve(texture),
          undefined,
          err => {
            console.error('Error loading texture:', url, err);
            showError(`Failed to load image: ${url.substring(0, 50)}...`);
            reject(err);
          }
        );
      });
    },
    []
  );

  // -----------------------------------------------------------------
  // Update panel content (unchanged except types)
  // -----------------------------------------------------------------
  const updatePanelContent = useCallback(
    async (panel: Panel, source: NftSource | null) => {
      const collectionConfig = GALLERY_PANEL_CONFIG[panel.wallName];
      const collectionName = collectionConfig?.name || '...';
      const textColor = collectionConfig?.text_color || 'white';

      // Wall title
      disposeTextureSafely(panel.wallTitleMesh);
      const { texture: wallTitleTexture } = createTextTexture(collectionName, 8, 0.75, 120, textColor, { wordWrap: false });
      (panel.wallTitleMesh.material as THREE.MeshBasicMaterial).map = wallTitleTexture;
      panel.wallTitleMesh.visible = true;

      // Main mesh reset
      if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
        if (panel.mesh.material.map) {
          panel.mesh.material.map.dispose();
          panel.mesh.material.map = null;
        }
        panel.mesh.material.color.set(0x222122);
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

      if (!source || source.contractAddress === '') {
        const showArrows = collectionConfig && collectionConfig.tokenIds.length > 1;
        panel.prevArrow.visible = showArrows;
        panel.nextArrow.visible = showArrows;
        return;
      }

      const metadata: NftMetadata | null = await getCachedNftMetadata(source.contractAddress, source.tokenId);
      if (!metadata) {
        console.warn(`Skipping panel ${panel.wallName} (${source.contractAddress}/${source.tokenId}) – metadata fetch failed.`);
        if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
          const { texture: errTex } = createTextTexture('NFT Unavailable', 2, 2, 80, 'red', { wordWrap: false });
          panel.mesh.material.map = errTex;
          panel.mesh.material.color.set(0xff0000);
        }
        return;
      }

      try {
        const contentUrl = metadata.contentUrl;
        const isVideo = isVideoContent(metadata.contentType, contentUrl);
        const isGif = isGifContent(metadata.contentType, contentUrl);
        const texture = await loadTexture(contentUrl, panel, metadata.contentType);

        if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
          panel.mesh.material.map = texture;
          panel.mesh.material.color.set(0xffffff);
        }

        panel.metadataUrl = metadata.source;
        panel.isVideo = isVideo;
        panel.isGif = isGif;

        // Title
        disposeTextureSafely(panel.titleMesh);
        const { texture: titleTex } = createTextTexture(metadata.title, TITLE_PANEL_WIDTH, TITLE_HEIGHT, 120, textColor, { wordWrap: false });
        (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTex;
        panel.titleMesh.visible = true;

        // Description
        disposeTextureSafely(panel.descriptionMesh);
        const { texture: descTex, totalHeight } = createTextTexture(metadata.description, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, textColor, { wordWrap: true });
        (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = descTex;
        panel.descriptionMesh.visible = true;
        panel.currentDescription = metadata.description;
        panel.descriptionTextHeight = totalHeight;
        panel.descriptionScrollY = 0;

        // Attributes
        disposeTextureSafely(panel.attributesMesh);
        const { texture: attrTex } = createAttributesTextTexture(metadata.attributes || [], TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT, 40, textColor);
        (panel.attributesMesh.material as THREE.MeshBasicMaterial).map = attrTex;
        panel.attributesMesh.visible = true;

        // No hover update here; click will populate selectedInfo later.

        showSuccess(isVideo ? `Loaded video NFT: ${metadata.title}` : isGif ? `Loaded animated GIF: ${metadata.title}` : `Loaded image NFT: ${metadata.title}`);
      } catch (error) {
        console.error(`Error loading NFT content for ${panel.wallName}:`, error);
        showError(`Failed to load NFT content for ${panel.wallName}.`);
      }

      const showArrows = collectionConfig && collectionConfig.tokenIds.length > 1;
      panel.prevArrow.visible = showArrows;
      panel.nextArrow.visible = showArrows;
    },
    [loadTexture]
  );

  // -----------------------------------------------------------------
  // Build walls, panels, and collision data from the layout
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0410);
    scene.fog = new THREE.FogExp2(0x0a0410, 0.01); // Reduced fog density for larger space

    // Ambient light – softer to reduce harsh white
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(ambientLight);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    // Camera – start on Floor 1
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 1.6, 10); // Center of F1, near the entrance

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
          const muted = activeVideos[0].videoElement!.muted;
          activeVideos.forEach(p => {
            p.videoElement!.muted = !muted;
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

    // Post‑processing
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.4, 0.85);
    bloomPass.threshold = 0.2;
    bloomPass.strength = 1.0;
    bloomPass.radius = 0.7;
    composer.addPass(bloomPass);
    fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pixelRatio);
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pixelRatio);
    composer.addPass(fxaaPass);

    // -----------------------------------------------------------------
    // Material Factory
    // -----------------------------------------------------------------
    const materialMap = new Map<MaterialId, THREE.Material>();
    
    const getMaterial = (id: MaterialId, height: number) => {
        if (materialMap.has(id)) return materialMap.get(id)!;

        let mat: THREE.Material;
        switch (id) {
            case MaterialId.WhitePlaster:
                mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.1 });
                break;
            case MaterialId.GraphiteMicrocement:
                mat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.05 });
                break;
            case MaterialId.PolishedConcrete:
                mat = new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, roughness: 0.9, metalness: 0.05 });
                break;
            case MaterialId.DarkResin:
                mat = new THREE.MeshStandardMaterial({ color: 0x0a0410, roughness: 0.1, metalness: 0.9 });
                break;
            case MaterialId.Glass:
                mat = new THREE.MeshStandardMaterial({ 
                    color: 0xcccccc, 
                    transparent: true, 
                    opacity: 0.2, 
                    roughness: 0.1, 
                    metalness: 0.9,
                    side: THREE.DoubleSide
                });
                break;
            default:
                mat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.5 });
        }
        materialMap.set(id, mat);
        return mat;
    };

    // -----------------------------------------------------------------
    // Build floors, ceilings, and walls
    // -----------------------------------------------------------------
    const floorGroup = new THREE.Group();
    const ceilingGroup = new THREE.Group();

    GalleryLayout.rooms.forEach(room => {
      const [roomW, roomD] = room.size;
      const [x, y, z] = room.position;
      
      // Floor
      const floorGeo = new THREE.PlaneGeometry(roomW, roomD);
      const floorMat = getMaterial(room.material, room.ceilingHeight);
      
      // Create floor mesh at the correct Y level
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(x + roomW / 2, room.floorY, z + roomD / 2);
      floorGroup.add(floor);

      // Ceiling
      const ceilingMat = getMaterial(MaterialId.WhitePlaster, room.ceilingHeight);
      const ceiling = new THREE.Mesh(floorGeo.clone(), ceilingMat);
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.set(x + roomW / 2, room.floorY + room.ceilingHeight, z + roomD / 2);
      ceilingGroup.add(ceiling);
    });
    scene.add(floorGroup);
    scene.add(ceilingGroup);

    // -----------------------------------------------------------------
    // Build walls + panels
    // -----------------------------------------------------------------
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15);
    arrowShape.lineTo(0.3, 0);
    arrowShape.lineTo(0, -0.15);
    arrowShape.lineTo(0, 0.15);
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: ARROW_COLOR, side: THREE.DoubleSide });

    const textMatFactory = () =>
      new THREE.MeshBasicMaterial({ map: null, transparent: true, side: THREE.DoubleSide, alphaTest: 0.01, depthWrite: false });
    const titleGeometry = new THREE.PlaneGeometry(4, 0.5);
    const descriptionGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT);
    const attributesGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT);
    const wallTitleGeometry = new THREE.PlaneGeometry(8, 0.75);

    panelsRef.current = [];
    collisionSegmentsRef.current = [];

    GalleryLayout.walls.forEach(wall => {
      const wallMat = getMaterial(wall.material, wall.height);
      
      // Wall mesh
      const wallGeo = new THREE.PlaneGeometry(wall.length, wall.height);
      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.set(...wall.position);
      wallMesh.rotation.y = wall.rotationY;
      scene.add(wallMesh);
      wallMeshesRef.current.set(wall.key, wallMesh);

      // Collision segment (Only for perimeter walls, not atrium balustrades or spiral panels)
      if (wall.key.startsWith('wall-') || wall.key.startsWith('octagon-')) {
          const halfLen = wall.length / 2;
          const cosR = Math.cos(wall.rotationY);
          const sinR = Math.sin(wall.rotationY);
          const cx = wall.position[0];
          const cz = wall.position[2];
          const x1 = cx - halfLen * cosR;
          const z1 = cz + halfLen * sinR;
          const x2 = cx + halfLen * cosR;
          const z2 = cz - halfLen * sinR;
          collisionSegmentsRef.current.push([x1, z1, x2, z2]);
      }


      // Panel
      if (wall.hasPanel) {
        const { group: panelGroup, imageMesh } = createFramedPanel(2, 2, NEON_COLOR_MAGENTA);
        
        // Panel position is relative to the wall position, but we use the wall's position directly
        // since the wall definition already includes the offset from the center line.
        panelGroup.position.set(wall.position[0], wall.position[1], wall.position[2]);
        panelGroup.rotation.y = wall.rotationY;
        scene.add(panelGroup);

        // Arrows (positioned relative to the panel group)
        const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
        prevArrow.rotation.set(0, wall.rotationY + Math.PI, 0);
        const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
        nextArrow.rotation.copy(wallGroupRotation(wall.rotationY));
        
        const basePos = panelGroup.position.clone();
        const rightVec = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, wall.rotationY, 0));
        
        // Adjust arrow positions based on panel size (2m wide)
        const ARROW_OFFSET = 1.5; 
        prevArrow.position.copy(basePos.clone().addScaledVector(rightVec, -ARROW_OFFSET));
        nextArrow.position.copy(basePos.clone().addScaledVector(rightVec, ARROW_OFFSET));
        
        // Ensure arrows are slightly offset from the wall plane
        const forwardVec = forwardVector(wall.rotationY);
        prevArrow.position.addScaledVector(forwardVec, PANEL_OFFSET);
        nextArrow.position.addScaledVector(forwardVec, PANEL_OFFSET);
        
        scene.add(prevArrow);
        scene.add(nextArrow);

        // Title
        const titleMesh = new THREE.Mesh(titleGeometry, textMatFactory());
        titleMesh.rotation.copy(wallGroupRotation(wall.rotationY));
        const titlePos = basePos
          .clone()
          .addScaledVector(new THREE.Vector3(0, 1, 0), -1 - TITLE_HEIGHT / 2 - 0.1)
          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
        titleMesh.position.copy(titlePos);
        titleMesh.visible = false;
        scene.add(titleMesh);

        // Description
        const descriptionMesh = new THREE.Mesh(descriptionGeometry, textMatFactory());
        descriptionMesh.rotation.copy(wallGroupRotation(wall.rotationY));
        const descPos = basePos
          .clone()
          .addScaledVector(rightVector(wall.rotationY), -TEXT_PANEL_OFFSET_X)
          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
        descriptionMesh.position.copy(descPos);
        descriptionMesh.visible = false;
        scene.add(descriptionMesh);

        // Attributes
        const attributesMesh = new THREE.Mesh(attributesGeometry, textMatFactory());
        attributesMesh.rotation.copy(wallGroupRotation(wall.rotationY));
        const attrPos = basePos
          .clone()
          .addScaledVector(rightVector(wall.rotationY), TEXT_PANEL_OFFSET_X)
          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
        attributesMesh.position.copy(attrPos);
        attributesMesh.visible = false;
        scene.add(attributesMesh);

        // Wall title (placed above the panel)
        const wallTitleMesh = new THREE.Mesh(wallTitleGeometry, textMatFactory());
        wallTitleMesh.rotation.copy(wallGroupRotation(wall.rotationY));
        wallTitleMesh.position.set(wall.position[0], wall.position[1] + wall.height / 2 - 0.5, wall.position[2]);
        wallTitleMesh.position.addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
        wallTitleMesh.visible = false;
        scene.add(wallTitleMesh);

        const panelObj: Panel = {
          mesh: imageMesh,
          wallName: wall.key,
          metadataUrl: '',
          isVideo: false,
          isGif: false,
          prevArrow,
          nextArrow,
          titleMesh,
          descriptionMesh,
          attributesMesh,
          wallTitleMesh,
          currentDescription: '',
          descriptionScrollY: 0,
          descriptionTextHeight: 0,
          currentAttributes: [],
          videoElement: null,
          gifStopFunction: null,
        };
        panelsRef.current.push(panelObj);
      }
    });

    // Helper rotation / vector functions
    function wallGroupRotation(yaw: number) {
      return new THREE.Euler(0, yaw, 0, 'XYZ');
    }
    function forwardVector(yaw: number) {
      const v = new THREE.Vector3(0, 0, 1);
      v.applyEuler(new THREE.Euler(0, yaw, 0));
      return v;
    }
    function rightVector(yaw: number) {
      const v = new THREE.Vector3(1, 0, 0);
      v.applyEuler(new THREE.Euler(0, yaw, 0));
      return v;
    }

    // -----------------------------------------------------------------
    // Lighting – using layout definitions
    // -----------------------------------------------------------------
    GalleryLayout.lights.forEach(l => {
      let light: THREE.Light;
      const color = new THREE.Color(l.color[0] / 255, l.color[1] / 255, l.color[2] / 255);
      
      switch (l.type) {
        case 'spot':
          const spot = new THREE.SpotLight(color, l.intensity / 1200);
          spot.position.set(...l.position);
          spot.angle = ((l.angle ?? 30) * Math.PI) / 180;
          spot.target.position.set(...(l.target ?? [0, 0, 0]));
          scene.add(spot.target);
          light = spot;
          break;
        case 'area':
          const rect = new THREE.RectAreaLight(color, l.intensity / 800, 2, 2);
          rect.position.set(...l.position);
          rect.lookAt(new THREE.Vector3(...(l.target ?? [0, 0, 0])));
          scene.add(rect);
          light = rect;
          break;
        case 'neon':
          const neon = new THREE.PointLight(color, l.intensity / 250, 5);
          neon.position.set(...l.position);
          light = neon;
          break;
        default:
          const p = new THREE.PointLight(color, l.intensity / 1200);
          p.position.set(...l.position);
          light = p;
      }
      scene.add(light);
    });

    // -----------------------------------------------------------------
    // Input handling (unchanged)
    // -----------------------------------------------------------------
    let moveForward = false,
      moveBackward = false,
      moveLeft = false,
      moveRight = false;
    const velocity = new THREE.Vector3(),
      direction = new THREE.Vector3(),
      speed = 20.0;

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

    // -----------------------------------------------------------------
    // Raycaster for UI interaction
    // -----------------------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);
    let currentTargetedPanel: Panel | null = null;
    let currentTargetedArrow: THREE.Mesh | null = null;
    let currentTargetedDescriptionPanel: Panel | null = null;

    const onDocumentMouseDown = () => {
      if (!controls.isLocked) return;
      if (currentTargetedArrow) {
        const panel = panelsRef.current.find(p => p.prevArrow === currentTargetedArrow || p.nextArrow === currentTargetedArrow);
        if (panel) {
          const dir = currentTargetedArrow === panel.nextArrow ? 'next' : 'prev';
          if (updatePanelIndex(panel.wallName, dir)) {
            const newSrc = getCurrentNftSource(panel.wallName);
            updatePanelContent(panel, newSrc);
          }
        }
      } else if (currentTargetedPanel) {
        // Click on panel – populate info overlay
        const src = getCurrentNftSource(currentTargetedPanel.wallName);
        if (src) {
          setSelectedInfo({
            title: undefined,
            description: undefined,
            collection: src.contractAddress,
            tokenId: src.tokenId,
          });
        }
      }
    };
    renderer.domElement.addEventListener('click', onDocumentMouseDown);

    // -----------------------------------------------------------------
    // Description scrolling
    // -----------------------------------------------------------------
    const onDocumentWheel = (event: WheelEvent) => {
      if (!controls.isLocked || !currentTargetedDescriptionPanel) return;
      const panel = currentTargetedDescriptionPanel;
      const scrollAmt = event.deltaY * 0.5;
      const canvasHeight = 512;
      const padding = 40;
      const viewHeight = canvasHeight - 2 * padding;
      const maxScroll = Math.max(0, panel.descriptionTextHeight - viewHeight);
      let newY = panel.descriptionScrollY + scrollAmt;
      newY = Math.max(0, Math.min(newY, maxScroll));
      if (newY !== panel.descriptionScrollY) {
        panel.descriptionScrollY = newY;
        const textColor = GALLERY_PANEL_CONFIG[panel.wallName]?.text_color || 'white';
        const { texture } = createTextTexture(panel.currentDescription, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, textColor, {
          wordWrap: true,
          scrollY: newY,
        });
        (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = texture;
      }
    };
    document.addEventListener('wheel', onDocumentWheel);

    // -----------------------------------------------------------------
    // Animation loop
    // -----------------------------------------------------------------
    let prevTime = performance.now();
    const startTime = performance.now();
    const animate = () => {
      requestAnimationFrame(animate);
      const now = performance.now();
      const delta = (now - prevTime) / 1000;
      const elapsed = (now - startTime) / 1000;

      if (ceilingMaterial && (ceilingMaterial as any).uniforms) {
        (ceilingMaterial as any).uniforms.time.value = elapsed;
      }

      if (controls.isLocked) {
        // Movement
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

        // Collision (Simplified 2D collision for perimeter walls only)
        const curX = camera.position.x;
        const curZ = camera.position.z;
        
        // Check 50x50 boundary
        const L = GalleryLayout.footprint.width;
        const T = GalleryLayout.footprint.wallThickness;
        const HALF_T = T / 2;
        const boundaryMin = HALF_T + PLAYER_RADIUS;
        const boundaryMax = L - HALF_T - PLAYER_RADIUS;
        
        if (curX < boundaryMin || curX > boundaryMax || curZ < boundaryMin || curZ > boundaryMax) {
            camera.position.x = prevX;
            camera.position.z = prevZ;
            velocity.set(0, 0, 0);
        } else {
            // Check internal collision segments (Perimeter and Octagon walls)
            for (const [x1, z1, x2, z2] of collisionSegmentsRef.current) {
              const dist = distToSegment(curX, curZ, x1, z1, x2, z2);
              if (dist < COLLISION_DISTANCE) {
                camera.position.x = prevX;
                camera.position.z = prevZ;
                velocity.set(0, 0, 0);
                break;
              }
            }
        }

        // Gravity/Floor snapping (Simplified vertical movement)
        const currentFloor = GalleryLayout.rooms.find(r => camera.position.y > r.floorY && camera.position.y <= r.floorY + r.ceilingHeight);
        if (currentFloor) {
            // Snap player to the floor level
            camera.position.y = currentFloor.floorY + 1.6; 
        } else {
            // If player is outside a defined room (e.g., in the atrium void), snap to F1 floor
            if (camera.position.y < 1.6) {
                camera.position.y = 1.6;
            }
            // NOTE: Full vertical movement (jumping/stair climbing) is omitted for simplicity.
        }


        // Raycast hover (for arrow highlighting only)
        raycaster.setFromCamera(center, camera);
        const intersectObjs = raycaster.intersectObjects(
          panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow, p.descriptionMesh]),
          true
        );

        panelsRef.current.forEach(p => {
          (p.prevArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR);
          (p.nextArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR);
        });
        currentTargetedPanel = null;
        currentTargetedArrow = null;
        currentTargetedDescriptionPanel = null;

        if (intersectObjs.length > 0 && intersectObjs[0].distance < 5) {
          const tgt = intersectObjs[0].object as THREE.Mesh;
          const panel = panelsRef.current.find(p => p.mesh === tgt || p.prevArrow === tgt || p.nextArrow === tgt || p.descriptionMesh === tgt);
          if (panel) {
            if (tgt === panel.mesh) {
              currentTargetedPanel = panel;
            } else if (tgt === panel.prevArrow || tgt === panel.nextArrow) {
              currentTargetedArrow = tgt;
              (tgt.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_HOVER);
            } else if (tgt === panel.descriptionMesh) {
              currentTargetedDescriptionPanel = panel;
            }
          }
        }
      }

      prevTime = now;
      composer.render();
    };
    animate();

    // -----------------------------------------------------------------
    // Distance helper for collisions
    // -----------------------------------------------------------------
    function distToSegment(px: number, pz: number, x1: number, z1: number, x2: number, z2: number) {
      const dx = x2 - x1;
      const dz = z2 - z1;
      const lenSq = dx * dx + dz * dz;
      if (lenSq === 0) return Math.hypot(px - x1, pz - z1);
      let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = x1 + t * dx;
      const cz = z1 + t * dz;
      return Math.hypot(px - cx, pz - cz);
    }

    // -----------------------------------------------------------------
    // Load all panels after config init
    // -----------------------------------------------------------------
    const loadAllPanels = async () => {
      await initializeGalleryConfig();
      for (const panel of panelsRef.current) {
        const src = getCurrentNftSource(panel.wallName);
        await updatePanelContent(panel, src);
        await new Promise(res => setTimeout(res, 100));
      }
      manageVideoPlayback(controls.isLocked);
    };
    loadAllPanels();

    // -----------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------
    return () => {
      document.removeEventListener('click', onDocumentMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('wheel', onDocumentWheel);
      window.removeEventListener('resize', onWindowResize);
      mountRef.current?.removeChild(renderer.domElement);
      controls.dispose();

      panelsRef.current.forEach(p => {
        if (p.videoElement) {
          p.videoElement.pause();
          p.videoElement.removeAttribute('src');
        }
        if (p.gifStopFunction) p.gifStopFunction();
      });

      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => {
              if ((m as any).map) (m as any).map.dispose();
              m.dispose();
            });
          } else {
            const mat = obj.material as THREE.Material;
            if ('map' in mat && (mat as any).map) (mat as any).map.dispose();
            mat.dispose();
          }
        }
      });
      renderer.dispose();
      delete (window as any).galleryControls;
    };
  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback]);

  // -----------------------------------------------------------------
  // Window resize handling
  // -----------------------------------------------------------------
  const onWindowResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (camera && renderer && composer && fxaaPass) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      const pixelRatio = Math.min(window.devicePixelRatio, 2);
      fxaaPass.material.uniforms['resolution'].value.x = 1 / (w * pixelRatio);
      fxaaPass.material.uniforms['resolution'].value.y = 1 / (h * pixelRatio);
    }
  };
  window.addEventListener('resize', onWindowResize);

  // -----------------------------------------------------------------
  // UI – Market browser modal and info overlay (clicked panel)
  // -----------------------------------------------------------------
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
      {selectedInfo && (
        <GalleryInfo
          title={selectedInfo.title}
          description={selectedInfo.description}
          collection={selectedInfo.collection}
          tokenId={selectedInfo.tokenId}
          onOpenMarketplace={() => {
            if (selectedInfo.collection && selectedInfo.tokenId !== undefined) {
              setMarketBrowserState({
                open: true,
                collection: selectedInfo.collection,
                tokenId: selectedInfo.tokenId,
              });
            }
          }}
        />
      )}
    </>
  );
};

export default NftGallery;