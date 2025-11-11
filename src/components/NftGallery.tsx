import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { fetchNftMetadata, NftMetadata, NftSource } from '@/utils/nftFetcher';
import { showSuccess, showError, showLoading } from '@/utils/toast';
import { WallSegment, createTextTexture, createAttributesTextTexture } from './WallSegment';
import { GALLERY_LAYOUT } from '@/config/roomLayout';
import { createNftTexture, AnimatedTexture } from '@/utils/textureLoader'; // Import new loader and type

// Define types for the targeted panel data passed to the UI
export interface TargetedPanelInfo {
  wallName: keyof PanelConfig;
  panelId: string;
  collectionName: string;
  tokenId: number;
}

interface NftGalleryProps {
  setInstructionsVisible: (visible: boolean) => void;
}

// Global state for UI interaction (now tracking interaction targets for scrolling)
let currentTargetedPanel: { wallName: keyof PanelConfig; panelId: string } | null = null;
let currentTargetedArrow: THREE.Mesh | null = null;
let currentTargetedScrollPanel: { wallName: keyof PanelConfig; panelId: string; type: 'description' | 'attributes' } | null = null;

const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const wallsRef = useRef<WallSegment[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animatedTexturesRef = useRef<AnimatedTexture[]>([]); // Ref to track GIF textures
  const [isLocked, setIsLocked] = useState(false);

  const manageVideoPlayback = useCallback((shouldPlay: boolean) => {
    if (videoRef.current) {
      if (shouldPlay) {
        // Only attempt to play if controls are locked
        const controlsLocked = (window as any).galleryControls?.isLocked?.() ?? false;
        if (controlsLocked) {
          // Play is handled by the texture loader now, but we ensure it's playing if locked
          videoRef.current.play().catch(e => console.warn("Video playback prevented:", e));
        }
      } else {
        videoRef.current.pause();
      }
    }
  }, []);

  // Cleanup function for all animated textures (GIFs)
  const cleanupAnimatedTextures = useCallback(() => {
    animatedTexturesRef.current.forEach(at => at.cleanup());
    animatedTexturesRef.current = [];
  }, []);


  const updatePanelContent = useCallback(async (wall: WallSegment, panelId: string, source: NftSource) => {
    showLoading(`Loading NFT ${source.tokenId}...`); 
    
    // 1. Clean up old animated texture for this panel if it exists
    const panel = wall.panels.find(p => p.id === panelId);
    if (panel && panel.animatedTexture) {
      panel.animatedTexture.cleanup();
      animatedTexturesRef.current = animatedTexturesRef.current.filter(at => at !== panel.animatedTexture);
      panel.animatedTexture = undefined;
    }

    try {
        const metadata = await fetchNftMetadata(source.contractAddress, source.tokenId);
        
        if (!videoRef.current) throw new Error("Video element not ready.");

        // 2. Load new texture using the robust loader
        const { texture, animatedTexture } = await createNftTexture(metadata.image, videoRef.current);
        
        // 3. Update panel content and store animated texture reference
        wall.setPanelMetadataById(panelId, metadata, texture);
        
        if (animatedTexture) {
          panel!.animatedTexture = animatedTexture;
          animatedTexturesRef.current.push(animatedTexture);
        }

        showSuccess(`Loaded NFT ${metadata.title}`);
    } catch (error) {
        console.error("Failed to load NFT content:", error);
        showError(`Failed to load NFT #${source.tokenId}.`);
        
        // Fallback to placeholder texture if metadata fetch fails
        const { texture } = await createNftTexture('', videoRef.current!); // Pass empty string to get placeholder
        wall.setPanelMetadataById(panelId, {
            title: `Error loading #${source.tokenId}`,
            description: `Failed to fetch metadata.`,
            image: '', 
            source: '',
            attributes: [],
        }, texture);
    } finally {
        // No toast to dismiss
    }
  }, []);


  useEffect(() => {
    if (!mountRef.current) return;

    RectAreaLightUniformsLib.init();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaaaaaa);
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 4.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; 
    
    mountRef.current.appendChild(renderer.domElement);

    const controls = new PointerLockControls(camera, renderer.domElement);
    
    // Helper to check if any video is present across all walls
    const hasVideo = () => videoRef.current && videoRef.current.src && !videoRef.current.paused;

    (window as any).galleryControls = {
      lockControls: () => controls.lock(),
      hasVideo: hasVideo,
      isMuted: () => videoRef.current?.muted ?? true,
      toggleMute: () => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; },
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

    const roomSize = 10, wallHeight = 4, boundary = roomSize / 2 - 0.5;

    // --- Scene Setup (Floors/Ceiling/Lights) ---
    const outerFloorMaterial = new THREE.MeshPhongMaterial({ color: 0xF5F5F5, side: THREE.DoubleSide });
    const outerFloor = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), outerFloorMaterial);
    outerFloor.rotation.x = Math.PI / 2;
    scene.add(outerFloor);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('/floor.jpg', (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace; // Use SRGB for floor image
      
      const padding = 1.0;
      const maxInnerSize = roomSize - 2 * padding;
      const imageAspect = texture.image.width / texture.image.height;
      let innerPlaneWidth, innerPlaneHeight;
      if (imageAspect >= 1) {
        innerPlaneWidth = maxInnerSize;
        innerPlaneHeight = maxInnerSize / imageAspect;
      } else {
        innerPlaneHeight = maxInnerSize;
        innerPlaneWidth = maxInnerSize * imageAspect;
      }
      const innerFloorGeometry = new THREE.PlaneGeometry(innerPlaneWidth, innerPlaneHeight);
      const innerFloorMaterial = new THREE.MeshPhongMaterial({ map: texture, side: THREE.DoubleSide });
      const innerFloor = new THREE.Mesh(innerFloorGeometry, innerFloorMaterial);
      innerFloor.rotation.x = Math.PI / 2;
      innerFloor.position.y = 0.01;
      scene.add(innerFloor);
    });

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), new THREE.MeshPhongMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallHeight;
    scene.add(ceiling);

    scene.add(new THREE.AmbientLight(0x404050, 0.8));
    
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, wallHeight, 0);
    scene.add(hemiLight);

    const lights: THREE.PointLight[] = [];
    const NUM_DISCO_LIGHTS = 3, discoLightHeight = 2.5, lightColors = [0xff0066, 0x00ffd5, 0xffff00];
    for (let i = 0; i < NUM_DISCO_LIGHTS; i++) {
      const pl = new THREE.PointLight(lightColors[i], 0.8, 15, 2);
      pl.position.set(Math.cos(i / NUM_DISCO_LIGHTS * Math.PI * 2) * 3, discoLightHeight, Math.sin(i / NUM_DISCO_LIGHTS * Math.PI * 2) * 3);
      scene.add(pl);
      lights.push(pl);
    }

    // --- Build Modular Walls using GALLERY_LAYOUT ---
    const interactiveMeshes: THREE.Mesh[] = [];
    wallsRef.current = []; 

    GALLERY_LAYOUT.forEach(config => {
      const ws = new WallSegment({ 
        wallName: config.wallName, 
        width: roomSize, 
        height: wallHeight, 
        panelDescriptors: config.panelDescriptors 
      });
      
      ws.group.position.set(...config.position);
      ws.group.rotation.y = config.rotationY;
      scene.add(ws.group);
      wallsRef.current.push(ws);
      interactiveMeshes.push(...ws.interactiveMeshes);

      // Initial content load for all panels in this wall
      config.panelDescriptors.forEach(panelDesc => {
        const source = getCurrentNftSource(config.wallName);
        if (source) {
          updatePanelContent(ws, panelDesc.id, source);
        }
      });
    });

    // --- Movement and Interaction Setup ---
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
        const wallName = (currentTargetedArrow.userData as any).wallName as keyof PanelConfig;
        const panelId = (currentTargetedArrow.userData as any).panelId as string;
        const direction = (currentTargetedArrow.userData as any).direction as 'next' | 'prev';
        
        if (updatePanelIndex(wallName, direction)) {
          const newSource = getCurrentNftSource(wallName);
          const wall = wallsRef.current.find(w => w.wallName === wallName);
          if (newSource && wall) {
            updatePanelContent(wall, panelId, newSource);
          }
        }
      }
    };
    document.addEventListener('mousedown', onDocumentMouseDown);

    // Constants for text panel dimensions (matching WallSegment.tsx)
    const TEXT_PANEL_WIDTH = 2.25; 
    const TEXT_PANEL_HEIGHT = 1.8;
    const TEXT_FONT_SIZE_DESC = 28;
    const TEXT_FONT_SIZE_ATTR = 30; 
    
    const updateScrollTexture = (wallName: keyof PanelConfig, panelId: string, type: 'description' | 'attributes') => {
      const wall = wallsRef.current.find(w => w.wallName === wallName);
      if (!wall) return;
      const panel = wall.panels.find(p => p.id === panelId);
      if (!panel) return;

      if (type === 'description') {
        if (panel.descriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.descriptionMesh.material.map) {
          panel.descriptionMesh.material.map.dispose();
        }
        const { texture } = createTextTexture(
          panel.currentDescription, 
          TEXT_PANEL_WIDTH, 
          TEXT_PANEL_HEIGHT, 
          TEXT_FONT_SIZE_DESC, 
          'lightgray', 
          { wordWrap: true, scrollY: panel.descriptionScrollY }
        );
        (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = texture;
      } else if (type === 'attributes') {
        if (panel.attributesMesh.material instanceof THREE.MeshBasicMaterial && panel.attributesMesh.material.map) {
          panel.attributesMesh.material.map.dispose();
        }
        const { texture } = createAttributesTextTexture(
          panel.currentAttributes, 
          TEXT_PANEL_WIDTH, 
          TEXT_PANEL_HEIGHT, 
          TEXT_FONT_SIZE_ATTR, 
          'lightgray', 
          { scrollY: panel.attributesScrollY }
        );
        (panel.attributesMesh.material as THREE.MeshBasicMaterial).map = texture;
      }
    };

    const onDocumentWheel = (event: WheelEvent) => {
      if (!controls.isLocked || !currentTargetedScrollPanel) return;
      const { wallName, panelId, type } = currentTargetedScrollPanel;
      const wall = wallsRef.current.find(w => w.wallName === wallName);
      if (!wall) return;
      const panel = wall.panels.find(p => p.id === panelId);
      if (!panel) return;

      const scrollAmount = event.deltaY * 0.5;
      const canvasHeight = 512; // Fixed canvas height used in createTextTexture
      const padding = 40; // Fixed padding used in createTextTexture
      const effectiveViewportHeight = canvasHeight - 2 * padding;

      if (type === 'description') {
        const maxScroll = Math.max(0, panel.descriptionTextHeight - effectiveViewportHeight);
        let newScrollY = panel.descriptionScrollY + scrollAmount;
        newScrollY = Math.max(0, Math.min(newScrollY, maxScroll));

        if (panel.descriptionScrollY !== newScrollY) {
          panel.descriptionScrollY = newScrollY;
          updateScrollTexture(wallName, panelId, type);
        }
      } else if (type === 'attributes') {
        const maxScroll = Math.max(0, panel.attributesTextHeight - effectiveViewportHeight);
        let newScrollY = panel.attributesScrollY + scrollAmount;
        newScrollY = Math.max(0, Math.min(newScrollY, maxScroll));

        if (panel.attributesScrollY !== newScrollY) {
          panel.attributesScrollY = newScrollY;
          updateScrollTexture(wallName, panelId, type);
        }
      }
    };
    document.addEventListener('wheel', onDocumentWheel);

    let prevTime = performance.now();
    const animate = () => {
      requestAnimationFrame(animate);
      const time = performance.now(), delta = (time - prevTime) / 1000;

      lights.forEach((light, i) => {
        const angle = time * 0.0005 + i * (Math.PI * 2 / NUM_DISCO_LIGHTS);
        light.position.x = Math.cos(angle) * 3;
        light.position.z = Math.sin(angle) * 3;
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
        camera.position.y = 1.6;
        camera.position.x = Math.max(-boundary, Math.min(boundary, camera.position.x));
        camera.position.z = Math.max(-boundary, Math.min(boundary, camera.position.z));

        raycaster.setFromCamera(center, camera);
        const intersects = raycaster.intersectObjects(interactiveMeshes);

        // Reset arrow colors and targeted info
        wallsRef.current.forEach(w => w.panels.forEach(p => {
          (p.prevArrow.material as THREE.MeshBasicMaterial).color.setHex(0xcccccc);
          (p.nextArrow.material as THREE.MeshBasicMaterial).color.setHex(0xcccccc);
        }));

        currentTargetedPanel = null;
        currentTargetedArrow = null;
        currentTargetedScrollPanel = null;

        if (intersects.length > 0 && intersects[0].distance < 5) {
          const intersectedMesh = intersects[0].object as THREE.Mesh;
          const { wallName, panelId } = intersectedMesh.userData as { wallName: keyof PanelConfig, panelId: string };
          
          if (wallName && panelId) {
            
            if (intersectedMesh.userData.direction) { // Arrow
              currentTargetedArrow = intersectedMesh;
              (intersectedMesh.material as THREE.MeshBasicMaterial).color.setHex(0x00ff00);
            } else if (intersectedMesh.name === 'nft-panel') { // Panel (mesh)
              currentTargetedPanel = { wallName, panelId };
            }
            
            if (intersectedMesh.name === 'description') {
                 currentTargetedScrollPanel = { wallName, panelId, type: 'description' };
            } else if (intersectedMesh.name === 'attributes') {
                 currentTargetedScrollPanel = { wallName, panelId, type: 'attributes' };
            }
          }
        }
      }

      // Update GIF textures
      animatedTexturesRef.current.forEach(at => {
        at.texture.needsUpdate = true;
      });

      prevTime = time;
      renderer.render(scene, camera);
    };

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onWindowResize);

    // initialize config and refresh
    initializeGalleryConfig().then(() => {
      // Re-run content loading after config is initialized to get correct names/supplies
      wallsRef.current.forEach(w => {
        w.panels.forEach(p => {
          const source = getCurrentNftSource(w.wallName);
          if (source) updatePanelContent(w, p.id, source);
        });
      });
    });

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
          else { if ((obj.material as any).map) (obj.material as any).map.dispose(); (obj.material as any).dispose(); }
        }
      });
      renderer.dispose();
      wallsRef.current.forEach(w => w.dispose());
      
      // Cleanup all animated textures (GIFs)
      cleanupAnimatedTextures();

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
      delete (window as any).galleryControls;
      currentTargetedPanel = null;
      currentTargetedArrow = null;
      currentTargetedScrollPanel = null;
    };
  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback, cleanupAnimatedTextures]);

  return (
    <>
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
      <div ref={mountRef} className="w-full h-full" />
    </>
  );
};

export default NftGallery;