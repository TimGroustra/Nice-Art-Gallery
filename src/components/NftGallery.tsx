import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource, NftAttribute } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';
import { createGifTexture } from '@/utils/gifTexture';
import { MarketBrowserRefined } from './MarketBrowserRefined';

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
  setTargetedPanel: (panel: { wallName: string, updateContent: (source: NftSource) => void } | null) => void;
}

interface DynamicPanelConfig {
  wallName: string;
  position: [number, number, number];
  rotation: [number, number, number];
}

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

const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible, setTargetedPanel }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const [marketBrowserState, setMarketBrowserState] = useState({ open: false, collection: "", tokenId: "" });
  const currentTargetedPanelRef = useRef<Panel | null>(null);

  const manageVideoPlayback = useCallback((shouldPlay: boolean) => {
    panelsRef.current.forEach(panel => {
        if (panel.videoElement) {
            if (shouldPlay && (window as any).galleryControls?.isLocked?.()) {
                panel.videoElement.play().catch(e => console.warn("Video playback prevented:", e));
            } else {
                panel.videoElement.pause();
            }
        }
    });
  }, []);

  const isVideoContent = (contentType: string, url: string) => !!(contentType.startsWith('video/') || url.match(/\.(mp4|webm|ogg)(\?|$)/i));
  const isGifContent = (contentType: string, url: string) => !!(contentType === "image/gif" || url.match(/\.gif(\?|$)/i));

  const disposeTextureSafely = (mesh: THREE.Mesh) => {
    if (mesh.material instanceof THREE.MeshBasicMaterial && mesh.material.map) {
      mesh.material.map.dispose();
      mesh.material.map = null;
    }
  };

  const loadTexture = useCallback(async (url: string, panel: Panel, contentType: string): Promise<THREE.Texture> => {
    if (panel.videoElement) {
        panel.videoElement.pause();
        panel.videoElement.removeAttribute('src');
        panel.videoElement = null;
    }
    if (panel.gifStopFunction) {
        panel.gifStopFunction();
        panel.gifStopFunction = null;
    }

    if (isVideoContent(contentType, url)) {
      return new Promise(resolve => {
        let videoEl = panel.videoElement || document.createElement('video');
        videoEl.playsInline = true;
        videoEl.autoplay = true;
        videoEl.loop = true;
        videoEl.muted = true;
        videoEl.crossOrigin = 'anonymous';
        panel.videoElement = videoEl;
        videoEl.src = url;
        videoEl.load();
        if ((window as any).galleryControls?.isLocked?.()) videoEl.play().catch(e => console.warn("Video playback prevented:", e));
        const videoTexture = new THREE.VideoTexture(videoEl);
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        resolve(videoTexture);
      });
    }
    
    if (isGifContent(contentType, url)) {
        try {
            const { texture, stop } = await createGifTexture(url);
            panel.gifStopFunction = stop;
            return texture;
        } catch (error) {
            console.error("Failed to load GIF, falling back to static image:", error);
        }
    }
    
    return new Promise((resolve, reject) => {
        new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, resolve, undefined, reject);
    });
  }, []);

  const updatePanelContent = useCallback(async (panel: Panel, source: NftSource | null) => {
    const collectionName = GALLERY_PANEL_CONFIG[panel.wallName]?.name || '...';
    disposeTextureSafely(panel.wallTitleMesh);
    const { texture: wallTitleTexture } = createTextTexture(collectionName, 8, 0.75, 120, 'white');
    (panel.wallTitleMesh.material as THREE.MeshBasicMaterial).map = wallTitleTexture;
    panel.wallTitleMesh.visible = true;

    disposeTextureSafely(panel.mesh);
    (panel.mesh.material as THREE.MeshBasicMaterial).color.setHex(0x333333);
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
    
    if (!source || source.contractAddress === "") return;

    const metadata = await getCachedNftMetadata(source.contractAddress, source.tokenId);
    
    if (!metadata) {
        console.warn(`Metadata fetch failed for ${panel.wallName}.`);
        disposeTextureSafely(panel.mesh);
        const { texture: errorTexture } = createTextTexture("NFT Unavailable", 2, 2, 80, 'red');
        (panel.mesh.material as THREE.MeshBasicMaterial).map = errorTexture;
        return;
    }

    try {
      const texture = await loadTexture(metadata.contentUrl, panel, metadata.contentType);
      disposeTextureSafely(panel.mesh);
      (panel.mesh.material as THREE.MeshBasicMaterial).map = texture;
      (panel.mesh.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);

      panel.metadataUrl = metadata.source;
      panel.isVideo = isVideoContent(metadata.contentType, metadata.contentUrl);
      panel.isGif = isGifContent(metadata.contentType, metadata.contentUrl);

      disposeTextureSafely(panel.titleMesh);
      const { texture: titleTexture } = createTextTexture(metadata.title, 4.0, 0.5, 120, 'white');
      (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTexture;
      panel.titleMesh.visible = true;

      disposeTextureSafely(panel.descriptionMesh);
      const { texture: descTexture, totalHeight } = createTextTexture(metadata.description, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, 'lightgray', { wordWrap: true });
      (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = descTexture;
      panel.descriptionMesh.visible = true;
      panel.currentDescription = metadata.description;
      panel.descriptionTextHeight = totalHeight;
      panel.descriptionScrollY = 0;

      disposeTextureSafely(panel.attributesMesh);
      panel.currentAttributes = metadata.attributes || [];
      const { texture: attrTexture } = createAttributesTextTexture(panel.currentAttributes, TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT, 40, 'lightgray');
      (panel.attributesMesh.material as THREE.MeshBasicMaterial).map = attrTexture;
      panel.attributesMesh.visible = true;

    } catch (error) {
      console.error(`Error loading content for ${panel.wallName}:`, error);
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
        const vids = panelsRef.current.filter(p => p.videoElement);
        return vids.length === 0 || vids.every(p => p.videoElement!.muted);
      },
      toggleMute: () => {
        const vids = panelsRef.current.filter(p => p.videoElement);
        if (vids.length > 0) {
          const muted = vids[0].videoElement!.muted;
          vids.forEach(p => { p.videoElement!.muted = !muted; });
        }
      },
      isLocked: () => controls.isLocked,
    };

    controls.addEventListener('lock', () => { setInstructionsVisible(false); manageVideoPlayback(true); });
    controls.addEventListener('unlock', () => { setInstructionsVisible(true); manageVideoPlayback(false); });

    // --- ROOM GEOMETRY AND LIGHTING (abbreviated for brevity) ---
    const ROOM_SIZE = 50, WALL_HEIGHT = 4, BOUNDARY = 24.5;
    const ROOM_SEGMENT_SIZE = 10;
    const NUM_SEGMENTS = 5;
    const halfRoomSize = ROOM_SIZE / 2;
    const segmentGeometry = new THREE.PlaneGeometry(ROOM_SEGMENT_SIZE, ROOM_SEGMENT_SIZE);
    const outerFloorMaterial = new THREE.MeshPhongMaterial({ color: 0xF5F5F5, side: THREE.DoubleSide });
    for (let i = 0; i < NUM_SEGMENTS; i++) for (let j = 0; j < NUM_SEGMENTS; j++) {
        const x = (i - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;
        const z = (j - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;
        const floor = new THREE.Mesh(segmentGeometry, outerFloorMaterial);
        floor.rotation.x = Math.PI / 2;
        floor.position.set(x, 0, z);
        scene.add(floor);
        const ceiling = new THREE.Mesh(segmentGeometry, new THREE.MeshPhongMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(x, WALL_HEIGHT, z);
        scene.add(ceiling);
    }
    new THREE.TextureLoader().load('/floor.jpg', (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(NUM_SEGMENTS, NUM_SEGMENTS);
        const innerFloor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), new THREE.MeshPhongMaterial({ map: texture, side: THREE.DoubleSide }));
        innerFloor.rotation.x = Math.PI / 2;
        innerFloor.position.y = 0.01;
        scene.add(innerFloor);
    });
    const innerWallMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });
    const innerWallSegmentGeometry = new THREE.PlaneGeometry(ROOM_SEGMENT_SIZE, WALL_HEIGHT);
    const segmentCenters = [-20, -10, 0, 10, 20];
    segmentCenters.forEach(center => {
        const north = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        north.position.set(center, WALL_HEIGHT / 2, -halfRoomSize); scene.add(north);
        const south = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        south.rotation.y = Math.PI; south.position.set(center, WALL_HEIGHT / 2, halfRoomSize); scene.add(south);
        const east = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        east.rotation.y = -Math.PI / 2; east.position.set(halfRoomSize, WALL_HEIGHT / 2, center); scene.add(east);
        const west = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        west.rotation.y = Math.PI / 2; west.position.set(-halfRoomSize, WALL_HEIGHT / 2, center); scene.add(west);
    });
    const innerInnerSegmentCenters = [-10, 0, 10];
    innerInnerSegmentCenters.forEach(center => {
        if (center === 0) return;
        const north = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        north.position.set(center, WALL_HEIGHT / 2, -15); scene.add(north);
        const south = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        south.rotation.y = Math.PI; south.position.set(center, WALL_HEIGHT / 2, 15); scene.add(south);
        const east = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        east.rotation.y = -Math.PI / 2; east.position.set(15, WALL_HEIGHT / 2, center); scene.add(east);
        const west = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        west.rotation.y = Math.PI / 2; west.position.set(-15, WALL_HEIGHT / 2, center); scene.add(west);
    });
    [0].forEach(center => {
        const north = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        north.position.set(center, WALL_HEIGHT / 2, -5); scene.add(north);
        const south = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        south.rotation.y = Math.PI; south.position.set(center, WALL_HEIGHT / 2, 5); scene.add(south);
        const east = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        east.rotation.y = -Math.PI / 2; east.position.set(5, WALL_HEIGHT / 2, center); scene.add(east);
        const west = new THREE.Mesh(innerWallSegmentGeometry, innerWallMaterial.clone());
        west.rotation.y = Math.PI / 2; west.position.set(-5, WALL_HEIGHT / 2, center); scene.add(west);
    });
    scene.add(new THREE.AmbientLight(0x404050, 0.5));

    let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
    const velocity = new THREE.Vector3(), direction = new THREE.Vector3(), speed = 20.0;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') moveForward = true; if (e.code === 'KeyA') moveLeft = true;
      if (e.code === 'KeyS') moveBackward = true; if (e.code === 'KeyD') moveRight = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') moveForward = false; if (e.code === 'KeyA') moveLeft = false;
      if (e.code === 'KeyS') moveBackward = false; if (e.code === 'KeyD') moveRight = false;
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);

    const onDocumentMouseDown = () => {
      if (!controls.isLocked) return;
      if (currentTargetedArrow) {
        const panel = panelsRef.current.find(p => p.prevArrow === currentTargetedArrow || p.nextArrow === currentTargetedArrow);
        if (panel && updatePanelIndex(panel.wallName, currentTargetedArrow === panel.nextArrow ? 'next' : 'prev')) {
          updatePanelContent(panel, getCurrentNftSource(panel.wallName));
        }
      } else if (currentTargetedPanelRef.current) {
        const source = getCurrentNftSource(currentTargetedPanelRef.current.wallName);
        if (source) {
          setMarketBrowserState({ open: true, collection: source.contractAddress, tokenId: String(source.tokenId) });
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
      panel.descriptionScrollY = Math.max(0, Math.min(panel.descriptionScrollY + scrollAmount, maxScroll));
      disposeTextureSafely(panel.descriptionMesh);
      const { texture } = createTextTexture(panel.currentDescription, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, 'lightgray', { wordWrap: true, scrollY: panel.descriptionScrollY });
      (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = texture;
    };
    document.addEventListener('wheel', onDocumentWheel);

    let prevTime = performance.now();
    const animate = () => {
      requestAnimationFrame(animate);
      const time = performance.now(), delta = (time - prevTime) / 1000;
      if (controls.isLocked) {
        velocity.x -= velocity.x * 10 * delta; velocity.z -= velocity.z * 10 * delta;
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
        });
        
        let newTargetedPanel: Panel | null = null;
        currentTargetedArrow = null;
        currentTargetedDescriptionPanel = null;

        if (intersects.length > 0 && intersects[0].distance < 5) {
          const mesh = intersects[0].object as THREE.Mesh;
          const panel = panelsRef.current.find(p => p.mesh === mesh || p.prevArrow === mesh || p.nextArrow === mesh || p.descriptionMesh === mesh);
          if (panel) {
            if (mesh === panel.mesh) newTargetedPanel = panel;
            else if (mesh === panel.prevArrow || mesh === panel.nextArrow) {
              currentTargetedArrow = mesh;
              (mesh.material as THREE.MeshBasicMaterial).color.setHex(0x00ff00);
            } else if (mesh === panel.descriptionMesh) {
              currentTargetedDescriptionPanel = panel;
            }
          }
        }
        
        if (currentTargetedPanelRef.current !== newTargetedPanel) {
            currentTargetedPanelRef.current = newTargetedPanel;
            setTargetedPanel(newTargetedPanel ? {
                wallName: String(newTargetedPanel.wallName),
                updateContent: (source) => updatePanelContent(newTargetedPanel!, source)
            } : null);
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

    const setupAndRenderGallery = async () => {
      await initializeGalleryConfig();

      const panelGeometry = new THREE.PlaneGeometry(2, 2);
      const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
      const arrowShape = new THREE.Shape();
      arrowShape.moveTo(0, 0.15); arrowShape.lineTo(0.3, 0); arrowShape.lineTo(0, -0.15);
      const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
      const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
      const ARROW_DEPTH_OFFSET = 0.15, ARROW_PANEL_OFFSET = 1.5, TEXT_DEPTH_OFFSET = 0.16;
      const createTextPanelMaterial = () => new THREE.MeshBasicMaterial({ map: null, transparent: true, side: THREE.DoubleSide, alphaTest: 0.01, depthWrite: false });
      const titleGeometry = new THREE.PlaneGeometry(4.0, TITLE_HEIGHT);
      const descriptionGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT);
      const attributesGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT);
      const wallTitleGeometry = new THREE.PlaneGeometry(8, 0.75);
      const PANEL_Y_POSITION = 1.8;

      const dynamicPanelConfigs: DynamicPanelConfig[] = Object.entries(GALLERY_PANEL_CONFIG).map(([wallName]) => {
          const parts = wallName.split('-');
          const wallDir = parts[0];
          const segmentIndex = parseInt(parts[parts.length - 1], 10);
          let x = 0, z = 0, rotY = 0;
          const segmentCenter = (segmentIndex - 2) * 10;

          if (wallName.includes('center')) {
              if (wallDir === 'north') { z = -5; rotY = Math.PI; }
              if (wallDir === 'south') { z = 5; rotY = 0; }
              if (wallDir === 'east') { x = 5; rotY = Math.PI / 2; }
              if (wallDir === 'west') { x = -5; rotY = -Math.PI / 2; }
          } else if (wallName.includes('inner')) {
              const innerSegmentCenter = (segmentIndex === 0 ? -10 : 10);
              if (wallDir === 'north') { x = innerSegmentCenter; z = -15; rotY = parts.includes('outer') ? Math.PI : 0; }
              if (wallDir === 'south') { x = innerSegmentCenter; z = 15; rotY = parts.includes('outer') ? 0 : Math.PI; }
              if (wallDir === 'east') { z = innerSegmentCenter; x = 15; rotY = parts.includes('outer') ? Math.PI / 2 : -Math.PI / 2; }
              if (wallDir === 'west') { z = innerSegmentCenter; x = -15; rotY = parts.includes('outer') ? -Math.PI / 2 : Math.PI / 2; }
          } else {
              if (wallDir === 'north') { x = segmentCenter; z = -BOUNDARY; rotY = 0; }
              if (wallDir === 'south') { x = segmentCenter; z = BOUNDARY; rotY = Math.PI; }
              if (wallDir === 'east') { z = segmentCenter; x = BOUNDARY; rotY = -Math.PI / 2; }
              if (wallDir === 'west') { z = segmentCenter; x = -BOUNDARY; rotY = Math.PI / 2; }
          }
          
          let posZ = z;
          let posX = x;

          if (rotY === 0) posZ += ARROW_DEPTH_OFFSET;
          else if (rotY === Math.PI) posZ -= ARROW_DEPTH_OFFSET;
          else if (rotY === -Math.PI / 2) posX -= ARROW_DEPTH_OFFSET;
          else if (rotY === Math.PI / 2) posX += ARROW_DEPTH_OFFSET;

          return { wallName, position: [posX, PANEL_Y_POSITION, posZ], rotation: [0, rotY, 0] };
      });

      panelsRef.current = [];
      dynamicPanelConfigs.forEach(config => {
        const mesh = new THREE.Mesh(panelGeometry, panelMaterial.clone());
        mesh.position.set(...config.position);
        mesh.rotation.set(...config.rotation);
        scene.add(mesh);
        
        const wallRotation = new THREE.Euler(...config.rotation, 'XYZ');
        const rightVec = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);
        const upVec = new THREE.Vector3(0, 1, 0).applyEuler(wallRotation);
        const fwdVec = new THREE.Vector3(0, 0, 1).applyEuler(wallRotation);
        const basePos = new THREE.Vector3(...config.position);
        
        const titleMesh = new THREE.Mesh(titleGeometry, createTextPanelMaterial());
        titleMesh.rotation.set(...config.rotation);
        titleMesh.position.copy(basePos.clone().addScaledVector(upVec, -1.35).addScaledVector(fwdVec, TEXT_DEPTH_OFFSET));
        titleMesh.visible = false; scene.add(titleMesh);

        const descriptionMesh = new THREE.Mesh(descriptionGeometry, createTextPanelMaterial());
        descriptionMesh.rotation.set(...config.rotation);
        descriptionMesh.position.copy(basePos.clone().addScaledVector(rightVec, -3.25).addScaledVector(fwdVec, TEXT_DEPTH_OFFSET));
        descriptionMesh.visible = false; scene.add(descriptionMesh);
        
        const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
        prevArrow.rotation.set(config.rotation[0], config.rotation[1] + Math.PI, config.rotation[2]);
        prevArrow.position.copy(basePos.clone().addScaledVector(rightVec, -ARROW_PANEL_OFFSET));
        scene.add(prevArrow);
        
        const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
        nextArrow.rotation.set(...config.rotation);
        nextArrow.position.copy(basePos.clone().addScaledVector(rightVec, ARROW_PANEL_OFFSET));
        scene.add(nextArrow);

        const attributesMesh = new THREE.Mesh(attributesGeometry, createTextPanelMaterial());
        attributesMesh.rotation.set(...config.rotation);
        attributesMesh.position.copy(basePos.clone().addScaledVector(rightVec, 3.25).addScaledVector(fwdVec, TEXT_DEPTH_OFFSET));
        attributesMesh.visible = false; scene.add(attributesMesh);

        const wallTitleMesh = new THREE.Mesh(wallTitleGeometry, createTextPanelMaterial());
        wallTitleMesh.rotation.set(...config.rotation);
        wallTitleMesh.position.copy(new THREE.Vector3(...config.position).setY(3.2));
        wallTitleMesh.visible = false; scene.add(wallTitleMesh);

        panelsRef.current.push({
          mesh, wallName: config.wallName as keyof PanelConfig, metadataUrl: '', isVideo: false, isGif: false, prevArrow, nextArrow, titleMesh, descriptionMesh,
          attributesMesh, wallTitleMesh, currentDescription: '', descriptionScrollY: 0, descriptionTextHeight: 0, currentAttributes: [],
          videoElement: null, gifStopFunction: null,
        });
      });

      for (const panel of panelsRef.current) {
        await updatePanelContent(panel, getCurrentNftSource(panel.wallName));
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };

    setupAndRenderGallery();
    animate();

    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('wheel', onDocumentWheel);
      window.removeEventListener('resize', onWindowResize);
      mountRef.current?.removeChild(renderer.domElement);
      controls.dispose();
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
          else if (obj.material.map) { obj.material.map.dispose(); obj.material.dispose(); }
        }
      });
      renderer.dispose();
    };
  }, [setInstructionsVisible, setTargetedPanel, updatePanelContent, manageVideoPlayback]);

  return (
    <>
      <div ref={mountRef} className="w-full h-full" />
      {marketBrowserState.open && (
        <MarketBrowserRefined
          collection={marketBrowserState.collection}
          tokenId={marketBrowserState.tokenId}
          open={marketBrowserState.open}
          onClose={() => setMarketBrowserState({ ...marketBrowserState, open: false })}
        />
      )}
    </>
  );
};

export default NftGallery;