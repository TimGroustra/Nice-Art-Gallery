import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource, NftAttribute } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';
import { createGifTexture } from '@/utils/gifTexture';
import { MarketBrowserRefined } from './MarketBrowserRefined';
import { useWallet } from '@/hooks/useWallet';
import { LockPanelModal } from './LockPanelModal';

RectAreaLightUniformsLib.init();

const TEXT_PANEL_WIDTH = 2.5;
const TITLE_HEIGHT = 0.5;
const DESCRIPTION_HEIGHT = 1.5;
const ATTRIBUTES_HEIGHT = 1.5;
const DESCRIPTION_PANEL_HEIGHT = TITLE_HEIGHT + DESCRIPTION_HEIGHT;

interface Panel {
  mesh: THREE.Mesh;
  wallName: keyof PanelConfig;
  metadataUrl: string;
  isVideo: boolean;
  isGif: boolean;
  isLocked: boolean;
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

interface NftGalleryProps {
  setInstructionsVisible: (visible: boolean) => void;
}

let currentTargetedPanel: Panel | null = null;
let currentTargetedArrow: THREE.Mesh | null = null;
let currentTargetedDescriptionPanel: Panel | null = null;

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


const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const [isLocked, setIsLocked] = useState(false); 
  const [marketBrowserState, setMarketBrowserState] = useState<{ open: boolean; collection?: string; tokenId?: string | number; }>({ open: false });
  const { account, hasEnoughGems } = useWallet();
  const [lockModalState, setLockModalState] = useState({ open: false, panelId: '' });
  const [galleryVersion, setGalleryVersion] = useState(0);

  const reloadGallery = () => {
    setGalleryVersion(v => v + 1);
  };

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

  const isVideoContent = (contentType: string, url: string) => !!(contentType.startsWith('video/') || url.match(/\.(mp4|webm|ogg)(\?|$)/i));
  const isGifContent = (contentType: string, url: string) => !!(contentType === "image/gif" || url.match(/\.gif(\?|$)/i));

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
        let videoEl = panel.videoElement || document.createElement('video');
        videoEl.playsInline = true;
        videoEl.autoplay = true;
        videoEl.loop = true;
        videoEl.muted = true;
        videoEl.style.display = 'none';
        videoEl.crossOrigin = 'anonymous'; 
        panel.videoElement = videoEl;
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
        }
    }
    
    return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous'); 
        loader.load(url, resolve, undefined, (error) => {
            console.error('Error loading texture:', url, error);
            showError(`Failed to load image: ${url.substring(0, 50)}...`);
            reject(error);
        });
    });
  }, []);

  const updatePanelContent = useCallback(async (panel: Panel, source: NftSource | null) => {
    const panelConfig = GALLERY_PANEL_CONFIG[panel.wallName];
    const collectionName = panelConfig?.name || '...';

    disposeTextureSafely(panel.wallTitleMesh);
    const { texture: wallTitleTexture } = createTextTexture(collectionName, 8, 0.75, 120, 'white', { wordWrap: false });
    (panel.wallTitleMesh.material as THREE.MeshBasicMaterial).map = wallTitleTexture;
    panel.wallTitleMesh.visible = true;

    disposeTextureSafely(panel.mesh);
    panel.mesh.material = new THREE.MeshBasicMaterial({ color: 0x333333 });
    panel.metadataUrl = '';
    panel.isVideo = false;
    panel.isGif = false;
    panel.isLocked = !!panelConfig?.isLocked;
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
    
    if (!source || source.contractAddress === "") return;

    const metadata: NftMetadata | null = await getCachedNftMetadata(source.contractAddress, source.tokenId);
    
    if (!metadata) {
        console.warn(`Skipping panel ${panel.wallName} (${source.contractAddress}/${source.tokenId}) due to metadata fetch failure.`);
        disposeTextureSafely(panel.mesh);
        const { texture: errorTexture } = createTextTexture("NFT Unavailable", 2, 2, 80, 'red', { wordWrap: false });
        panel.mesh.material = new THREE.MeshBasicMaterial({ map: errorTexture, side: THREE.DoubleSide });
        return;
    }

    try {
      const texture = await loadTexture(metadata.contentUrl, panel, metadata.contentType);
      
      disposeTextureSafely(panel.mesh);
      panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture });

      panel.metadataUrl = metadata.source;
      panel.isVideo = isVideoContent(metadata.contentType, metadata.contentUrl);
      panel.isGif = isGifContent(metadata.contentType, metadata.contentUrl);

      disposeTextureSafely(panel.titleMesh);
      const { texture: titleTexture } = createTextTexture(metadata.title, 4.0, 0.5, 120, 'white', { wordWrap: false });
      (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTexture;
      panel.titleMesh.visible = true;

      disposeTextureSafely(panel.descriptionMesh);
      const { texture: descriptionTexture, totalHeight } = createTextTexture(metadata.description, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, 'lightgray', { wordWrap: true });
      (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = descriptionTexture;
      panel.descriptionMesh.visible = true;

      panel.currentDescription = metadata.description;
      panel.descriptionTextHeight = totalHeight;
      panel.descriptionScrollY = 0;

      disposeTextureSafely(panel.attributesMesh);
      panel.currentAttributes = metadata.attributes || [];
      const { texture: attributesTexture } = createAttributesTextTexture(panel.currentAttributes, TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT, 40, 'lightgray');
      (panel.attributesMesh.material as THREE.MeshBasicMaterial).map = attributesTexture;
      panel.attributesMesh.visible = true;

    } catch (error) {
      console.error(`Error loading NFT content for ${panel.wallName}:`, error);
      showError(`Failed to load NFT content for ${panel.wallName}.`);
    }
  }, [loadTexture]);

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
        return activeVideos.length === 0 ? true : activeVideos.every(p => p.videoElement!.muted);
      },
      toggleMute: () => { 
        const activeVideos = panelsRef.current.filter(p => p.videoElement);
        if (activeVideos.length > 0) {
          const currentlyMuted = activeVideos[0].videoElement!.muted;
          activeVideos.forEach(p => { p.videoElement!.muted = !currentlyMuted; });
        }
      },
      isLocked: () => controls.isLocked, 
      getTargetedPanel: () => currentTargetedPanel,
      openLockModal: () => {
        if (currentTargetedPanel) {
          setLockModalState({ open: true, panelId: String(currentTargetedPanel.wallName) });
        }
      },
    };

    controls.addEventListener('lock', () => { setIsLocked(true); setInstructionsVisible(false); manageVideoPlayback(true); });
    controls.addEventListener('unlock', () => { setIsLocked(false); setInstructionsVisible(true); manageVideoPlayback(false); });

    // --- ROOM GEOMETRY (UNCHANGED) ---
    const ROOM_SEGMENT_SIZE = 10;
    const NUM_SEGMENTS = 5;
    const ROOM_SIZE = ROOM_SEGMENT_SIZE * NUM_SEGMENTS;
    const WALL_HEIGHT = 4;
    const PANEL_Y_POSITION = 1.8;
    const BOUNDARY = ROOM_SIZE / 2 - 0.5;
    const halfRoomSize = ROOM_SIZE / 2;
    const segmentGeometry = new THREE.PlaneGeometry(ROOM_SEGMENT_SIZE, ROOM_SEGMENT_SIZE);
    const outerFloorMaterial = new THREE.MeshPhongMaterial({ color: 0xF5F5F5, side: THREE.DoubleSide });
    for (let i = 0; i < NUM_SEGMENTS; i++) {
        for (let j = 0; j < NUM_SEGMENTS; j++) {
            const segmentCenter = (i - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;
            const segmentCenterZ = (j - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;
            const outerFloor = new THREE.Mesh(segmentGeometry, outerFloorMaterial);
            outerFloor.rotation.x = Math.PI / 2;
            outerFloor.position.set(segmentCenter, 0, segmentCenterZ);
            scene.add(outerFloor);
            const ceiling = new THREE.Mesh(segmentGeometry, new THREE.MeshPhongMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
            ceiling.rotation.x = Math.PI / 2;
            ceiling.position.set(segmentCenter, WALL_HEIGHT, segmentCenterZ);
            scene.add(ceiling);
        }
    }
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('/floor.jpg', (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(NUM_SEGMENTS, NUM_SEGMENTS); 
        const innerFloorGeometry = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
        const innerFloorMaterial = new THREE.MeshPhongMaterial({ map: texture, side: THREE.DoubleSide });
        const innerFloor = new THREE.Mesh(innerFloorGeometry, innerFloorMaterial);
        innerFloor.rotation.x = Math.PI / 2;
        innerFloor.position.y = 0.01; 
        scene.add(innerFloor);
    });
    const innerWallMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });
    const innerWallSegmentGeometry = new THREE.PlaneGeometry(ROOM_SEGMENT_SIZE, WALL_HEIGHT);
    const innerSegmentCenters = [-20, -10, 0, 10, 20];
    innerSegmentCenters.forEach(segmentCenter => {
        const northInnerWall = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        northInnerWall.position.set(segmentCenter, WALL_HEIGHT / 2, -halfRoomSize);
        scene.add(northInnerWall);
        const southInnerWall = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        southInnerWall.rotation.y = Math.PI;
        southInnerWall.position.set(segmentCenter, WALL_HEIGHT / 2, halfRoomSize);
        scene.add(southInnerWall);
        const eastInnerWall = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        eastInnerWall.rotation.y = -Math.PI / 2;
        eastInnerWall.position.set(halfRoomSize, WALL_HEIGHT / 2, segmentCenter);
        scene.add(eastInnerWall);
        const westInnerWall = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        westInnerWall.rotation.y = Math.PI / 2;
        westInnerWall.position.set(-halfRoomSize, WALL_HEIGHT / 2, segmentCenter);
        scene.add(westInnerWall);
    });
    const innerInnerSegmentCenters = [-10, 0, 10];
    innerInnerSegmentCenters.forEach(segmentCenter => {
        if (segmentCenter === 0) return;
        const northInnerInnerWall = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        northInnerInnerWall.position.set(segmentCenter, WALL_HEIGHT / 2, -15);
        scene.add(northInnerInnerWall);
        const southInnerInnerWall = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        southInnerInnerWall.rotation.y = Math.PI;
        southInnerInnerWall.position.set(segmentCenter, WALL_HEIGHT / 2, 15);
        scene.add(southInnerInnerWall);
        const eastInnerInnerWall = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        eastInnerInnerWall.rotation.y = -Math.PI / 2;
        eastInnerInnerWall.position.set(15, WALL_HEIGHT / 2, segmentCenter);
        scene.add(eastInnerInnerWall);
        const westInnerInnerWall = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        westInnerInnerWall.rotation.y = Math.PI / 2;
        westInnerInnerWall.position.set(-15, WALL_HEIGHT / 2, segmentCenter);
        scene.add(westInnerInnerWall);
    });
    const innerInnerInnerSegmentCenters = [0];
    innerInnerInnerSegmentCenters.forEach(segmentCenter => {
        const northWall = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        northWall.position.set(segmentCenter, WALL_HEIGHT / 2, -5);
        scene.add(northWall);
        const southWall = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        southWall.rotation.y = Math.PI;
        southWall.position.set(segmentCenter, WALL_HEIGHT / 2, 5);
        scene.add(southWall);
        const eastWall = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        eastWall.rotation.y = -Math.PI / 2;
        eastWall.position.set(5, WALL_HEIGHT / 2, segmentCenter);
        scene.add(eastWall);
        const westWall = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        westWall.rotation.y = Math.PI / 2;
        westWall.position.set(-5, WALL_HEIGHT / 2, segmentCenter);
        scene.add(westWall);
    });
    // --- END ROOM GEOMETRY ---

    // --- LIGHTING (UNCHANGED) ---
    const lights: THREE.PointLight[] = [];
    const NUM_DISCO_LIGHTS = 10; 
    const lightColors = [0xff0066, 0x00ffd5, 0xffff00, 0x66ff00, 0x0066ff]; 
    const lightRadius = ROOM_SIZE * 0.4;
    for (let i = 0; i < NUM_DISCO_LIGHTS; i++) {
      const pl = new THREE.PointLight(lightColors[i % lightColors.length], 1.5, ROOM_SIZE * 1.5, 1.5);
      pl.position.set(Math.cos(i / NUM_DISCO_LIGHTS * Math.PI * 2) * lightRadius, 3.5, Math.sin(i / NUM_DISCO_LIGHTS * Math.PI * 2) * lightRadius);
      scene.add(pl);
      lights.push(pl);
    }
    scene.add(new THREE.AmbientLight(0x404050, 0.5));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x000000, 0.2));
    const createCoveLighting = (position: [number, number, number], rotation: [number, number, number], order: THREE.EulerOrder = 'XYZ') => {
        const rectLight = new THREE.RectAreaLight(0x87CEEB, 10, ROOM_SEGMENT_SIZE, 0.1);
        rectLight.position.set(...position);
        rectLight.rotation.set(rotation[0], rotation[1], rotation[2], order);
        scene.add(rectLight);
    };
    innerSegmentCenters.forEach(segmentCenter => {
        createCoveLighting([segmentCenter, WALL_HEIGHT - 0.1, -halfRoomSize + 0.15], [-Math.PI / 2, Math.PI, 0]);
        createCoveLighting([segmentCenter, WALL_HEIGHT - 0.1, halfRoomSize - 0.15], [Math.PI / 2, Math.PI, 0]);
        createCoveLighting([halfRoomSize - 0.15, WALL_HEIGHT - 0.1, segmentCenter], [Math.PI / 2, Math.PI / 2, 0], 'YXZ');
        createCoveLighting([-halfRoomSize + 0.15, WALL_HEIGHT - 0.1, segmentCenter], [Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
    });
    innerInnerSegmentCenters.forEach(segmentCenter => {
        if (segmentCenter === 0) return;
        createCoveLighting([segmentCenter, WALL_HEIGHT - 0.1, -15 - 0.05], [Math.PI / 2, 0, 0]);
        createCoveLighting([segmentCenter, WALL_HEIGHT - 0.1, -15 + 0.15], [-Math.PI / 2, Math.PI, 0]);
        createCoveLighting([segmentCenter, WALL_HEIGHT - 0.1, 15 + 0.05], [-Math.PI / 2, 0, 0]);
        createCoveLighting([segmentCenter, WALL_HEIGHT - 0.1, 15 - 0.15], [Math.PI / 2, Math.PI, 0]);
        createCoveLighting([15 + 0.05, WALL_HEIGHT - 0.1, segmentCenter], [-Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
        createCoveLighting([15 - 0.15, WALL_HEIGHT - 0.1, segmentCenter], [Math.PI / 2, Math.PI / 2, 0], 'YXZ');
        createCoveLighting([-15 - 0.05, WALL_HEIGHT - 0.1, segmentCenter], [-Math.PI / 2, Math.PI / 2, 0], 'YXZ');
        createCoveLighting([-15 + 0.15, WALL_HEIGHT - 0.1, segmentCenter], [Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
    });
    innerInnerInnerSegmentCenters.forEach(segmentCenter => {
        createCoveLighting([segmentCenter, WALL_HEIGHT - 0.1, -5 - 0.05], [Math.PI / 2, 0, 0]);
        createCoveLighting([segmentCenter, WALL_HEIGHT - 0.1, -5 + 0.15], [-Math.PI / 2, Math.PI, 0]);
        createCoveLighting([segmentCenter, WALL_HEIGHT - 0.1, 5 + 0.05], [-Math.PI / 2, 0, 0]);
        createCoveLighting([segmentCenter, WALL_HEIGHT - 0.1, 5 - 0.15], [Math.PI / 2, Math.PI, 0]);
        createCoveLighting([5 + 0.05, WALL_HEIGHT - 0.1, segmentCenter], [-Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
        createCoveLighting([5 - 0.15, WALL_HEIGHT - 0.1, segmentCenter], [Math.PI / 2, Math.PI / 2, 0], 'YXZ');
        createCoveLighting([-5 - 0.05, WALL_HEIGHT - 0.1, segmentCenter], [-Math.PI / 2, Math.PI / 2, 0], 'YXZ');
        createCoveLighting([-5 + 0.15, WALL_HEIGHT - 0.1, segmentCenter], [Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
    });
    // --- END LIGHTING ---

    // --- PANEL CREATION (UNCHANGED LOGIC, DYNAMICALLY POPULATED) ---
    const dynamicPanelConfigs: { wallName: keyof PanelConfig, position: [number, number, number], rotation: [number, number, number], textOffsetSign: number }[] = [];
    const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall'];
    for (let i = 0; i <= 4; i++) { 
        for (const wallNameBase of WALL_NAMES) {
            const panelKey = `${wallNameBase}-${i}` as keyof PanelConfig;
            let x = 0, z = 0, depthSign = 0;
            let rotation: [number, number, number] = [0, 0, 0];
            let wallAxis: 'x' | 'z' = 'z';
            const segmentCenter = (i - 2) * ROOM_SEGMENT_SIZE; 
            if (wallNameBase === 'north-wall') { x = segmentCenter; z = -halfRoomSize; rotation = [0, 0, 0]; depthSign = 1; wallAxis = 'z'; }
            else if (wallNameBase === 'south-wall') { x = segmentCenter; z = halfRoomSize; rotation = [0, Math.PI, 0]; depthSign = -1; wallAxis = 'z'; }
            else if (wallNameBase === 'east-wall') { x = halfRoomSize; z = segmentCenter; rotation = [0, -Math.PI / 2, 0]; depthSign = -1; wallAxis = 'x'; }
            else if (wallNameBase === 'west-wall') { x = -halfRoomSize; z = segmentCenter; rotation = [0, Math.PI / 2, 0]; depthSign = 1; wallAxis = 'x'; }
            let finalX = x, finalZ = z;
            if (wallAxis === 'x') finalX += depthSign * 0.15; else finalZ += depthSign * 0.15;
            dynamicPanelConfigs.push({ wallName: panelKey, position: [finalX, PANEL_Y_POSITION, finalZ], rotation: rotation, textOffsetSign: 1 });
        }
    }
    const innerInnerWallSegments = [-10, 10];
    innerInnerWallSegments.forEach((segmentCenter, i) => {
        dynamicPanelConfigs.push({ wallName: `north-inner-wall-outer-${i}` as keyof PanelConfig, position: [segmentCenter, PANEL_Y_POSITION, -15 - 0.15], rotation: [0, Math.PI, 0], textOffsetSign: 1 });
        dynamicPanelConfigs.push({ wallName: `north-inner-wall-inner-${i}` as keyof PanelConfig, position: [segmentCenter, PANEL_Y_POSITION, -15 + 0.15], rotation: [0, 0, 0], textOffsetSign: 1 });
        dynamicPanelConfigs.push({ wallName: `south-inner-wall-outer-${i}` as keyof PanelConfig, position: [segmentCenter, PANEL_Y_POSITION, 15 + 0.15], rotation: [0, 0, 0], textOffsetSign: 1 });
        dynamicPanelConfigs.push({ wallName: `south-inner-wall-inner-${i}` as keyof PanelConfig, position: [segmentCenter, PANEL_Y_POSITION, 15 - 0.15], rotation: [0, Math.PI, 0], textOffsetSign: 1 });
        dynamicPanelConfigs.push({ wallName: `east-inner-wall-outer-${i}` as keyof PanelConfig, position: [15 + 0.15, PANEL_Y_POSITION, segmentCenter], rotation: [0, Math.PI / 2, 0], textOffsetSign: 1 });
        dynamicPanelConfigs.push({ wallName: `east-inner-wall-inner-${i}` as keyof PanelConfig, position: [15 - 0.15, PANEL_Y_POSITION, segmentCenter], rotation: [0, -Math.PI / 2, 0], textOffsetSign: 1 });
        dynamicPanelConfigs.push({ wallName: `west-inner-wall-outer-${i}` as keyof PanelConfig, position: [-15 - 0.15, PANEL_Y_POSITION, segmentCenter], rotation: [0, -Math.PI / 2, 0], textOffsetSign: 1 });
        dynamicPanelConfigs.push({ wallName: `west-inner-wall-inner-${i}` as keyof PanelConfig, position: [-15 + 0.15, PANEL_Y_POSITION, segmentCenter], rotation: [0, Math.PI / 2, 0], textOffsetSign: 1 });
    });
    dynamicPanelConfigs.push({ wallName: `north-center-wall-0` as keyof PanelConfig, position: [0, PANEL_Y_POSITION, -5 - 0.15], rotation: [0, Math.PI, 0], textOffsetSign: 1 });
    dynamicPanelConfigs.push({ wallName: `south-center-wall-0` as keyof PanelConfig, position: [0, PANEL_Y_POSITION, 5 + 0.15], rotation: [0, 0, 0], textOffsetSign: 1 });
    dynamicPanelConfigs.push({ wallName: `east-center-wall-0` as keyof PanelConfig, position: [5 + 0.15, PANEL_Y_POSITION, 0], rotation: [0, Math.PI / 2, 0], textOffsetSign: 1 });
    dynamicPanelConfigs.push({ wallName: `west-center-wall-0` as keyof PanelConfig, position: [-5 - 0.15, PANEL_Y_POSITION, 0], rotation: [0, -Math.PI / 2, 0], textOffsetSign: 1 });
    
    panelsRef.current = [];
    const panelGeometry = new THREE.PlaneGeometry(2, 2);
    const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide, transparent: true, opacity: 0 });
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15); arrowShape.lineTo(0.3, 0); arrowShape.lineTo(0, -0.15); arrowShape.lineTo(0, 0.15);
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
    const createTextPanelMaterial = () => new THREE.MeshBasicMaterial({ map: null, transparent: true, side: THREE.DoubleSide, alphaTest: 0.01, depthWrite: false });
    const titleGeometry = new THREE.PlaneGeometry(4.0, TITLE_HEIGHT);
    const descriptionGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT);
    const attributesGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT);
    const wallTitleGeometry = new THREE.PlaneGeometry(8, 0.75); 

    dynamicPanelConfigs.forEach(config => {
      const mesh = new THREE.Mesh(panelGeometry, panelMaterial.clone());
      mesh.position.set(...config.position);
      mesh.rotation.set(...config.rotation);
      scene.add(mesh);
      const wallRotation = new THREE.Euler(...config.rotation, 'XYZ');
      const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);
      const upVector = new THREE.Vector3(0, 1, 0).applyEuler(wallRotation);
      const forwardVector = new THREE.Vector3(0, 0, 1).applyEuler(wallRotation);
      const basePosition = new THREE.Vector3(...config.position);
      const titleMesh = new THREE.Mesh(titleGeometry, createTextPanelMaterial());
      titleMesh.rotation.set(...config.rotation);
      titleMesh.position.copy(basePosition.clone().addScaledVector(upVector, -1.35).addScaledVector(forwardVector, 0.16));
      titleMesh.visible = false;
      scene.add(titleMesh);
      const descriptionMesh = new THREE.Mesh(descriptionGeometry, createTextPanelMaterial());
      descriptionMesh.rotation.set(...config.rotation);
      descriptionMesh.position.copy(basePosition.clone().addScaledVector(rightVector, -3.25 * config.textOffsetSign).addScaledVector(forwardVector, 0.16));
      descriptionMesh.visible = false;
      scene.add(descriptionMesh);
      const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      prevArrow.rotation.set(config.rotation[0], config.rotation[1] + Math.PI, config.rotation[2]);
      prevArrow.position.copy(basePosition.clone().addScaledVector(rightVector, -1.5));
      scene.add(prevArrow);
      const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      nextArrow.rotation.set(...config.rotation);
      nextArrow.position.copy(basePosition.clone().addScaledVector(rightVector, 1.5));
      scene.add(nextArrow);
      const attributesMesh = new THREE.Mesh(attributesGeometry, createTextPanelMaterial());
      attributesMesh.rotation.set(...config.rotation);
      attributesMesh.position.copy(basePosition.clone().addScaledVector(rightVector, 3.25 * config.textOffsetSign).addScaledVector(forwardVector, 0.16));
      attributesMesh.visible = false;
      scene.add(attributesMesh);
      const wallTitleMesh = new THREE.Mesh(wallTitleGeometry, createTextPanelMaterial());
      wallTitleMesh.rotation.set(...config.rotation);
      wallTitleMesh.position.copy(new THREE.Vector3(...config.position).setY(3.2));
      wallTitleMesh.visible = false;
      scene.add(wallTitleMesh);
      const panel: Panel = { mesh, wallName: config.wallName, metadataUrl: '', isVideo: false, isGif: false, isLocked: false, prevArrow, nextArrow, titleMesh, descriptionMesh, attributesMesh, wallTitleMesh, currentDescription: '', descriptionScrollY: 0, descriptionTextHeight: 0, currentAttributes: [], videoElement: null, gifStopFunction: null };
      panelsRef.current.push(panel);
    });
    // --- END PANEL CREATION ---

    let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
    const velocity = new THREE.Vector3(), direction = new THREE.Vector3(), speed = 20.0;
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': moveForward = true; break; case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break; case 'KeyD': moveRight = true; break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': moveForward = false; break; case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break; case 'KeyD': moveRight = false; break;
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
        if (panel && !panel.isLocked) {
          if (updatePanelIndex(panel.wallName, currentTargetedArrow === panel.nextArrow ? 'next' : 'prev')) {
            updatePanelContent(panel, getCurrentNftSource(panel.wallName));
          }
        }
      } else if (currentTargetedPanel) {
        const source = getCurrentNftSource(currentTargetedPanel.wallName);
        if (source) {
          setMarketBrowserState({ open: true, collection: source.contractAddress, tokenId: source.tokenId });
          controls.unlock();
        }
      }
    };
    document.addEventListener('mousedown', onDocumentMouseDown);

    const onDocumentWheel = (event: WheelEvent) => {
      if (!controls.isLocked || !currentTargetedDescriptionPanel) return;
      const panel = currentTargetedDescriptionPanel;
      const scrollAmount = event.deltaY * 0.5;
      const maxScroll = Math.max(0, panel.descriptionTextHeight - (512 - 80));
      let newScrollY = Math.max(0, Math.min(panel.descriptionScrollY + scrollAmount, maxScroll));
      if (panel.descriptionScrollY !== newScrollY) {
        panel.descriptionScrollY = newScrollY;
        if (panel.descriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.descriptionMesh.material.map) {
          panel.descriptionMesh.material.map.dispose();
        }
        const { texture } = createTextTexture(panel.currentDescription, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, 'lightgray', { wordWrap: true, scrollY: panel.descriptionScrollY });
        (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = texture;
      }
    };
    document.addEventListener('wheel', onDocumentWheel);

    let prevTime = performance.now();
    const animate = () => {
      requestAnimationFrame(animate);
      const time = performance.now(), delta = (time - prevTime) / 1000;
      lights.forEach((light, i) => {
        const angle = time * 0.0001 + i * (Math.PI * 2 / NUM_DISCO_LIGHTS);
        light.position.x = Math.cos(angle) * lightRadius;
        light.position.z = Math.sin(angle) * lightRadius;
      });

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
        
        camera.position.x = Math.max(-BOUNDARY, Math.min(BOUNDARY, camera.position.x));
        camera.position.z = Math.max(-BOUNDARY, Math.min(BOUNDARY, camera.position.z));
        camera.position.y = 1.6;
        
        raycaster.setFromCamera(center, camera);
        const intersects = raycaster.intersectObjects(panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow, p.descriptionMesh]));
        
        panelsRef.current.forEach(p => {
          (p.prevArrow.material as THREE.MeshBasicMaterial).color.setHex(0xcccccc);
          (p.nextArrow.material as THREE.MeshBasicMaterial).color.setHex(0xcccccc);
          p.prevArrow.visible = !p.isLocked;
          p.nextArrow.visible = !p.isLocked;
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
              (intersectedMesh.material as THREE.MeshBasicMaterial).color.setHex(0x00ff00);
            } else if (intersectedMesh === panel.descriptionMesh) {
              currentTargetedDescriptionPanel = panel;
            }
          }
        }

        const uiControls = (window as any).uiControls;
        if (controls.isLocked && hasEnoughGems && currentTargetedPanel && uiControls) {
            const config = GALLERY_PANEL_CONFIG[currentTargetedPanel.wallName];
            const isExpired = !config.isLocked;
            const isOwner = config.isLocked && config.lockedByAddress?.toLowerCase() === account?.toLowerCase();
            if (isExpired || isOwner) {
                const pos = new THREE.Vector3();
                currentTargetedPanel.mesh.getWorldPosition(pos);
                pos.project(camera);
                const x = (pos.x * .5 + .5) * renderer.domElement.clientWidth;
                const y = (pos.y * -.5 + .5) * renderer.domElement.clientHeight;
                uiControls.setCogPosition({ x, y: y - 50 });
            } else {
                uiControls.setCogPosition(null);
            }
        } else if (uiControls) {
            uiControls.setCogPosition(null);
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

    const fetchAndRenderPanelsSequentially = async () => {
      await initializeGalleryConfig();
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
      mountRef.current?.removeChild(renderer.domElement);
      controls.dispose();
      panelsRef.current.forEach(panel => {
        if (panel.videoElement) panel.videoElement.pause();
        if (panel.gifStopFunction) panel.gifStopFunction();
      });
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
          else { if (obj.material.map) obj.material.map.dispose(); obj.material.dispose(); }
        }
      });
      renderer.dispose();
      delete (window as any).galleryControls;
      currentTargetedPanel = null; 
      currentTargetedArrow = null;
      currentTargetedDescriptionPanel = null;
    };
  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback, galleryVersion, account, hasEnoughGems]);

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
      {lockModalState.open && (
        <LockPanelModal
          panelId={lockModalState.panelId}
          open={lockModalState.open}
          onClose={() => setLockModalState({ open: false, panelId: '' })}
          onLockSuccess={reloadGallery}
        />
      )}
    </>
  );
};

export default NftGallery;