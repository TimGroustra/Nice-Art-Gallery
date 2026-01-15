import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib, GLTFLoader } from 'three-stdlib';
import {
  initializeGalleryConfig,
  GALLERY_PANEL_CONFIG,
  getCurrentNftSource,
  updatePanelIndex,
  PanelConfig,
} from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource } from '@/utils/nftFetcher';
import { createGifTexture } from '@/utils/gifTexture';
import { MarketBrowserRefined } from '@/components/MarketBrowserRefined';

// Initialize RectAreaLightUniformsLib immediately upon module load
RectAreaLightUniformsLib.init();

const PANEL_WIDTH = 6;
const PANEL_HEIGHT = 6;

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

let currentTargetedPanel: Panel | null = null;
let currentTargetedArrow: THREE.Mesh | null = null;
let currentTargetedButton: THREE.Mesh | null = null;

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
    vec3 color = hsv2rgb(vec3(hue, 0.9, 0.9));
    vec2 uv = vUv * 2.0 - 1.0;
    float vignette = smoothstep(1.4, 0.2, length(uv));
    gl_FragColor = vec4(color * vignette, 1.0);
  }
`;

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
  const [isLocked, setIsLocked] = useState(false);
  const [marketBrowserState, setMarketBrowserState] = useState<{
    open: boolean;
    collection?: string;
    tokenId?: string | number;
  }>({ open: false });

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

  const moveForwardRef = useRef(false);
  const moveBackwardRef = useRef(false);
  const moveLeftRef = useRef(false);
  const moveRightRef = useRef(false);
  const velocityRef = useRef(new THREE.Vector3());
  const directionRef = useRef(new THREE.Vector3());
  const prevTimeRef = useRef(performance.now());

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
        return new Promise((resolve) => {
          const videoEl = document.createElement('video');
          videoEl.playsInline = true;
          videoEl.autoplay = true;
          videoEl.loop = true;
          videoEl.muted = true;
          videoEl.style.display = 'none';
          videoEl.crossOrigin = 'anonymous';
          videoEl.src = url;
          panel.videoElement = videoEl;
          
          if ((window as any).galleryControls?.isLocked?.()) {
            videoEl.play().catch(() => {});
          }
          resolve(new THREE.VideoTexture(videoEl));
        });
      }

      if (isGif) {
        try {
          const { texture, stop } = await createGifTexture(url);
          panel.gifStopFunction = stop;
          return texture;
        } catch (e) {
          console.error('GIF fallback:', e);
        }
      }

      return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        loader.load(url, resolve, undefined, reject);
      });
    },
    [],
  );

  const updatePanelContent = useCallback(
    async (panel: Panel, source: NftSource | null) => {
      disposeTextureSafely(panel.mesh);
      panel.mesh.material = new THREE.MeshBasicMaterial({ color: 0x111111 });
      panel.metadataUrl = '';
      panel.isVideo = false;
      panel.isGif = false;

      if (panel.videoElement) {
        panel.videoElement.pause();
        panel.videoElement.src = '';
        panel.videoElement = null;
      }
      if (panel.gifStopFunction) {
        panel.gifStopFunction();
        panel.gifStopFunction = null;
      }

      if (!source || !source.contractAddress) {
        const collectionConfig = GALLERY_PANEL_CONFIG[panel.wallName];
        const showArrows = !!(collectionConfig && collectionConfig.tokenIds.length > 1);
        panel.prevArrow.visible = showArrows;
        panel.nextArrow.visible = showArrows;
        return;
      }

      try {
        const metadata: NftMetadata | null = await getCachedNftMetadata(
          source.contractAddress,
          source.tokenId,
        );

        if (!metadata) {
          const canvas = document.createElement('canvas');
          canvas.width = 256; canvas.height = 256;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#222222'; ctx.fillRect(0, 0, 256, 256);
            ctx.fillStyle = '#ff4444'; ctx.font = '24px Arial'; ctx.textAlign = 'center';
            ctx.fillText('Loading Error', 128, 128);
          }
          panel.mesh.material = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide });
        } else {
          const texture = await loadTexture(metadata.contentUrl, panel, metadata.contentType || '');
          disposeTextureSafely(panel.mesh);
          panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture });
          panel.metadataUrl = metadata.source;
          panel.isVideo = isVideoContent(metadata.contentType || '', metadata.contentUrl);
          panel.isGif = isGifContent(metadata.contentType || '', metadata.contentUrl);
        }
      } catch (error) {
        console.error(`Error loading content for ${panel.wallName}:`, error);
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#222222'; ctx.fillRect(0, 0, 256, 256);
          ctx.fillStyle = '#ff4444'; ctx.font = '24px Arial'; ctx.textAlign = 'center';
          ctx.fillText('Connection Error', 128, 128);
        }
        panel.mesh.material = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide });
      }

      const collectionConfig = GALLERY_PANEL_CONFIG[panel.wallName];
      const showArrows = !!(collectionConfig && collectionConfig.tokenIds.length > 1);
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
          if (controlsLocked) panel.videoElement.play().catch(() => {});
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
    rendererRef.current = renderer;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    const controls = new PointerLockControls(camera, renderer.domElement);
    controlsRef.current = controls;

    (window as any).galleryControls = {
      lockControls: () => controls.lock(),
      hasVideo: () => panelsRef.current.some((p) => p.videoElement !== null),
      isMuted: () => {
        const activeVideos = panelsRef.current.filter((p) => p.videoElement);
        return activeVideos.length === 0 || activeVideos.every((p) => p.videoElement!.muted);
      },
      toggleMute: () => {
        const activeVideos = panelsRef.current.filter((p) => p.videoElement);
        if (activeVideos.length > 0) {
          const currentlyMuted = activeVideos[0].videoElement!.muted;
          activeVideos.forEach((p) => { p.videoElement!.muted = !currentlyMuted; });
        }
      },
      isLocked: () => controls.isLocked,
      getTargetedPanel: () => currentTargetedPanel,
    };

    controls.addEventListener('lock', () => { setIsLocked(true); setInstructionsVisible(false); manageVideoPlayback(true); });
    controls.addEventListener('unlock', () => { setIsLocked(false); setInstructionsVisible(true); manageVideoPlayback(false); });

    const ROOM_SEGMENT_SIZE = 10;
    const NUM_SEGMENTS = 5;
    const ROOM_SIZE = ROOM_SEGMENT_SIZE * NUM_SEGMENTS;
    const WALL_HEIGHT = 16;
    const LOWER_WALL_HEIGHT = 8;
    const LOWER_PANEL_Y = 5.0;
    const INNER_LOWER_PANEL_Y = 4.0;
    const UPPER_PANEL_Y = 12.0;
    const WALL_THICKNESS = 0.5;
    const halfRoomSize = ROOM_SIZE / 2;
    const BOUNDARY = ROOM_SIZE / 2 - 0.5;

    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8, metalness: 0.1 });
    const rainbowMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0.0 } },
      vertexShader: rainbowVertexShader,
      fragmentShader: rainbowFragmentShader,
      side: THREE.DoubleSide,
    });
    rainbowMaterialRef.current = rainbowMaterial;

    const outerWallGeo = new THREE.BoxGeometry(ROOM_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
    ['north', 'south', 'east', 'west'].forEach(dir => {
      const wall = new THREE.Mesh(outerWallGeo, wallMaterial.clone());
      if (dir === 'north') wall.position.set(0, WALL_HEIGHT / 2, -halfRoomSize);
      else if (dir === 'south') wall.position.set(0, WALL_HEIGHT / 2, halfRoomSize);
      else {
        wall.rotation.y = Math.PI / 2;
        wall.position.set(dir === 'east' ? halfRoomSize : -halfRoomSize, WALL_HEIGHT / 2, 0);
      }
      scene.add(wall);
    });

    const crossWallGeo = new THREE.BoxGeometry(ROOM_SEGMENT_SIZE, LOWER_WALL_HEIGHT, WALL_THICKNESS);
    [-10, 10].forEach(seg => {
      [5, -5].forEach(pos => {
        const w1 = new THREE.Mesh(crossWallGeo, wallMaterial.clone());
        w1.position.set(seg, LOWER_WALL_HEIGHT / 2, pos);
        scene.add(w1);
        const w2 = new THREE.Mesh(crossWallGeo, wallMaterial.clone());
        w2.rotation.y = Math.PI / 2;
        w2.position.set(pos, LOWER_WALL_HEIGHT / 2, seg);
        scene.add(w2);
      });
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2, metalness: 0.1 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);

    const PLATFORM_Y = LOWER_WALL_HEIGHT + WALL_THICKNESS / 2 + 0.01;
    const platform = new THREE.Mesh(new THREE.BoxGeometry(30, WALL_THICKNESS, 30), wallMaterial.clone());
    platform.position.set(0, PLATFORM_Y, 0); scene.add(platform);

    const shaderPlane = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), rainbowMaterial);
    shaderPlane.rotation.x = -Math.PI / 2; shaderPlane.position.set(0, LOWER_WALL_HEIGHT, 0); scene.add(shaderPlane);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), rainbowMaterial);
    ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, WALL_HEIGHT + 0.01, 0); scene.add(ceiling);

    const buttonGeo = new THREE.CylinderGeometry(1, 1, 0.2, 32);
    const buttonMat = new THREE.MeshStandardMaterial({ color: 0x1a3f7c, emissive: 0x1a3f7c, emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.9 });
    
    const groundBtn = new THREE.Mesh(buttonGeo, buttonMat.clone());
    groundBtn.position.set(0, 0.1, 0); groundBtn.userData = { isTeleportButton: true, targetY: PLATFORM_Y + 1.6 + WALL_THICKNESS / 2 };
    scene.add(groundBtn);

    const firstBtn = new THREE.Mesh(buttonGeo, buttonMat.clone());
    firstBtn.position.set(0, PLATFORM_Y + WALL_THICKNESS / 2 + 0.1, 0); firstBtn.userData = { isTeleportButton: true, targetY: 1.6 };
    scene.add(firstBtn);
    teleportButtonsRef.current = [groundBtn, firstBtn];

    const fadeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false });
    fadeMaterialRef.current = fadeMaterial;
    const fadeScreen = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), fadeMaterial);
    fadeScreen.renderOrder = 999; scene.add(fadeScreen);
    fadeScreenRef.current = fadeScreen;

    const performTeleport = (targetY: number) => {
      if (isTeleportingRef.current) return;
      isTeleportingRef.current = true; fadeStartTimeRef.current = performance.now();
      controls.unlock();
      setTimeout(() => { camera.position.y = targetY; controls.lock(); }, FADE_DURATION * 1000);
    };

    scene.add(new THREE.AmbientLight(0x404050, 1.0));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, WALL_HEIGHT, 0); scene.add(hemiLight);

    const gltfLoader = new GLTFLoader();

    // Furniture loading: Load sofas and coffee table from the same source GLB
    gltfLoader.load('/assets/models/sofa.glb', (gltf) => {
      let sofaTemplate: THREE.Object3D | null = null;
      let tableTemplate: THREE.Object3D | null = null;
      
      // Intelligent extraction based on common GLB naming conventions
      gltf.scene.traverse((node) => {
        const name = node.name.toLowerCase();
        if ((name.includes('sofa') || name.includes('couch')) && !sofaTemplate && (node instanceof THREE.Mesh || node instanceof THREE.Group)) {
          sofaTemplate = node;
        }
        if ((name.includes('table') || name.includes('coffee') || name.includes('desk')) && !tableTemplate && (node instanceof THREE.Mesh || node instanceof THREE.Group)) {
          tableTemplate = node;
        }
      });

      // Fallback if naming is obscure: pick largest mesh that isn't the first one found
      if (sofaTemplate && !tableTemplate) {
        gltf.scene.traverse((node) => {
          if (node instanceof THREE.Mesh && node !== sofaTemplate && !tableTemplate) {
            tableTemplate = node;
          }
        });
      }

      // Handle Sofa Placement
      if (sofaTemplate) {
        const sofaModel = sofaTemplate as THREE.Object3D;
        const box = new THREE.Box3().setFromObject(sofaModel);
        const size = new THREE.Vector3(); box.getSize(size);
        const maxDim = Math.max(size.x, size.z);
        const scale = 4.5 / maxDim;
        sofaModel.scale.set(scale, scale, scale);
        const adjustedBox = new THREE.Box3().setFromObject(sofaModel);
        const bottomY = adjustedBox.min.y;

        const sofaPositions = [{ x: 0, z: 4.5 }, { x: 0, z: -4.5 }, { x: 4.5, z: 0 }, { x: -4.5, z: 0 }];
        sofaPositions.forEach(pos => {
          const sofa = sofaModel.clone();
          sofa.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2 - bottomY, pos.z);
          sofa.rotation.y = Math.atan2(-pos.x, -pos.z);
          scene.add(sofa);
        });
      }

      // Handle Coffee Table Placement
      if (tableTemplate) {
        const tableModel = tableTemplate.clone();
        const box = new THREE.Box3().setFromObject(tableModel);
        const center = new THREE.Vector3(); box.getCenter(center);
        const size = new THREE.Vector3(); box.getSize(size);
        
        // Normalize table geometry
        tableModel.position.set(-center.x, -box.min.y, -center.z);
        const wrapper = new THREE.Group();
        wrapper.add(tableModel);
        
        // Scale to fit between sofas (~2.5m wide)
        const maxDim = Math.max(size.x, size.z);
        const scale = 2.5 / maxDim;
        wrapper.scale.set(scale, scale, scale);
        
        // Center on the first floor platform
        wrapper.position.set(0, PLATFORM_Y + WALL_THICKNESS / 2 + 0.02, 0);
        scene.add(wrapper);
      }
    });

    const panelGeo = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15); arrowShape.lineTo(0.3, 0); arrowShape.lineTo(0, -0.15);
    const arrowGeo = new THREE.ShapeGeometry(arrowShape);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide });

    const ARROW_DEPTH_OFFSET = 0.15 + WALL_THICKNESS / 2;
    const ARROW_PANEL_OFFSET = 3.2;

    const dynamicPanelConfigs: any[] = [];
    for (let i = 0; i <= 4; i++) {
      ['north-wall', 'south-wall', 'east-wall', 'west-wall'].forEach(base => {
        const seg = (i - 2) * 10;
        [{ y: LOWER_PANEL_Y, s: '-ground' }, { y: UPPER_PANEL_Y, s: '-first' }].forEach(tier => {
          let x = 0, z = 0, rotY = 0, dx = 0, dz = 0;
          if (base === 'north-wall') { x = seg; z = -halfRoomSize; rotY = 0; dz = ARROW_DEPTH_OFFSET; }
          else if (base === 'south-wall') { x = seg; z = halfRoomSize; rotY = Math.PI; dz = -ARROW_DEPTH_OFFSET; }
          else if (base === 'east-wall') { x = halfRoomSize; z = seg; rotY = -Math.PI / 2; dx = -ARROW_DEPTH_OFFSET; }
          else if (base === 'west-wall') { x = -halfRoomSize; z = seg; rotY = Math.PI / 2; dx = ARROW_DEPTH_OFFSET; }
          dynamicPanelConfigs.push({ wallName: `${base}-${i}${tier.s}`, pos: [x + dx, tier.y, z + dz], rot: [0, rotY, 0] });
        });
      });
    }

    // Inner cross walls
    [-10, 10].forEach((seg, i) => {
      const pos = 5 + ARROW_DEPTH_OFFSET;
      dynamicPanelConfigs.push({ wallName: `north-inner-wall-outer-${i}`, pos: [seg, INNER_LOWER_PANEL_Y, -pos], rot: [0, Math.PI, 0] });
      dynamicPanelConfigs.push({ wallName: `north-inner-wall-inner-${i}`, pos: [seg, INNER_LOWER_PANEL_Y, -5 + ARROW_DEPTH_OFFSET], rot: [0, 0, 0] });
      dynamicPanelConfigs.push({ wallName: `south-inner-wall-outer-${i}`, pos: [seg, INNER_LOWER_PANEL_Y, pos], rot: [0, 0, 0] });
      dynamicPanelConfigs.push({ wallName: `south-inner-wall-inner-${i}`, pos: [seg, INNER_LOWER_PANEL_Y, 5 - ARROW_DEPTH_OFFSET], rot: [0, Math.PI, 0] });
      dynamicPanelConfigs.push({ wallName: `east-inner-wall-outer-${i}`, pos: [pos, INNER_LOWER_PANEL_Y, seg], rot: [0, Math.PI / 2, 0] });
      dynamicPanelConfigs.push({ wallName: `east-inner-wall-inner-${i}`, pos: [5 - ARROW_DEPTH_OFFSET, INNER_LOWER_PANEL_Y, seg], rot: [0, -Math.PI / 2, 0] });
      dynamicPanelConfigs.push({ wallName: `west-inner-wall-outer-${i}`, pos: [-pos, INNER_LOWER_PANEL_Y, seg], rot: [0, -Math.PI / 2, 0] });
      dynamicPanelConfigs.push({ wallName: `west-inner-wall-inner-${i}`, pos: [-5 + ARROW_DEPTH_OFFSET, INNER_LOWER_PANEL_Y, seg], rot: [0, Math.PI / 2, 0] });
    });

    panelsRef.current = [];
    dynamicPanelConfigs.forEach(cfg => {
      const mesh = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
      mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      mesh.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
      scene.add(mesh);

      const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(cfg.rot[0], cfg.rot[1], cfg.rot[2]));
      const prevArrow = new THREE.Mesh(arrowGeo, arrowMat.clone());
      prevArrow.rotation.y = cfg.rot[1] + Math.PI;
      prevArrow.position.copy(mesh.position).addScaledVector(rightVector, -ARROW_PANEL_OFFSET);
      prevArrow.userData = { isArrow: true, direction: 'prev' }; scene.add(prevArrow);

      const nextArrow = new THREE.Mesh(arrowGeo, arrowMat.clone());
      nextArrow.rotation.y = cfg.rot[1];
      nextArrow.position.copy(mesh.position).addScaledVector(rightVector, ARROW_PANEL_OFFSET);
      nextArrow.userData = { isArrow: true, direction: 'next' }; scene.add(nextArrow);

      panelsRef.current.push({ mesh, wallName: cfg.wallName, metadataUrl: '', isVideo: false, isGif: false, prevArrow, nextArrow, videoElement: null, gifStopFunction: null });
    });

    const raycaster = new THREE.Raycaster();
    const onClick = () => {
      if (!controls.isLocked) return;
      if (currentTargetedButton?.userData?.isTeleportButton) return performTeleport(currentTargetedButton.userData.targetY);
      if (currentTargetedArrow) {
        const panel = panelsRef.current.find(p => p.prevArrow === currentTargetedArrow || p.nextArrow === currentTargetedArrow);
        if (panel && updatePanelIndex(panel.wallName, currentTargetedArrow.userData.direction)) updatePanelContent(panel, getCurrentNftSource(panel.wallName));
        return;
      }
      if (currentTargetedPanel?.metadataUrl) {
        const cfg = GALLERY_PANEL_CONFIG[currentTargetedPanel.wallName];
        setMarketBrowserState({ open: true, collection: cfg.contractAddress, tokenId: cfg.tokenIds[cfg.currentIndex] });
      }
    };
    renderer.domElement.addEventListener('click', onClick);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') moveForwardRef.current = true;
      if (e.code === 'KeyA') moveLeftRef.current = true;
      if (e.code === 'KeyS') moveBackwardRef.current = true;
      if (e.code === 'KeyD') moveRightRef.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') moveForwardRef.current = false;
      if (e.code === 'KeyA') moveLeftRef.current = false;
      if (e.code === 'KeyS') moveBackwardRef.current = false;
      if (e.code === 'KeyD') moveRightRef.current = false;
    };
    document.addEventListener('keydown', onKeyDown); document.addEventListener('keyup', onKeyUp);

    let stopAnim = false;
    const initLoad = async () => {
      await initializeGalleryConfig();
      for (let i = 0; i < panelsRef.current.length; i++) {
        if (stopAnim) break;
        const p = panelsRef.current[i];
        updatePanelContent(p, getCurrentNftSource(p.wallName));
        if (i % 2 === 0) {
          const jitter = Math.random() * 200;
          await new Promise(r => setTimeout(r, 250 + jitter));
        }
      }
    };
    initLoad();

    const animate = () => {
      if (stopAnim) return;
      const time = performance.now();
      const delta = (time - prevTimeRef.current) / 1000;
      prevTimeRef.current = time;

      if (controls.isLocked) {
        const vel = velocityRef.current; const dir = directionRef.current;
        dir.z = Number(moveForwardRef.current) - Number(moveBackwardRef.current);
        dir.x = Number(moveRightRef.current) - Number(moveLeftRef.current);
        dir.normalize();
        if (moveForwardRef.current || moveBackwardRef.current) vel.z -= dir.z * 20.0 * delta;
        if (moveLeftRef.current || moveRightRef.current) vel.x -= dir.x * 20.0 * delta;
        vel.x -= vel.x * 10.0 * delta; vel.z -= vel.z * 10.0 * delta;
        controls.moveRight(-vel.x * delta); controls.moveForward(-vel.z * delta);
        camera.position.x = Math.max(-BOUNDARY, Math.min(BOUNDARY, camera.position.x));
        camera.position.z = Math.max(-BOUNDARY, Math.min(BOUNDARY, camera.position.z));
      }

      if (rainbowMaterialRef.current) rainbowMaterialRef.current.uniforms.time.value += delta;
      if (fadeScreenRef.current) { fadeScreenRef.current.position.copy(camera.position); fadeScreenRef.current.quaternion.copy(camera.quaternion); }
      if (isTeleportingRef.current && fadeMaterialRef.current) {
        const elapsed = (time - fadeStartTimeRef.current) / 1000;
        if (elapsed < FADE_DURATION) fadeMaterialRef.current.opacity = elapsed / FADE_DURATION;
        else if (elapsed < 2 * FADE_DURATION) fadeMaterialRef.current.opacity = 1 - (elapsed - FADE_DURATION) / FADE_DURATION;
        else { fadeMaterialRef.current.opacity = 0; isTeleportingRef.current = false; }
      }

      if (camera && raycaster) {
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hits = raycaster.intersectObjects([...panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow]), ...teleportButtonsRef.current]);
        currentTargetedPanel = null; currentTargetedArrow = null; currentTargetedButton = null;
        panelsRef.current.forEach(p => { (p.prevArrow.material as any).color.setHex(0xcccccc); (p.nextArrow.material as any).color.setHex(0xcccccc); });
        teleportButtonsRef.current.forEach(b => { (b.material as any).color.setHex(0x1a3f7c); (b.material as any).emissive.setHex(0x1a3f7c); });
        if (hits.length > 0) {
          const hit = hits[0].object as THREE.Mesh;
          if (hit.userData.isTeleportButton) {
            currentTargetedButton = hit; (hit.material as any).color.setHex(0x00ffff); (hit.material as any).emissive.setHex(0x00ffff);
          } else {
            const p = panelsRef.current.find(p => p.mesh === hit || p.prevArrow === hit || p.nextArrow === hit);
            if (p) {
              if (hit === p.mesh) currentTargetedPanel = p;
              else { currentTargetedArrow = hit; (hit.material as any).color.setHex(0x00ff00); }
            }
          }
        }
      }

      renderer.render(scene, camera); requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
    window.addEventListener('resize', onResize);

    return () => {
      stopAnim = true; document.removeEventListener('keydown', onKeyDown); document.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('click', onClick); window.removeEventListener('resize', onResize);
      (window as any).galleryControls = undefined;
      panelsRef.current.forEach(p => { disposeTextureSafely(p.mesh); p.videoElement?.pause(); p.gifStopFunction?.(); });
      renderer.dispose(); mountRef.current?.removeChild(renderer.domElement);
    };
  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback]);

  return (
    <>
      <div ref={mountRef} className="w-full h-full" />
      {marketBrowserState.open && (
        <MarketBrowserRefined collection={marketBrowserState.collection || ''} tokenId={marketBrowserState.tokenId || ''} open={marketBrowserState.open} onClose={() => setMarketBrowserState({ open: false })} />
      )}
    </>
  );
};

export default NftGallery;