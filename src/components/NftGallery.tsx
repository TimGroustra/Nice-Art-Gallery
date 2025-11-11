import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { fetchNftMetadata, NftMetadata, NftSource } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';
import { WallSegment, createTextTexture } from './WallSegment';
import { GALLERY_LAYOUT } from '@/config/roomLayout';

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

// Global state for UI interaction (now only tracking interaction targets)
let currentTargetedPanel: { wallName: keyof PanelConfig; panelId: string } | null = null;
let currentTargetedArrow: THREE.Mesh | null = null;
let currentTargetedDescriptionPanel: { wallName: keyof PanelConfig; panelId: string } | null = null;

const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const wallsRef = useRef<WallSegment[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const manageVideoPlayback = useCallback((shouldPlay: boolean) => {
    if (videoRef.current) {
      if (shouldPlay) {
        const controlsLocked = (window as any).galleryControls?.isLocked?.() ?? false;
        if (controlsLocked) {
          videoRef.current.play().catch(e => console.warn("Video playback prevented:", e));
        }
      } else {
        videoRef.current.pause();
      }
    }
  }, []);

  const loadTexture = useCallback((url: string, isVideo: boolean = false): THREE.Texture | THREE.VideoTexture => {
    if (!url) {
      // Return a simple placeholder texture if URL is empty
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, 1, 1);
      }
      return new THREE.CanvasTexture(canvas);
    }
    
    if (isVideo) {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = url;
        videoRef.current.load();
        videoRef.current.loop = true;
        videoRef.current.muted = true;
        if ((window as any).galleryControls?.isLocked?.()) {
          manageVideoPlayback(true);
        }
        return new THREE.VideoTexture(videoRef.current);
      }
      return new THREE.TextureLoader().load(url);
    }
    
    return new THREE.TextureLoader().load(url, () => {}, undefined, (error) => {
      console.error('Error loading texture:', url, error);
      showError(`Failed to load image: ${url ? url.substring(0, 50) : 'unknown' }...`);
      
      // Create a placeholder texture on error
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = 'white';
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Error', 128, 128);
      }
      const errorTexture = new THREE.CanvasTexture(canvas);
      
      // This texture will be returned by the loader's error callback, 
      // but the original function call already returned the loader instance.
      // We rely on the WallSegment's updateContent to handle the material update.
      // Since the loader failed, the material map will remain null/placeholder until the next update.
      // For now, we rely on the error message to debug.
    });
  }, [manageVideoPlayback]);

  const updatePanelContent = useCallback(async (wall: WallSegment, panelId: string, source: NftSource) => {
    try {
      const metadata: NftMetadata = await fetchNftMetadata(source.contractAddress, source.tokenId);
      const imageUrl = metadata.image;
      const isVideo = typeof imageUrl === 'string' && /\.(mp4|webm|ogg)$/i.test(imageUrl);
      if (isVideo && videoRef.current) manageVideoPlayback(false);
      wall.setPanelMetadataById(panelId, metadata, loadTexture);
      showSuccess(isVideo ? `Loaded video NFT: ${metadata.title}` : `Loaded image NFT: ${metadata.title}`);
    } catch (error) {
      console.error('Error updating panel content', error);
      showError(`Failed to load NFT for ${wall.wallName}/${panelId}`);
      
      // If metadata fetch fails, we should still update the panel with error info
      wall.setPanelMetadataById(panelId, {
        title: `Error loading #${source.tokenId}`,
        description: `Failed to fetch metadata for token ${source.tokenId}.`,
        image: '', // Empty image URL triggers placeholder texture in loadTexture
        source: '',
      }, loadTexture);
    }
  }, [loadTexture, manageVideoPlayback]);

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
    mountRef.current.appendChild(renderer.domElement);

    const controls = new PointerLockControls(camera, renderer.domElement);
    
    // Helper to check if any video is present across all walls
    const hasVideo = () => wallsRef.current.some(w => w.panels.some(p => /\.(mp4|webm|ogg)$/i.test((p.mesh.material as THREE.MeshBasicMaterial)?.map?.image?.currentSrc || '')));

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
      if (hasVideo()) manageVideoPlayback(true);
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

    scene.add(new THREE.AmbientLight(0x404050, 0.3));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.2);
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
    wallsRef.current = []; // Clear previous walls

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

    const updateDescriptionTexture = (wallName: keyof PanelConfig, panelId: string) => {
      const wall = wallsRef.current.find(w => w.wallName === wallName);
      if (!wall) return;
      const panel = wall.panels.find(p => p.id === panelId);
      if (!panel) return;

      if (panel.descriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.descriptionMesh.material.map) {
        panel.descriptionMesh.material.map.dispose();
      }
      const { texture } = createTextTexture(panel.currentDescription, 1.5, 2.0, 40, 'lightgray', { wordWrap: true, scrollY: panel.descriptionScrollY });
      (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = texture;
    };

    const onDocumentWheel = (event: WheelEvent) => {
      if (!controls.isLocked || !currentTargetedDescriptionPanel) return;
      const { wallName, panelId } = currentTargetedDescriptionPanel;
      const wall = wallsRef.current.find(w => w.wallName === wallName);
      if (!wall) return;
      const panel = wall.panels.find(p => p.id === panelId);
      if (!panel) return;

      const scrollAmount = event.deltaY * 0.5;
      const canvasHeight = 512;
      const padding = 40;
      const effectiveViewportHeight = canvasHeight - 2 * padding;
      const maxScroll = Math.max(0, panel.descriptionTextHeight - effectiveViewportHeight);

      let newScrollY = panel.descriptionScrollY + scrollAmount;
      newScrollY = Math.max(0, Math.min(newScrollY, maxScroll));

      if (panel.descriptionScrollY !== newScrollY) {
        panel.descriptionScrollY = newScrollY;
        updateDescriptionTexture(wallName, panelId);
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
        currentTargetedDescriptionPanel = null;

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
                 currentTargetedDescriptionPanel = { wallName, panelId };
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
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
      delete (window as any).galleryControls;
      currentTargetedPanel = null;
      currentTargetedArrow = null;
      currentTargetedDescriptionPanel = null;
    };
  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback]);

  return (
    <>
      <video ref={videoRef} style={{ display: 'none' }} playsInline autoPlay muted />
      <div ref={mountRef} className="w-full h-full" />
    </>
  );
};

export default NftGallery;