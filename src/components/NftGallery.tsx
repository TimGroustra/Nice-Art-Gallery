import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import {
  EffectComposer,
  RenderPass,
  UnrealBloomPass,
  FXAAShader,
  ShaderPass,
} from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex } from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource, NftAttribute } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';
import { createGifTexture } from '@/utils/gifTexture';
import { MarketBrowserRefined } from './MarketBrowserRefined';
import { GalleryInfo } from './GalleryInfo';
import { GalleryLayout, MaterialId } from '@/scene/unrealUnityLayout';

// ---------------------------------------------------------------------
// Initialize utilities
// ---------------------------------------------------------------------
RectAreaLightUniformsLib.init();

// ---------------------------------------------------------------------
// Visual constants – lighter stone colour & brighter ambience
// ---------------------------------------------------------------------
const TEXT_PANEL_OFFSET_X = 0.8;
const TEXT_DEPTH_OFFSET = 0.05;

// Load a high‑contrast stone texture (repeat less for clearer look)
const stoneTexture = new THREE.TextureLoader().load('https://threejs.org/examples/textures/stone.jpg');
stoneTexture.wrapS = THREE.RepeatWrapping;
stoneTexture.wrapT = THREE.RepeatWrapping;
stoneTexture.repeat.set(2, 2); // fewer repeats → more visible grain

// Light colour for emissive elements (soft warm glow)
const EMISSIVE_STONE = 0xffffff;

// ---------------------------------------------------------------------
// Panel interface (unchanged)
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// Helper: creates a framed panel (backboard, frame, image plane)
// ---------------------------------------------------------------------
function createFramedPanel(width: number, height: number, emissiveColor: number) {
  const group = new THREE.Group();

  // Backboard (light matte)
  const backMat = new THREE.MeshStandardMaterial({
    color: 0xf5f5f5,
    roughness: 0.4,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(width, height), backMat);
  back.position.set(0, 0, 0.01);
  group.add(back);

  // Emissive frame rim (soft white)
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xe0e0e0,
    emissive: 0x000000, // Remove emissive glow from frames
    emissiveIntensity: 0.8,
    roughness: 0.3,
    metalness: 0.2,
  });
  const rim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.12, height + 0.12, 0.06), rimMat);
  rim.position.set(0, 0, -0.02);
  group.add(rim);

  // Image plane (receives textures)
  const imgMat = new THREE.MeshBasicMaterial({ color: 0x222122, side: THREE.DoubleSide });
  const imageMesh = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.2, height - 0.2), imgMat);
  imageMesh.position.set(0, 0, 0.02);
  group.add(imageMesh);

  // Neon border lines (subtle)
  const neonMat = new THREE.MeshStandardMaterial({
    emissive: emissiveColor,
    emissiveIntensity: 0.2, // Reduced neon intensity
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

// ---------------------------------------------------------------------
// Text texture helpers (unchanged)
// ---------------------------------------------------------------------
const createTextTexture = (
  text: string,
  width: number,
  height: number,
  fontSize: number = 30,
  color: string = 'white',
  options: { scrollY?: number; wordWrap?: boolean } = {}
): { texture: THREE.CanvasTexture; totalHeight: number } => {
  const { scrollY = 0, wordWrap = false } = options;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { texture: new THREE.CanvasTexture(document.createElement('canvas')), totalHeight: 0 };

  const res = 512;
  canvas.width = res * (width / height);
  canvas.height = res;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.fillStyle = color;

  const pad = 40;
  const lineH = fontSize * 1.2;
  let total = 0;

  if (wordWrap) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let y = pad;
    const words = text.split(' ');
    let line = '';
    const maxW = canvas.width - 2 * pad;
    for (let i = 0; i < words.length; i++) {
      const test = line + words[i] + ' ';
      if (ctx.measureText(test).width > maxW && i > 0) {
        ctx.fillText(line, pad, y - scrollY);
        line = words[i] + ' ';
        y += lineH;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, pad, y - scrollY);
    total = y + lineH - pad;
  } else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    total = lineH;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { texture: tex, totalHeight: total };
};

const createAttributesTextTexture = (
  attrs: NftAttribute[],
  width: number,
  height: number,
  fontSize: number,
  color: string = 'white'
): { texture: THREE.CanvasTexture } => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { texture: new THREE.CanvasTexture(document.createElement('canvas')) };

  const res = 512;
  canvas.width = res * (width / height);
  canvas.height = res;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const pad = 40;
  const lineH = fontSize * 1.2;
  let y = pad;
  const maxW = canvas.width - 2 * pad;

  if (!attrs || attrs.length === 0) {
    ctx.fillText('No attributes found.', pad, y);
  } else {
    attrs.forEach(attr => {
      if (attr.trait_type && attr.value) {
        const line = `${attr.trait_type}: ${attr.value}`;
        const words = line.split(' ');
        let cur = '';
        for (let i = 0; i < words.length; i++) {
          const test = cur + words[i] + ' ';
          if (ctx.measureText(test).width > maxW && i > 0) {
            ctx.fillText(cur, pad, y);
            cur = words[i] + ' ';
            y += lineH;
          } else {
            cur = test;
          }
        }
        ctx.fillText(cur, pad, y);
        y += lineH;
      }
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { texture: tex };
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

  const [selectedInfo, setSelectedInfo] = useState<{
    title?: string;
    description?: string;
    collection?: string;
    tokenId?: string | number;
  } | null>(null);

  // Layout constants (unchanged)
  const TEXT_PANEL_WIDTH = 2.5;
  const TITLE_HEIGHT = 0.5;
  const DESCRIPTION_HEIGHT = 1.5;
  const ATTRIBUTES_HEIGHT = 1.5;
  const DESCRIPTION_PANEL_HEIGHT = TITLE_HEIGHT + DESCRIPTION_HEIGHT;
  const TITLE_PANEL_WIDTH = 4.0;
  const ARROW_COLOR = 0x777777;
  const ARROW_COLOR_HOVER = 0x00ff00;
  const ARROW_PANEL_OFFSET = 1.5;
  const PANEL_OFFSET = 0.15;
  const PLAYER_RADIUS = 0.5;

  const T = GalleryLayout.footprint.wallThickness;
  const HALF_T = T / 2;
  const COLLISION_DISTANCE = PLAYER_RADIUS + HALF_T;
  const NEON_COLOR_MAGENTA = 0xff1bb3;
  const PLAYER_HEIGHT = 1.6;

  const L = GalleryLayout.footprint.width;
  const CENTER_X = L / 2;
  const CENTER_Z = L / 2;
  const STAIR_INNER_R = 3;
  const STAIR_OUTER_R = 4.6;
  const STAIR_ZONE_R_MIN = STAIR_INNER_R - 0.5;
  const STAIR_ZONE_R_MAX = STAIR_OUTER_R + 0.5;

  // Globals set later
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let composer: EffectComposer;
  let fxaaPass: ShaderPass;
  let ceilingMaterial: THREE.ShaderMaterial | null = null;

  // Keep a reference to the step meshes for ray‑casting
  const stepMeshes: THREE.Mesh[] = [];

  // -----------------------------------------------------------------
  // Video / GIF handling (unchanged)
  // -----------------------------------------------------------------
  const manageVideoPlayback = useCallback((shouldPlay: boolean) => {
    panelsRef.current.forEach(p => {
      if (p.videoElement) {
        if (shouldPlay) {
          const locked = (window as any).galleryControls?.isLocked?.() ?? false;
          if (locked) p.videoElement.play().catch(e => console.warn('Video playback prevented:', e));
        } else {
          p.videoElement.pause();
        }
      }
    });
  }, []);

  const isVideoContent = (type: string, url: string) =>
    !!(type.startsWith('video/') || url.match(/\.(mp4|webm|ogg)(\?|$)/i));
  const isGifContent = (type: string, url: string) =>
    !!(type === 'image/gif' || url.match(/\.gif(\?|$)/i));

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
    async (url: string, panel: Panel, type: string): Promise<THREE.Texture | THREE.VideoTexture> => {
      const video = isVideoContent(type, url);
      const gif = isGifContent(type, url);

      if (panel.videoElement) {
        panel.videoElement.pause();
        panel.videoElement.removeAttribute('src');
        panel.videoElement = null;
      }
      if (panel.gifStopFunction) {
        panel.gifStopFunction();
        panel.gifStopFunction = null;
      }

      if (video) {
        return new Promise(resolve => {
          let vid = panel.videoElement;
          if (!vid) {
            vid = document.createElement('video');
            vid.playsInline = true;
            vid.autoplay = true;
            vid.loop = true;
            vid.muted = true;
            vid.style.display = 'none';
            vid.crossOrigin = 'anonymous';
            panel.videoElement = vid;
          }
          vid.src = url;
          vid.load();
          if ((window as any).galleryControls?.isLocked?.()) {
            vid.play().catch(e => console.warn('Video playback prevented:', e));
          }
          const tex = new THREE.VideoTexture(vid);
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          resolve(tex);
        });
      }

      if (gif) {
        try {
          const { texture, stop } = await createGifTexture(url);
          panel.gifStopFunction = stop;
          return texture;
        } catch (e) {
          console.error('GIF decode failed, falling back to static image:', e);
        }
      }

      return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        loader.load(
          url,
          tex => resolve(tex),
          undefined,
          err => {
            console.error('Error loading texture:', url, err);
            showError(`Failed to load image: ${url.slice(0, 50)}...`);
            reject(err);
          }
        );
      });
    },
    []
  );

  // -----------------------------------------------------------------
  // Update panel content (unchanged aside from colour handling)
  // -----------------------------------------------------------------
  const updatePanelContent = useCallback(
    async (panel: Panel, source: NftSource | null) => {
      const cfg = GALLERY_PANEL_CONFIG[panel.wallName];
      const colName = cfg?.name || '...';
      const txtColor = cfg?.text_color || 'white';

      // Wall title
      disposeTextureSafely(panel.wallTitleMesh);
      const { texture: wallTitleTex } = createTextTexture(colName, 8, 0.75, 120, txtColor, { wordWrap: false });
      (panel.wallTitleMesh.material as THREE.MeshBasicMaterial).map = wallTitleTex;
      panel.wallTitleMesh.visible = true;

      // Reset main mesh
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
      panel.titleMesh.visible = false;
      panel.descriptionMesh.visible = false;
      panel.attributesMesh.visible = false;

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
        const showArrows = cfg && cfg.tokenIds.length > 1;
        panel.prevArrow.visible = showArrows;
        panel.nextArrow.visible = showArrows;
        return;
      }

      const metadata = await getCachedNftMetadata(source.contractAddress, source.tokenId);
      if (!metadata) {
        if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
          const { texture: errTex } = createTextTexture('NFT Unavailable', 2, 2, 80, 'red', { wordWrap: false });
          panel.mesh.material.map = errTex;
          panel.mesh.material.color.set(0xff0000);
        }
        return;
      }

      try {
        const contentUrl = metadata.contentUrl;
        const video = isVideoContent(metadata.contentType, contentUrl);
        const gif = isGifContent(metadata.contentType, contentUrl);
        const tex = await loadTexture(contentUrl, panel, metadata.contentType);

        if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
          panel.mesh.material.map = tex;
          panel.mesh.material.color.set(0xffffff);
        }

        panel.metadataUrl = metadata.source;
        panel.isVideo = video;
        panel.isGif = gif;

        // Title
        disposeTextureSafely(panel.titleMesh);
        const { texture: titleTex } = createTextTexture(metadata.title, TITLE_PANEL_WIDTH, TITLE_HEIGHT, 120, txtColor, { wordWrap: false });
        (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTex;
        panel.titleMesh.visible = true;

        // Description
        disposeTextureSafely(panel.descriptionMesh);
        const { texture: descTex, totalHeight } = createTextTexture(metadata.description, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, txtColor, { wordWrap: true });
        (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = descTex;
        panel.descriptionMesh.visible = true;
        panel.currentDescription = metadata.description;
        panel.descriptionTextHeight = totalHeight;
        panel.descriptionScrollY = 0;

        // Attributes
        disposeTextureSafely(panel.attributesMesh);
        const { texture: attrTex } = createAttributesTextTexture(metadata.attributes || [], TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT, 40, txtColor);
        (panel.attributesMesh.material as THREE.MeshBasicMaterial).map = attrTex;
        panel.attributesMesh.visible = true;

        showSuccess(video ? `Loaded video NFT: ${metadata.title}` : gif ? `Loaded GIF NFT: ${metadata.title}` : `Loaded image NFT: ${metadata.title}`);
      } catch (e) {
        console.error(`Error loading NFT for ${panel.wallName}:`, e);
        showError(`Failed to load NFT content for ${panel.wallName}.`);
      }

      const showArrows = cfg && cfg.tokenIds.length > 1;
      panel.prevArrow.visible = showArrows;
      panel.nextArrow.visible = showArrows;
    },
    [loadTexture]
  );

  // -----------------------------------------------------------------
  // Scene setup
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0); // lighter background
    scene.fog = new THREE.FogExp2(0xf0f0f0, 0.015); // light fog

    // Brighter ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.4); // Reduced ambient light to prevent overexposure
    scene.add(ambient);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(CENTER_X, PLAYER_HEIGHT, CENTER_Z - STAIR_ZONE_R_MAX);

    // Controls
    const controls = new PointerLockControls(camera, renderer.domElement);
    (window as any).galleryControls = {
      lockControls: () => controls.lock(),
      hasVideo: () => panelsRef.current.some(p => p.videoElement !== null),
      isMuted: () => {
        const active = panelsRef.current.filter(p => p.videoElement);
        return active.length === 0 ? true : active.every(v => v.videoElement!.muted);
      },
      toggleMute: () => {
        const active = panelsRef.current.filter(p => p.videoElement);
        if (active.length) {
          const muted = active[0].videoElement!.muted;
          active.forEach(p => (p.videoElement!.muted = !muted));
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
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.4, 0.6);
    bloomPass.threshold = 0.6; // Much higher threshold to only bloom very bright areas
    bloomPass.strength = 0.3; // Significantly reduced bloom strength
    bloomPass.radius = 0.2; // Smaller bloom radius
    composer.addPass(bloomPass);
    fxaaPass = new ShaderPass(FXAAShader);
    const pr = Math.min(window.devicePixelRatio, 2);
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pr);
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pr);
    composer.addPass(fxaaPass);

    // -----------------------------------------------------------------
    // Material factory – now always stone with a light colour
    // -----------------------------------------------------------------
    const materialCache = new Map<MaterialId, THREE.Material>();
    const getMaterial = (id: MaterialId, height: number) => {
      if (materialCache.has(id)) return materialCache.get(id)!;
      // All wall‑type materials share the same stone appearance
      const mat = new THREE.MeshStandardMaterial({
        map: stoneTexture,
        color: 0x888888, // Darker grey for more natural stone look
        roughness: 0.8, // More rough to reduce specular highlights
        metalness: 0.05, // Less metallic to reduce reflections
      });
      materialCache.set(id, mat);
      return mat;
    };

    // -----------------------------------------------------------------
    // Floors & ceilings (stone material)
    // -----------------------------------------------------------------
    const floorGroup = new THREE.Group();
    const ceilingGroup = new THREE.Group();
    const ATRIUM_R = 11;

    GalleryLayout.rooms.forEach(room => {
      const [w, d] = room.size;
      const [x, y, z] = room.position;

      let floorGeo: THREE.PlaneGeometry | THREE.ShapeGeometry;
      if (room.name === 'Ground Floor Hall') {
        floorGeo = new THREE.PlaneGeometry(w, d);
      } else {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0, L);
        shape.lineTo(L, L);
        shape.lineTo(L, 0);
        shape.lineTo(0, 0);
        const hole = new THREE.Path();
        hole.absarc(L / 2, L / 2, ATRIUM_R, 0, Math.PI * 2, true);
        shape.holes.push(hole);
        floorGeo = new THREE.ShapeGeometry(shape);
      }

      const floorMat = getMaterial(room.material, room.ceilingHeight);
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(x, room.floorY, z + L);
      floorGroup.add(floor);

      // Simple white ceiling
      const ceilMat = getMaterial(MaterialId.WhitePlaster, room.ceilingHeight);
      const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat);
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.set(x + w / 2, room.floorY + room.ceilingHeight, z + d / 2);
      ceilingGroup.add(ceiling);
    });
    scene.add(floorGroup);
    scene.add(ceilingGroup);

    // -----------------------------------------------------------------
    // Walls + panels (stone material) and 3‑D stair steps
    // -----------------------------------------------------------------
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15);
    arrowShape.lineTo(0.3, 0);
    arrowShape.lineTo(0, -0.15);
    arrowShape.lineTo(0, 0.15);
    const arrowGeom = new THREE.ShapeGeometry(arrowShape);
    const arrowMat = new THREE.MeshBasicMaterial({ color: ARROW_COLOR, side: THREE.DoubleSide });

    const textMatFactory = () =>
      new THREE.MeshBasicMaterial({ map: null, transparent: true, side: THREE.DoubleSide, alphaTest: 0.01, depthWrite: false });

    const titleGeom = new THREE.PlaneGeometry(4, 0.5);
    const descGeom = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT);
    const attrGeom = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT);
    const wallTitleGeom = new THREE.PlaneGeometry(8, 0.75);

    panelsRef.current = [];
    collisionSegmentsRef.current = [];
    stepMeshes.length = 0; // Clear step meshes array

    const STEP_DEPTH = 0.3; // Depth of each step block

    GalleryLayout.walls.forEach(wall => {
      // If this wall is a stair step, create a solid box instead of a thin plane
      if (wall.key.startsWith('stair-step-')) {
        const stepGeom = new THREE.BoxGeometry(wall.length, wall.height, STEP_DEPTH);
        const stepMesh = new THREE.Mesh(stepGeom, getMaterial(wall.material, wall.height));
        stepMesh.position.set(...wall.position);
        stepMesh.rotation.y = wall.rotationY;
        scene.add(stepMesh);
        stepMeshes.push(stepMesh);
        // No panels or arrows on steps, so return early
        return;
      }
      
      // Skip spiral NFT panels
      if (wall.key.startsWith('spiral-nft-')) {
          return;
      }

      const wallMat = getMaterial(wall.material, wall.height);
      const wallGeom = new THREE.PlaneGeometry(wall.length, wall.height);
      const wallMesh = new THREE.Mesh(wallGeom, wallMat);
      wallMesh.position.set(...wall.position);
      wallMesh.rotation.y = wall.rotationY;
      scene.add(wallMesh);
      wallMeshesRef.current.set(wall.key, wallMesh);

      // Collision segments for perimeter / octagon walls
      if (wall.key.startsWith('wall-') || wall.key.startsWith('octagon-')) {
        const half = wall.length / 2;
        const cos = Math.cos(wall.rotationY);
        const sin = Math.sin(wall.rotationY);
        const cx = wall.position[0];
        const cz = wall.position[2];
        const x1 = cx - half * cos;
        const z1 = cz + half * sin;
        const x2 = cx + half * cos;
        const z2 = cz - half * sin;
        collisionSegmentsRef.current.push([x1, z1, x2, z2]);
      }

      if (wall.hasPanel) {
        const { group: panelGroup, imageMesh } = createFramedPanel(2, 2, NEON_COLOR_MAGENTA);
        panelGroup.position.set(...wall.position);
        panelGroup.rotation.y = wall.rotationY;
        scene.add(panelGroup);

        const prevArrow = new THREE.Mesh(arrowGeom, arrowMat.clone());
        prevArrow.rotation.set(0, wall.rotationY + Math.PI, 0);
        const nextArrow = new THREE.Mesh(arrowGeom, arrowMat.clone());
        nextArrow.rotation.copy(wallGroupRotation(wall.rotationY));

        const basePos = panelGroup.position.clone();
        const rightVec = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, wall.rotationY, 0));
        const ARROW_OFFSET = 1.5;
        prevArrow.position.copy(basePos.clone().addScaledVector(rightVec, -ARROW_OFFSET));
        nextArrow.position.copy(basePos.clone().addScaledVector(rightVec, ARROW_OFFSET));

        const forwardVec = forwardVector(wall.rotationY);
        prevArrow.position.addScaledVector(forwardVec, PANEL_OFFSET);
        nextArrow.position.addScaledVector(forwardVec, PANEL_OFFSET);
        scene.add(prevArrow);
        scene.add(nextArrow);

        // Title mesh
        const titleMesh = new THREE.Mesh(titleGeom, textMatFactory());
        titleMesh.rotation.copy(wallGroupRotation(wall.rotationY));
        const titlePos = basePos
          .clone()
          .addScaledVector(new THREE.Vector3(0, 1, 0), -1 - TITLE_HEIGHT / 2 - 0.1)
          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
        titleMesh.position.copy(titlePos);
        titleMesh.visible = false;
        scene.add(titleMesh);

        // Description mesh
        const descMesh = new THREE.Mesh(descGeom, textMatFactory());
        descMesh.rotation.copy(wallGroupRotation(wall.rotationY));
        const descPos = basePos
          .clone()
          .addScaledVector(rightVector(wall.rotationY), -TEXT_PANEL_OFFSET_X)
          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
        descMesh.position.copy(descPos);
        descMesh.visible = false;
        scene.add(descMesh);

        // Attributes mesh
        const attrMesh = new THREE.Mesh(attrGeom, textMatFactory());
        attrMesh.rotation.copy(wallGroupRotation(wall.rotationY));
        const attrPos = basePos
          .clone()
          .addScaledVector(rightVector(wall.rotationY), TEXT_PANEL_OFFSET_X)
          .addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
        attrMesh.position.copy(attrPos);
        attrMesh.visible = false;
        scene.add(attrMesh);

        // Wall title (above panel)
        const wallTitleMesh = new THREE.Mesh(wallTitleGeom, textMatFactory());
        wallTitleMesh.rotation.copy(wallGroupRotation(wall.rotationY));
        wallTitleMesh.position.set(wall.position[0], wall.position[1] + wall.height / 2 - 0.5, wall.position[2]);
        wallTitleMesh.position.addScaledVector(forwardVector(wall.rotationY), TEXT_DEPTH_OFFSET);
        wallTitleMesh.visible = false;
        scene.add(wallTitleMesh);

        panelsRef.current.push({
          mesh: imageMesh,
          wallName: wall.key,
          metadataUrl: '',
          isVideo: false,
          isGif: false,
          prevArrow,
          nextArrow,
          titleMesh,
          descriptionMesh: descMesh,
          attributesMesh: attrMesh,
          wallTitleMesh,
          currentDescription: '',
          descriptionScrollY: 0,
          descriptionTextHeight: 0,
          currentAttributes: [],
          videoElement: null,
          gifStopFunction: null,
        });
      }
    });

    // -----------------------------------------------------------------
    // Helper rotation / vector functions
    // -----------------------------------------------------------------
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
    // Lighting – brighter, warm spotlights
    // -----------------------------------------------------------------
    GalleryLayout.lights.forEach(l => {
      let light: THREE.Light;
      const col = new THREE.Color(l.color[0] / 255, l.color[1] / 255, l.color[2] / 255);
      switch (l.type) {
        case 'spot':
          const spot = new THREE.SpotLight(col, l.intensity / 1000);
          spot.position.set(...l.position);
          spot.angle = ((l.angle ?? 30) * Math.PI) / 180;
          spot.target.position.set(...(l.target ?? [0, 0, 0]));
          scene.add(spot.target);
          light = spot;
          break;
        case 'area':
          const rect = new THREE.RectAreaLight(col, l.intensity / 800, 2, 2);
          rect.position.set(...l.position);
          rect.lookAt(new THREE.Vector3(...(l.target ?? [0, 0, 0])));
          scene.add(rect);
          light = rect;
          break;
        case 'neon':
          const neon = new THREE.PointLight(col, l.intensity / 200, 5);
          neon.position.set(...l.position);
          light = neon;
          break;
        default:
          const p = new THREE.PointLight(col, l.intensity / 1000);
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
    const vel = new THREE.Vector3(),
      dir = new THREE.Vector3(),
      speed = 20.0;

    const FLOOR_LEVELS = GalleryLayout.rooms.map(r => r.floorY);

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
    // Raycaster for UI interaction (unchanged)
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
            const src = getCurrentNftSource(panel.wallName);
            updatePanelContent(panel, src);
          }
        }
      } else if (currentTargetedPanel) {
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
    // Description scrolling (unchanged)
    // -----------------------------------------------------------------
    const onDocumentWheel = (e: WheelEvent) => {
      if (!controls.isLocked || !currentTargetedDescriptionPanel) return;
      const panel = currentTargetedDescriptionPanel;
      const scrollAmt = e.deltaY * 0.5;
      const canvasH = 512;
      const pad = 40;
      const viewH = canvasH - 2 * pad;
      const maxScroll = Math.max(0, panel.descriptionTextHeight - viewH);
      let newY = panel.descriptionScrollY + scrollAmt;
      newY = Math.max(0, Math.min(newY, maxScroll));
      if (newY !== panel.descriptionScrollY) {
        panel.descriptionScrollY = newY;
        const txtColor = GALLERY_PANEL_CONFIG[panel.wallName]?.text_color || 'white';
        const { texture } = createTextTexture(panel.currentDescription, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, txtColor, {
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
    const animate = () => {
      requestAnimationFrame(animate);
      const now = performance.now();
      const delta = (now - prevTime) / 1000;

      if (controls.isLocked) {
        // Movement
        vel.x -= vel.x * 10.0 * delta;
        vel.z -= vel.z * 10.0 * delta;
        dir.z = Number(moveForward) - Number(moveBackward);
        dir.x = Number(moveRight) - Number(moveLeft);
        dir.normalize();

        if (moveForward || moveBackward) vel.z -= dir.z * speed * delta;
        if (moveLeft || moveRight) vel.x -= dir.x * speed * delta;

        const prevX = camera.position.x;
        const prevZ = camera.position.z;

        controls.moveRight(-vel.x * delta);
        controls.moveForward(-vel.z * delta);

        const curX = camera.position.x;
        const curZ = camera.position.z;

        // Collision with building bounds
        const min = HALF_T + PLAYER_RADIUS;
        const max = L - HALF_T - PLAYER_RADIUS;
        if (curX < min || curX > max || curZ < min || curZ > max) {
          camera.position.x = prevX;
          camera.position.z = prevZ;
          vel.set(0, 0, 0);
        } else {
          for (const seg of collisionSegmentsRef.current) {
            const d = distToSegment(curX, curZ, ...seg);
            if (d < COLLISION_DISTANCE) {
              camera.position.x = prevX;
              camera.position.z = prevZ;
              vel.set(0, 0, 0);
              break;
            }
          }
        }

        // ----- NEW: natural stair stepping using ray‑cast onto step meshes -----
        const downOrigin = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z);
        raycaster.set(downOrigin, new THREE.Vector3(0, -1, 0));
        const stepHits = raycaster.intersectObjects(stepMeshes, true);
        
        let targetY = FLOOR_LEVELS[0] + PLAYER_HEIGHT; // Default to ground floor
        
        if (stepHits.length > 0) {
          // If we hit a step, set the target Y to the top of that step
          targetY = stepHits[0].point.y + PLAYER_HEIGHT;
        } else {
          // If not on a step, check which floor level we are closest to
          let closestFloorY = FLOOR_LEVELS[0];
          let minDiff = Infinity;
          
          for (const floorY of FLOOR_LEVELS) {
              const diff = Math.abs(camera.position.y - (floorY + PLAYER_HEIGHT));
              if (diff < minDiff) {
                  minDiff = diff;
                  closestFloorY = floorY;
              }
          }
          targetY = closestFloorY + PLAYER_HEIGHT;
        }
        
        // Smoothly move the camera's Y position towards the target Y
        camera.position.y += (targetY - camera.position.y) * 0.5;


        // Raycast hover for arrows (unchanged)
        raycaster.setFromCamera(center, camera);
        const hits = raycaster.intersectObjects(
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

        if (hits.length && hits[0].distance < 5) {
          const obj = hits[0].object as THREE.Mesh;
          const panel = panelsRef.current.find(p => p.mesh === obj || p.prevArrow === obj || p.nextArrow === obj || p.descriptionMesh === obj);
          if (panel) {
            if (obj === panel.mesh) currentTargetedPanel = panel;
            else if (obj === panel.prevArrow || obj === panel.nextArrow) {
              currentTargetedArrow = obj;
              (obj.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_HOVER);
            } else if (obj === panel.descriptionMesh) {
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
    // Distance helper (single correct implementation)
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
        await new Promise(r => setTimeout(r, 100));
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
  // Window resize handling (unchanged)
  // -----------------------------------------------------------------
  const onWindowResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (camera && renderer && composer && fxaaPass) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      const pr = Math.min(window.devicePixelRatio, 2);
      fxaaPass.material.uniforms['resolution'].value.x = 1 / (w * pr);
      fxaaPass.material.uniforms['resolution'].value.y = 1 / (h * pr);
    }
  };
  window.addEventListener('resize', onWindowResize);

  // -----------------------------------------------------------------
  // UI – modal and info overlay
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