import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { fetchNftMetadata, normalizeUrl, NftMetadata, NftSource } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';

// Define types for the panel objects
interface Panel {
  mesh: THREE.Mesh;
  wallName: keyof PanelConfig;
  metadataUrl: string;
  isVideo: boolean;
}

interface NftGalleryProps {
  onPanelClick: (metadataUrl: string) => void;
  setInstructionsVisible: (visible: boolean) => void;
}

const NftGallery: React.FC<NftGalleryProps> = ({ onPanelClick, setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // We keep isLocked state, but we must ensure it doesn't trigger the main useEffect re-run via dependencies.
  const [isLocked, setIsLocked] = useState(false); 

  // Function to manage video playback based on lock state
  // This function is stable and only depends on videoRef.current
  const manageVideoPlayback = useCallback((shouldPlay: boolean) => {
    if (videoRef.current) {
      if (shouldPlay) {
        // Only attempt to play if controls are locked (user interaction context exists)
        videoRef.current.play().catch(e => {
          // This catch handles the "The user has exited the lock" error gracefully
          console.warn("Video playback prevented or failed:", e);
        });
      } else {
        videoRef.current.pause();
      }
    }
  }, []);


  // --- Utility Functions for Three.js Content Management ---

  // loadTexture should not depend on isLocked, as playback is managed externally by manageVideoPlayback
  const loadTexture = useCallback((url: string, isVideo: boolean = false): THREE.Texture | THREE.VideoTexture => {
    if (isVideo) {
      if (videoRef.current) {
        // Prepare video element
        videoRef.current.pause();
        videoRef.current.src = url;
        videoRef.current.load();
        videoRef.current.loop = true;
        videoRef.current.muted = true; // Always start muted
        
        // We rely on the lock/unlock event handlers in useEffect to call manageVideoPlayback(true/false)
        // If controls are already locked, we manually trigger playback here too, but we must ensure manageVideoPlayback is stable.
        // Since manageVideoPlayback is stable, we can call it.
        if ((window as any).galleryControls?.isLocked()) {
             manageVideoPlayback(true);
        }

        return new THREE.VideoTexture(videoRef.current);
      }
      // Fallback if video element is not ready
      return new THREE.TextureLoader().load(url);
    }
    return new THREE.TextureLoader().load(url, 
      () => {}, // on load
      undefined, // on progress
      (error) => {
        console.error('Error loading texture:', url, error);
        showError(`Failed to load image: ${url.substring(0, 50)}...`);
      }
    );
  }, [manageVideoPlayback]); // Only depends on stable manageVideoPlayback

  const updatePanelContent = useCallback(async (panel: Panel, source: NftSource) => {
    try {
      const metadata: NftMetadata = await fetchNftMetadata(source.contractAddress, source.tokenId);
      
      const imageUrl = metadata.image;
      const isVideo = imageUrl.endsWith('.mp4') || imageUrl.endsWith('.webm') || imageUrl.endsWith('.ogg');
      
      // If the new content is a video, we need to ensure any currently playing video is paused first
      if (isVideo && videoRef.current) {
        manageVideoPlayback(false);
      }

      const texture = loadTexture(imageUrl, isVideo);
      
      // Dispose of old material/texture
      if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
        panel.mesh.material.map?.dispose();
        panel.mesh.material.dispose();
      }

      panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture });
      panel.metadataUrl = metadata.source;
      panel.isVideo = isVideo;

      if (isVideo) {
        showSuccess(`Loaded video NFT: ${metadata.title}`);
      } else {
        showSuccess(`Loaded image NFT: ${metadata.title}`);
      }
      
    } catch (error) {
      console.error(`Error updating panel ${panel.wallName}:`, error);
      showError(`Failed to load NFT for ${panel.wallName}.`);
      
      // Fallback to placeholder
      if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
        panel.mesh.material.map?.dispose();
        panel.mesh.material.dispose();
      }
      panel.mesh.material = new THREE.MeshBasicMaterial({ color: 0x333333 });
      panel.metadataUrl = '';
      panel.isVideo = false;
    }
  }, [loadTexture, manageVideoPlayback]);

  // --- Three.js Setup Effect ---

  useEffect(() => {
    if (!mountRef.current) return;

    // 1. Setup Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaaaaaa);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 4.5); // Start position adjusted from Z=5 to Z=4.5

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    // 2. Controls (PointerLockControls)
    const controls = new PointerLockControls(camera, renderer.domElement);
    
    controls.addEventListener('lock', () => {
      setIsLocked(true);
      setInstructionsVisible(false);
      // Start video playback when locked
      if (panelsRef.current.some(p => p.isVideo)) {
        manageVideoPlayback(true);
      }
    });
    controls.addEventListener('unlock', () => {
      setIsLocked(false);
      setInstructionsVisible(true);
      // Pause video playback when unlocked
      manageVideoPlayback(false);
    });

    // Expose controls for UI interaction (locking/unlocking)
    (window as any).galleryControls = {
      lockControls: () => controls.lock(),
      hasVideo: () => panelsRef.current.some(p => p.isVideo),
      isMuted: () => videoRef.current?.muted ?? true,
      toggleMute: () => {
        if (videoRef.current) {
          videoRef.current.muted = !videoRef.current.muted;
        }
      },
      isLocked: () => controls.isLocked, // Added utility to check lock status
    };

    // 3. Geometry: Floor, Ceiling, Walls
    const roomSize = 10;
    const wallHeight = 4;

    // Floor (Green)
    const floorGeometry = new THREE.PlaneGeometry(roomSize, roomSize);
    const floorMaterial = new THREE.MeshPhongMaterial({ color: 0x222222, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);

    // Ceiling (White)
    const ceilingGeometry = new THREE.PlaneGeometry(roomSize, roomSize);
    const ceilingMaterial = new THREE.MeshPhongMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallHeight;
    scene.add(ceiling);

    // Walls (Grey)
    const wallMaterial = new THREE.MeshPhongMaterial({ color: 0x444444, side: THREE.DoubleSide });
    
    // North Wall (-Z)
    const northWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), wallMaterial);
    northWall.position.set(0, wallHeight / 2, -roomSize / 2);
    scene.add(northWall);

    // South Wall (+Z)
    const southWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), wallMaterial);
    southWall.rotation.y = Math.PI;
    southWall.position.set(0, wallHeight / 2, roomSize / 2);
    scene.add(southWall);

    // East Wall (+X)
    const eastWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), wallMaterial);
    eastWall.rotation.y = -Math.PI / 2;
    eastWall.position.set(roomSize / 2, wallHeight / 2, 0);
    scene.add(eastWall);

    // West Wall (-X)
    const westWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), wallMaterial);
    westWall.rotation.y = Math.PI / 2;
    westWall.position.set(-roomSize / 2, wallHeight / 2, 0);
    scene.add(westWall);

    // 4. Lights
    const lights: THREE.PointLight[] = [];
    const NUM_DISCO_LIGHTS = 3;
    const discoLightHeight = 2.5;
    const lightColors = [0xff0066, 0x00ffd5, 0xffff00];

    for (let i = 0; i < NUM_DISCO_LIGHTS; i++) {
      const color = lightColors[i];
      const initialX = Math.cos(i / NUM_DISCO_LIGHTS * Math.PI * 2) * 3;
      const initialZ = Math.sin(i / NUM_DISCO_LIGHTS * Math.PI * 2) * 3;

      const pl = new THREE.PointLight(color, 1.2, 15, 2);
      pl.position.set(initialX, discoLightHeight, initialZ);
      scene.add(pl);
      lights.push(pl);
    }
    const amb = new THREE.AmbientLight(0x404050, 0.6);
    scene.add(amb);

    // 5. Setup initial panels
    const panelGeometry = new THREE.PlaneGeometry(2, 2);
    const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
    
    const panelConfigs: { wallName: keyof PanelConfig, position: [number, number, number], rotation: [number, number, number] }[] = [
      { wallName: 'north-wall', position: [0, wallHeight / 2, -roomSize / 2 + 0.01], rotation: [0, 0, 0] },
      { wallName: 'south-wall', position: [0, wallHeight / 2, roomSize / 2 - 0.01], rotation: [0, Math.PI, 0] },
      { wallName: 'east-wall', position: [roomSize / 2 - 0.01, wallHeight / 2, 0], rotation: [0, -Math.PI / 2, 0] },
      { wallName: 'west-wall', position: [-roomSize / 2 + 0.01, wallHeight / 2, 0], rotation: [0, Math.PI / 2, 0] },
    ];

    panelConfigs.forEach(config => {
      const mesh = new THREE.Mesh(panelGeometry, panelMaterial.clone());
      mesh.position.set(config.position[0], config.position[1], config.position[2]);
      mesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      scene.add(mesh);

      const panel: Panel = {
        mesh,
        wallName: config.wallName,
        metadataUrl: '',
        isVideo: false,
      };
      panelsRef.current.push(panel);
      
      // Load initial content
      const source = getCurrentNftSource(config.wallName);
      if (source) {
        updatePanelContent(panel, source);
      }
    });

    // 6. Interaction (Raycasting)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!controls.isLocked) return; // Use controls.isLocked directly

      // Calculate mouse position in normalized device coordinates (-1 to +1)
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(panelsRef.current.map(p => p.mesh));

      if (intersects.length > 0) {
        const intersectedMesh = intersects[0].object as THREE.Mesh;
        const panel = panelsRef.current.find(p => p.mesh === intersectedMesh);

        if (panel) {
          // Check if the click is near the center (to open metadata) or near the edges (to cycle)
          const intersectionPoint = intersects[0].point;
          const localPoint = intersectedMesh.worldToLocal(intersectionPoint.clone());
          
          const isNearEdge = Math.abs(localPoint.x) > 0.8 || Math.abs(localPoint.y) > 0.8;

          if (isNearEdge) {
            // Cycle NFT
            const direction = localPoint.x > 0 ? 'next' : 'prev';
            const updated = updatePanelIndex(panel.wallName, direction);
            
            if (updated) {
              const newSource = getCurrentNftSource(panel.wallName);
              if (newSource) {
                updatePanelContent(panel, newSource);
              }
            }
          } else {
            // Open Metadata Modal
            if (panel.metadataUrl) {
              onPanelClick(panel.metadataUrl);
            }
          }
        }
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown, false);

    // 7. Animation Loop
    let lastTime = 0;
    const animate = (time: number) => {
      requestAnimationFrame(animate);

      const delta = (time - lastTime) / 1000;
      lastTime = time;

      // Disco light animation
      lights.forEach((light, index) => {
        const angle = time * 0.0005 + index * (Math.PI * 2 / NUM_DISCO_LIGHTS);
        light.position.x = Math.cos(angle) * 3;
        light.position.z = Math.sin(angle) * 3;
      });

      renderer.render(scene, camera);
    };

    // 8. Handle Resize
    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', onWindowResize);

    // 9. Initialization
    initializeGalleryConfig().then(() => {
      // Re-load content after config is initialized (especially for Panth.art)
      panelsRef.current.forEach(panel => {
        const source = getCurrentNftSource(panel.wallName);
        if (source) {
          updatePanelContent(panel, source);
        }
      });
    });

    animate(0);

    // 10. Cleanup
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown, false);
      window.removeEventListener('resize', onWindowResize);
      mountRef.current?.removeChild(renderer.domElement);
      controls.dispose();
      
      // Dispose of Three.js objects to prevent memory leaks
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      renderer.dispose();
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
      delete (window as any).galleryControls;
    };
  }, [onPanelClick, setInstructionsVisible, updatePanelContent, manageVideoPlayback]);

  return (
    <>
      {/* Hidden video element for Three.js VideoTexture */}
      <video ref={videoRef} style={{ display: 'none' }} playsInline autoPlay muted />
      <div ref={mountRef} className="w-full h-full" />
    </>
  );
};

export default NftGallery;