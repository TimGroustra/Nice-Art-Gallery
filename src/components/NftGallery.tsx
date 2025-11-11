import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { fetchNftMetadata, NftMetadata, NftSource } from '@/utils/nftFetcher';
import { showSuccess, showError, showLoading } from '@/utils/toast';
import { WallSegment } from './WallSegment';
import { GALLERY_LAYOUT } from '@/config/roomLayout';
import { createNftTexture, AnimatedTexture } from '@/utils/textureLoader';

interface NftGalleryProps {
  setInstructionsVisible: (visible: boolean) => void;
}

// Global state for UI interaction
let currentTargetedArrow: THREE.Mesh | null = null;
let currentTargetedScrollPanel: { wallName: keyof PanelConfig; panelId: string; type: 'description' | 'attributes' } | null = null;

const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const wallsRef = useRef<WallSegment[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  const animatedTexturesRef = useRef<Set<AnimatedTexture>>(new Set());
  const panelCleanupMap = useRef<Map<string, () => void>>(new Map());

  const updatePanelContent = useCallback(async (wall: WallSegment, panelId: string, source: NftSource) => {
    // Clean up previous texture/animation for this specific panel
    if (panelCleanupMap.current.has(panelId)) {
        panelCleanupMap.current.get(panelId)!();
        panelCleanupMap.current.delete(panelId);
    }

    showLoading(`Loading NFT ${source.tokenId}...`);
    try {
        const metadata = await fetchNftMetadata(source.contractAddress, source.tokenId);
        const { texture, animatedTexture } = await createNftTexture(metadata.image, videoRef.current!);
        
        if (animatedTexture) {
            animatedTexturesRef.current.add(animatedTexture);
            panelCleanupMap.current.set(panelId, () => {
                animatedTexture.cleanup();
                animatedTexturesRef.current.delete(animatedTexture);
            });
        }
        
        wall.setPanelContent(panelId, texture, metadata);
        showSuccess(`Loaded NFT ${metadata.title}`);
    } catch (error) {
        console.error("Failed to load NFT content:", error);
        showError(`Failed to load NFT #${source.tokenId}.`);
        const { texture } = await createNftTexture('', videoRef.current!); // Load placeholder
        const fallbackMetadata: NftMetadata = { title: `Error loading #${source.tokenId}`, description: `Failed to fetch metadata.`, image: '', source: '', attributes: [] };
        wall.setPanelContent(panelId, texture, fallbackMetadata);
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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    mountRef.current.appendChild(renderer.domElement);

    const controls = new PointerLockControls(camera, renderer.domElement);
    
    (window as any).galleryControls = {
      lockControls: () => controls.lock(),
      isMuted: () => videoRef.current?.muted ?? true,
      toggleMute: () => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; },
      isLocked: () => controls.isLocked,
    };

    controls.addEventListener('lock', () => setInstructionsVisible(false));
    controls.addEventListener('unlock', () => setInstructionsVisible(true));

    const WORLD_SIZE = 100, wallHeight = 4, boundary = WORLD_SIZE / 2 - 0.5;

    const outerFloor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE), new THREE.MeshPhongMaterial({ color: 0xF5F5F5, side: THREE.DoubleSide }));
    outerFloor.rotation.x = Math.PI / 2;
    scene.add(outerFloor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE), new THREE.MeshPhongMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallHeight;
    scene.add(ceiling);

    scene.add(new THREE.AmbientLight(0x404050, 0.8));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, wallHeight, 0);
    scene.add(hemiLight);

    const interactiveMeshes: THREE.Mesh[] = [];
    wallsRef.current = [];

    GALLERY_LAYOUT.forEach(config => {
      const ws = new WallSegment({ 
        wallName: config.wallName, 
        width: 10,
        height: wallHeight, 
        panelDescriptors: config.panelDescriptors 
      });
      
      ws.group.position.set(...config.position);
      ws.group.rotation.y = config.rotationY;
      scene.add(ws.group);
      wallsRef.current.push(ws);
      interactiveMeshes.push(...ws.interactiveMeshes);
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

    const onDocumentMouseDown = () => {
      if (!controls.isLocked || !currentTargetedArrow) return;
      
      const wallName = (currentTargetedArrow.userData as any).wallName as keyof PanelConfig;
      const direction = (currentTargetedArrow.userData as any).direction as 'next' | 'prev';
      
      if (updatePanelIndex(wallName, direction)) {
        const newSource = getCurrentNftSource(wallName);
        if (newSource) {
          const wallsToUpdate = wallsRef.current.filter(w => w.wallName === wallName);
          wallsToUpdate.forEach(wall => {
            if (wall.panels.length > 0) {
              const panelId = wall.panels[0].id;
              updatePanelContent(wall, panelId, newSource);
            }
          });
        }
      }
    };
    document.addEventListener('mousedown', onDocumentMouseDown);

    let prevTime = performance.now();
    const animate = () => {
      requestAnimationFrame(animate);
      const time = performance.now(), delta = (time - prevTime) / 1000;

      animatedTexturesRef.current.forEach(item => {
        item.texture.needsUpdate = true;
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

        wallsRef.current.forEach(w => w.panels.forEach(p => {
          (p.prevArrow.material as THREE.MeshBasicMaterial).color.setHex(0xcccccc);
          (p.nextArrow.material as THREE.MeshBasicMaterial).color.setHex(0xcccccc);
        }));

        currentTargetedArrow = null;
        currentTargetedScrollPanel = null;

        if (intersects.length > 0 && intersects[0].distance < 5) {
          const intersectedMesh = intersects[0].object as THREE.Mesh;
          const { wallName, panelId } = intersectedMesh.userData as { wallName: keyof PanelConfig, panelId: string };
          
          if (wallName && panelId) {
            if (intersectedMesh.userData.direction) {
              currentTargetedArrow = intersectedMesh;
              (intersectedMesh.material as THREE.MeshBasicMaterial).color.setHex(0x00ff00);
            } else if (intersectedMesh.name === 'description' || intersectedMesh.name === 'attributes') {
                 currentTargetedScrollPanel = { wallName, panelId, type: intersectedMesh.name };
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

    initializeGalleryConfig().then(() => {
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
      window.removeEventListener('resize', onWindowResize);
      mountRef.current?.removeChild(renderer.domElement);
      controls.dispose();
      
      panelCleanupMap.current.forEach(cleanup => cleanup());
      panelCleanupMap.current.clear();
      animatedTexturesRef.current.clear();

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
      currentTargetedArrow = null;
      currentTargetedScrollPanel = null;
    };
  }, [setInstructionsVisible, updatePanelContent]);

  return (
    <>
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted loop />
      <div ref={mountRef} className="w-full h-full" />
    </>
  );
};

export default NftGallery;