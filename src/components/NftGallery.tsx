import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource, NftAttribute } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';
import { createGifTexture } from '@/utils/gifTexture';
import { MarketBrowserRefined } from './MarketBrowserRefined';
import {
  EffectComposer,
  RenderPass,
  UnrealBloomPass,
  FXAAShader,
  ShaderPass,
} from 'three-stdlib';

// Import the new layout definition
import { GalleryLayout, MaterialId } from '@/scene/unrealUnityLayout';

// Post-processing imports for the new aesthetic
RectAreaLightUniformsLib.init();

// Constants for geometry (kept largely unchanged)
const TEXT_PANEL_WIDTH = 2.5;
const TITLE_HEIGHT = 0.5;
const DESCRIPTION_HEIGHT = 1.5;
const ATTRIBUTES_HEIGHT = 1.5;
const DESCRIPTION_PANEL_HEIGHT = TITLE_HEIGHT + DESCRIPTION_HEIGHT;

// Neon/room specific constants
const NEON_COLOR_CYAN = 0x33f0ff;
const NEON_COLOR_MAGENTA = 0xff1bb3;
const NEON_INTENSITY = 1.5;

// Wall appearance constants
const WALL_COLOR = 0x151217;
const FLOOR_COLOR = 0x1b1416;
const PANEL_Y_POSITION = 3.0;
const PANEL_OFFSET = 0.15;
const ARROW_PANEL_OFFSET = 1.5;
const TEXT_DEPTH_OFFSET = 0.16;
const TITLE_PANEL_WIDTH = 4.0;
const ARROW_COLOR_DEFAULT = 0xcccccc,
  ARROW_COLOR_HOVER = 0x00ff00;

// Collision constants
const PLAYER_RADIUS = 0.5;
const WALL_THICKNESS = 0.1;
const COLLISION_DISTANCE = PLAYER_RADIUS + WALL_THICKNESS;

// Arrow colors
const ARROW_COLOR = ARROW_COLOR_DEFAULT;

// Helper: VR shader (unchanged)
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
    vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
    void main() {
        float hue = mod(time * 0.05, 1.0);
        float pulse = 0.3 + sin(time * 0.5) * 0.1;
        float saturation = 0.8;
        vec3 color = hsv2rgb(vec3(hue, saturation, pulse));
        gl_FragColor = vec4(color, opacity);
    }
`;

// Helper functions (unchanged)
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
  // -----------------------------------------------------------------

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

      // Cleanup previous media
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

      // Default: static image
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
  // Panel / Wall creation – now driven by the layout data
  // -----------------------------------------------------------------
  const createFramedPanel = (w: number, h: number, emissiveColor: number) => {
    const group = new THREE.Group();

    // Backboard (dark)
    const backGeo = new THREE.PlaneGeometry(w, h);
    const backMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
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
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, rimDepth), rimMat);
    rim.position.set(0, 0, -0.02);
    group.add(rim);

    // Image plane
    const imageMat = new THREE.MeshBasicMaterial({ color: 0x222122, side: THREE.DoubleSide });
    const imageGeo = new THREE.PlaneGeometry(w - 0.2, h - 0.2);
    const imageMesh = new THREE.Mesh(imageGeo, imageMat);
    imageMesh.position.set(0, 0, 0.02);
    group.add(imageMesh);

    // Neon border line (thin tube)
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

  // -----------------------------------------------------------------
  // Update panel content – unchanged except now we pass the source
  // -----------------------------------------------------------------
  const updatePanelContent = useCallback(
    async (panel: Panel, source: NftSource | null) => {
      const collectionConfig = GALLERY_PANEL_CONFIG[panel.wallName];
      const collectionName = collectionConfig?.name || '...';
      const textColor = collectionConfig?.text_color || 'white';

      // Reset wall title first
      disposeTextureSafely(panel.wallTitleMesh);
      const { texture: wallTitleTexture } = createTextTexture(collectionName, 8, 0.75, 120, textColor, { wordWrap: false });
      (panel.wallTitleMesh.material as THREE.MeshBasicMaterial).map = wallTitleTexture;
      panel.wallTitleMesh.visible = true;

      // Reset main mesh material
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

      // Fetch metadata (cached)
      const metadata: NftMetadata | null = await getCachedNftMetadata(source.contractAddress, source.tokenId);
      if (!metadata) {
        console.warn(`Skipping panel ${panel.wallName} (${source.contractAddress}/${source.tokenId}) – metadata fetch failed.`);
        if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
          const { texture: errorTexture } = createTextTexture('NFT Unavailable', 2, 2, 80, 'red', { wordWrap: false });
          panel.mesh.material.map = errorTexture;
          panel.mesh.material.color.set(0xff0000);
        }
        return;
      }

      try {
        const contentUrl = metadata.contentUrl;
        const isVideo = isVideoContent(metadata.contentType, contentUrl);
        const isGif = isGifContent(metadata.contentType, contentUrl);
        const texture = await loadTexture(contentUrl, panel, metadata.contentType);

        // Apply texture to main mesh
        if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
          panel.mesh.material.map = texture;
          panel.mesh.material.color.set(0xffffff);
        }

        panel.metadataUrl = metadata.source;
        panel.isVideo = isVideo;
        panel.isGif = isGif;

        // Title
        disposeTextureSafely(panel.titleMesh);
        const { texture: titleTexture } = createTextTexture(metadata.title, TITLE_PANEL_WIDTH, TITLE_HEIGHT, 120, textColor, { wordWrap: false });
        (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTexture;
        panel.titleMesh.visible = true;

        // Description
        disposeTextureSafely(panel.descriptionMesh);
        const { texture: descriptionTexture, totalHeight } = createTextTexture(metadata.description, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, textColor, { wordWrap: true });
        (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = descriptionTexture;
        panel.descriptionMesh.visible = true;
        panel.currentDescription = metadata.description;
        panel.descriptionTextHeight = totalHeight;
        panel.descriptionScrollY = 0;

        // Attributes
        disposeTextureSafely(panel.attributesMesh);
        const { texture: attributesTexture } = createAttributesTextTexture(metadata.attributes || [], TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT, 40, textColor);
        (panel.attributesMesh.material as THREE.MeshBasicMaterial).map = attributesTexture;
        panel.attributesMesh.visible = true;

        showSuccess(isVideo ? `Loaded video NFT: ${metadata.title}` : isGif ? `Loaded animated GIF: ${metadata.title}` : `Loaded image NFT: ${metadata.title}`);
      } catch (error) {
        console.error(`Error loading NFT content for ${panel.wallName}:`, error);
        showError(`Failed to load NFT content for ${panel.wallName}.`);
      }

      // Arrow visibility based on collection length (same logic as before)
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
    scene.fog = new THREE.FogExp2(0x0a0410, 0.02);

    // Renderer (unchanged)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    // Camera (unchanged)
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0);

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

    // Post‑processing (unchanged)
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
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pixelRatio);
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pixelRatio);
    composer.addPass(fxaaPass);

    // -----------------------------------------------------------------
    // Build floor & ceiling based on layout rooms
    // -----------------------------------------------------------------
    const floorGroup = new THREE.Group();
    const ceilingGroup = new THREE.Group();

    GalleryLayout.rooms.forEach(room => {
      const [roomW, roomD] = room.size;
      const [x, y, z] = room.position;

      // Floor plane
      const floorGeo = new THREE.PlaneGeometry(roomW, roomD);
      const floorMat = new THREE.MeshStandardMaterial({
        color: FLOOR_COLOR,
        roughness: 0.9,
        metalness: 0.05,
        side: THREE.DoubleSide,
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(x + roomW / 2, 0, z + roomD / 2);
      floorGroup.add(floor);

      // Ceiling plane (uses acoustic baffles for main halls, generic for others)
      const ceilingMat = new THREE.MeshStandardMaterial({
        color: room.name.includes('Hall') ? 0xffffff : 0x111111,
        roughness: 0.7,
        metalness: 0.1,
        side: THREE.DoubleSide,
        emissive: room.name.includes('Feature') ? 0x202040 : 0x0,
        emissiveIntensity: room.name.includes('Feature') ? 0.3 : 0,
      });
      const ceiling = new THREE.Mesh(floorGeo.clone(), ceilingMat);
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.set(x + roomW / 2, room.ceilingHeight, z + roomD / 2);
      ceilingGroup.add(ceiling);
    });
    scene.add(floorGroup);
    scene.add(ceilingGroup);

    // -----------------------------------------------------------------
    // Build walls + panels from the layout
    // -----------------------------------------------------------------
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15);
    arrowShape.lineTo(0.3, 0);
    arrowShape.lineTo(0, -0.15);
    arrowShape.lineTo(0, 0.15);
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: ARROW_COLOR, side: THREE.DoubleSide });

    const textMatFactory = () => new THREE.MeshBasicMaterial({ map: null, transparent: true, side: THREE.DoubleSide, alphaTest: 0.01, depthWrite: false });
    const titleGeometry = new THREE.PlaneGeometry(TITLE_PANEL_WIDTH, TITLE_HEIGHT);
    const descriptionGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT);
    const attributesGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT);
    const wallTitleGeometry = new THREE.PlaneGeometry(8, 0.75);

    panelsRef.current = [];
    collisionSegmentsRef.current = [];

    GalleryLayout.walls.forEach(wall => {
      // ----- Wall mesh -----
      const wallGeo = new THREE.PlaneGeometry(wall.length, wall.height);
      const wallMat = new THREE.MeshStandardMaterial({
        color: wall.material === MaterialId.WhitePlaster ? 0xffffff : wall.material === MaterialId.GraphiteMicrocement ? 0x111111 : 0x222222,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0.1,
      });
      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.set(...wall.position);
      wallMesh.rotation.y = wall.rotationY;
      scene.add(wallMesh);
      wallMeshesRef.current.set(wall.key, wallMesh);

      // ----- Collision segment (bottom edge) -----
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

      // ----- Only create NFT panel if wall is marked for panels -----
      if (wall.hasPanel) {
        const { group: panelGroup, imageMesh } = createFramedPanel(2, 2, NEON_COLOR_MAGENTA);

        // Position panel slightly offset from wall (into the gallery)
        const offsetVec = new THREE.Vector3(0, 0, PANEL_OFFSET).applyAxisAngle(new THREE.Vector3(0, 1, 0), wall.rotationY);
        panelGroup.position.set(wall.position[0] + offsetVec.x, PANEL_Y_POSITION, wall.position[2] + offsetVec.z);
        panelGroup.rotation.y = wall.rotationY;
        scene.add(panelGroup);

        // Arrow setup
        const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
        prevArrow.rotation.set(0, wall.rotationY + Math.PI, 0);
        const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
        nextArrow.rotation.copy(wallGroupRotation(wall.rotationY));
        const basePos = panelGroup.position.clone();
        const rightVec = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, wall.rotationY, 0));
        prevArrow.position.copy(basePos.clone().addScaledVector(rightVec, -ARROW_PANEL_OFFSET));
        nextArrow.position.copy(basePos.clone().addScaledVector(rightVec, ARROW_PANEL_OFFSET));
        scene.add(prevArrow);
        scene.add(nextArrow);

        // Text panels
        const titleMesh = new THREE.Mesh(titleGeometry, textMatFactory());
        titleMesh.rotation.copy(wallGroupRotation(wall.rotationY));
        const titlePos = basePos.clone().addScaledVector(new THREE.Vector3(0, 1, 0), -1 - TITLE_HEIGHT / 2 - 0.1).addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
        titleMesh.position.copy(titlePos);
        titleMesh.visible = false;
        scene.add(titleMesh);

        const descriptionMesh = new THREE.Mesh(descriptionGeometry, textMatFactory());
        descriptionMesh.rotation.copy(wallGroupRotation(wall.rotationY));
        const descPos = basePos.clone().addScaledVector(rightVector(wall.rotationY), -TEXT_PANEL_OFFSET_X).addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
        descriptionMesh.position.copy(descPos);
        descriptionMesh.visible = false;
        scene.add(descriptionMesh);

        const attributesMesh = new THREE.Mesh(attributesGeometry, textMatFactory());
        attributesMesh.rotation.copy(wallGroupRotation(wall.rotationY));
        const attrPos = basePos.clone().addScaledVector(rightVector(wall.rotationY), TEXT_PANEL_OFFSET_X).addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
        attributesMesh.position.copy(attrPos);
        attributesMesh.visible = false;
        scene.add(attributesMesh);

        const wallTitleMesh = new THREE.Mesh(wallTitleGeometry, textMatFactory());
        wallTitleMesh.rotation.copy(wallGroupRotation(wall.rotationY));
        const wallTitlePos = basePos.clone();
        wallTitlePos.y = 3.2;
        wallTitleMesh.position.copy(wallTitlePos);
        wallTitleMesh.visible = false;
        scene.add(wallTitleMesh);

        const panel: Panel = {
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
        panelsRef.current.push(panel);
      }
    });

    // Helper functions for rotations / vectors
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
    // Lighting – create Three.js lights from layout.lights
    // -----------------------------------------------------------------
    GalleryLayout.lights.forEach(l => {
      let light: THREE.Light;
      switch (l.type) {
        case 'spot':
          const spot = new THREE.SpotLight(new THREE.Color(...l.color), l.intensity / 1000);
          spot.position.set(...l.position);
          spot.angle = ((l.angle ?? 30) * Math.PI) / 180;
          spot.target.position.set(...(l.target ?? [0, 0, 0]));
          scene.add(spot.target);
          light = spot;
          break;
        case 'area':
          // Three.js doesn't have native area lights; use RectAreaLight
          const rect = new THREE.RectAreaLight(new THREE.Color(...l.color), l.intensity / 500, 2, 2);
          rect.position.set(...l.position);
          rect.lookAt(new THREE.Vector3(...(l.target ?? [0, 0, 0])));
          scene.add(rect);
          light = rect;
          break;
        case 'neon':
          // Simulate neon with an emissive point light
          const neon = new THREE.PointLight(new THREE.Color(...l.color), l.intensity / 200, 5);
          neon.position.set(...l.position);
          light = neon;
          break;
        default:
          const p = new THREE.PointLight(new THREE.Color(...l.color), l.intensity / 1000);
          p.position.set(...l.position);
          light = p;
      }
      scene.add(light);
    });

    // -----------------------------------------------------------------
    // Input handling (identical to previous implementation)
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
    // Raycaster for UI interaction (panel selection, arrows, description scroll)
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
        const src = getCurrentNftSource(currentTargetedPanel.wallName);
        if (src) {
          setMarketBrowserState({ open: true, collection: src.contractAddress, tokenId: src.tokenId });
          controls.unlock();
        }
      }
    };
    renderer.domElement.addEventListener('click', onDocumentMouseDown);

    // -----------------------------------------------------------------
    // Description scrolling (mouse wheel)
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
    // Animation loop (including ceiling shader time)
    // -----------------------------------------------------------------
    let prevTime = performance.now();
    const startTime = performance.now();
    const animate = () => {
      requestAnimationFrame(animate);
      const now = performance.now();
      const delta = (now - prevTime) / 1000;
      const elapsed = (now - startTime) / 1000;

      // Update ceiling shader if present
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

        // Collision check
        const curX = camera.position.x;
        const curZ = camera.position.z;
        for (const [x1, z1, x2, z2] of collisionSegmentsRef.current) {
          const dist = distToSegment(curX, curZ, x1, z1, x2, z2);
          if (dist < COLLISION_DISTANCE) {
            camera.position.x = prevX;
            camera.position.z = prevZ;
            velocity.set(0, 0, 0);
            break;
          }
        }

        camera.position.y = 1.6;

        // Raycast for UI hover
        raycaster.setFromCamera(center, camera);
        const intersectObjs = raycaster.intersectObjects(
          panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow, p.descriptionMesh]),
          true
        );

        // Reset highlights
        panelsRef.current.forEach(p => {
          (p.prevArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR);
          (p.nextArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR);
        });
        currentTargetedPanel = null;
        currentTargetedArrow = null;
        currentTargetedDescriptionPanel = null;

        if (intersectObjs.length > 0 && intersectObjs[0].distance < 5) {
          const tgt = intersectObjs[0].object as THREE.Mesh;
          const panel = panelsRef.current.find(
            p => p.mesh === tgt || p.prevArrow === tgt || p.nextArrow === tgt || p.descriptionMesh === tgt
          );
          if (panel) {
            if (tgt === panel.mesh) currentTargetedPanel = panel;
            else if (tgt === panel.prevArrow || tgt === panel.nextArrow) {
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
    // Helper: distance from point to line segment (used for collisions)
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
    // Load all panel content after layout is ready
    // -----------------------------------------------------------------
    const loadAllPanels = async () => {
      await initializeGalleryConfig();
      for (const panel of panelsRef.current) {
        const src = getCurrentNftSource(panel.wallName);
        await updatePanelContent(panel, src);
        // Small pause to avoid throttling the RPC endpoints
        await new Promise(res => setTimeout(res, 100));
      }
      manageVideoPlayback(controls.isLocked);
    };
    loadAllPanels();

    // -----------------------------------------------------------------
    // Cleanup on unmount
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
  // Window resize handling (unchanged)
  // -----------------------------------------------------------------
  const onWindowResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (w * pixelRatio);
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (h * pixelRatio);
  };
  window.addEventListener('resize', onWindowResize);

  // -----------------------------------------------------------------
  // UI – Market browser modal (unchanged)
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
    </>
  );
};

export default NftGallery;