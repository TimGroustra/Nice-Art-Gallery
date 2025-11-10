import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex } from '@/config/galleryConfig';
import { fetchNftMetadata, NftMetadata, NftSource } from '@/utils/nftFetcher';
import { RectAreaLightHelper } from 'three-stdlib'; // Import helper for RectAreaLight

// Define a type for interactive meshes (Panel or Arrow)
interface InteractiveMesh extends THREE.Mesh {
  userData: {
    wallName: keyof typeof GALLERY_PANEL_CONFIG;
    type: 'panel' | 'arrow-prev' | 'arrow-next';
    nftSource?: NftSource;
    loaded?: boolean;
    metadata?: NftMetadata;
    videoElement?: HTMLVideoElement;
    // New properties for panel mesh to hold arrow references
    arrowPrev?: InteractiveMesh;
    arrowNext?: InteractiveMesh;
  };
}

interface NftGalleryProps {
  onPanelClick: (metadataUrl: string) => void;
  setInstructionsVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

const NftGallery: React.FC<NftGalleryProps> = ({ onPanelClick, setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const interactiveMeshesRef = useRef<InteractiveMesh[]>([]);
  const panelMeshesRef = useRef<InteractiveMesh[]>([]); // Only the main NFT panels
  const raycasterRef = useRef(new THREE.Raycaster());
  const clockRef = useRef(new THREE.Clock());
  const moveStateRef = useRef({ forward: 0, backward: 0, left: 0, right: 0 });
  const speed = 4.0;

  const selectedPanelRef = useRef<InteractiveMesh | null>(null);
  const [selectedVideoMuted, setSelectedVideoMuted] = useState(true);
  
  // State to force re-render of the gallery when an NFT changes (e.g., arrow click)
  const [galleryKey, setGalleryKey] = useState(0); 

  // Define max dimensions for the large panels
  const PANEL_W = 6.0;
  const PANEL_H = 3.0;
  const ARROW_SIZE = 0.5;
  const ARROW_PADDING = 0.2; // Padding between panel edge and arrow

  // Define room boundaries (slightly inside the walls at +/- 8)
  const BOUNDARY = 7.5; 

  // Utility to check if a URL points to a video file
  const isVideoUrl = (url: string): boolean => {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.webm') || lowerUrl.endsWith('.ogg');
  };

  // Helper to remove a mesh and clean up resources
  const removeMesh = useCallback((mesh: InteractiveMesh) => {
    if (mesh.userData.videoElement) {
      mesh.userData.videoElement.pause();
      mesh.userData.videoElement.remove();
    }
    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    
    // Remove from tracking arrays
    interactiveMeshesRef.current = interactiveMeshesRef.current.filter(m => m !== mesh);
    panelMeshesRef.current = panelMeshesRef.current.filter(m => m !== mesh);
    
    if (selectedPanelRef.current === mesh) {
      selectedPanelRef.current = null;
      setSelectedVideoMuted(true);
    }
  }, []);

  // --- Panel Logic ---

  const updateArrowPositions = useCallback((panelMesh: InteractiveMesh, newW: number) => {
    const { wallName, arrowPrev, arrowNext } = panelMesh.userData;
    if (!arrowPrev || !arrowNext) return;

    const arrowOffset = newW / 2 + ARROW_PADDING + ARROW_SIZE / 2; // Distance from center of panel to center of arrow
    const arrowY = panelMesh.position.y;
    const arrowZOffset = 0.01; 
    const rotationY = panelMesh.rotation.y;

    let prevPos = new THREE.Vector3();
    let nextPos = new THREE.Vector3();

    if (wallName === 'east-wall' || wallName === 'west-wall') {
      // East/West walls: Z is the horizontal axis
      prevPos.set(panelMesh.position.x, arrowY, panelMesh.position.z - arrowOffset);
      nextPos.set(panelMesh.position.x, arrowY, panelMesh.position.z + arrowOffset);
      
      // Adjust X position slightly forward based on rotation
      const forwardDir = new THREE.Vector3(Math.cos(rotationY - Math.PI / 2), 0, Math.sin(rotationY - Math.PI / 2));
      prevPos.add(forwardDir.multiplyScalar(arrowZOffset));
      nextPos.add(forwardDir.multiplyScalar(arrowZOffset));

    } else {
      // North/South walls: X is the horizontal axis
      prevPos.set(panelMesh.position.x - arrowOffset, arrowY, panelMesh.position.z);
      nextPos.set(panelMesh.position.x + arrowOffset, arrowY, panelMesh.position.z);
      
      // Adjust Z position slightly forward based on rotation
      const forwardDir = new THREE.Vector3(Math.sin(rotationY), 0, Math.cos(rotationY));
      prevPos.add(forwardDir.multiplyScalar(arrowZOffset));
      nextPos.add(forwardDir.multiplyScalar(arrowZOffset));
    }

    arrowPrev.position.copy(prevPos);
    arrowNext.position.copy(nextPos);

  }, [ARROW_PADDING, ARROW_SIZE]);


  const applyTextureToMesh = useCallback((mesh: InteractiveMesh, texture: THREE.Texture, imageAspect: number, metadata: NftMetadata, videoElement?: HTMLVideoElement) => {
    
    let newW = PANEL_W;
    let newH = PANEL_H;

    // Determine new dimensions based on constraints
    if (imageAspect > PANEL_W / PANEL_H) {
      // Image is wider than the max frame aspect ratio (constrained by PANEL_W)
      newH = PANEL_W / imageAspect;
    } else {
      // Image is taller than the max frame aspect ratio (constrained by PANEL_H)
      newW = PANEL_H * imageAspect;
    }

    // Update Geometry
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(newW, newH);
    
    // Apply Texture
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.map = texture;
    material.needsUpdate = true;
    
    mesh.userData.loaded = true;
    mesh.userData.metadata = metadata;
    
    if (videoElement) {
      mesh.userData.videoElement = videoElement;
    }

    // IMPORTANT: Update arrow positions based on the new calculated width (newW)
    updateArrowPositions(mesh, newW);

  }, [PANEL_W, PANEL_H, updateArrowPositions]);


  const fetchAndApplyToMesh = useCallback(async (wallName: keyof typeof GALLERY_PANEL_CONFIG, mesh: InteractiveMesh) => {
    const nftSource = getCurrentNftSource(wallName);
    if (!nftSource) {
      console.warn(`No NFT source found for wall: ${wallName}`);
      removeMesh(mesh);
      return;
    }
    
    const { contractAddress, tokenId } = nftSource;
    const identifier = `${contractAddress}/${tokenId}`;
    
    // Clean up previous video element if it exists
    if (mesh.userData.videoElement) {
      mesh.userData.videoElement.pause();
      mesh.userData.videoElement.remove();
      delete mesh.userData.videoElement;
    }

    mesh.userData.nftSource = nftSource;
    mesh.userData.loaded = false;
    // Use a slightly brighter material initially so spotlights work well
    mesh.material = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0x000000, side: THREE.DoubleSide });
    (mesh.material as THREE.MeshStandardMaterial).needsUpdate = true;

    try {
      // 1. Fetch metadata
      const metadata = await fetchNftMetadata(contractAddress, tokenId);
      
      let mediaUrl = metadata.image;
      if (!mediaUrl) throw new Error('No media URL found in metadata');

      const isVideo = isVideoUrl(mediaUrl);

      if (isVideo) {
        // Handle Video
        const video = document.createElement('video');
        video.src = mediaUrl;
        video.loop = true;
        video.muted = true; // Muted is required for autoplay in most browsers
        video.autoplay = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.style.display = 'none'; // Keep it hidden
        document.body.appendChild(video);

        // Wait for video metadata to load to get dimensions
        video.onloadedmetadata = () => {
          const texture = new THREE.VideoTexture(video);
          texture.colorSpace = THREE.SRGBColorSpace;
          const imageAspect = video.videoWidth / video.videoHeight;
          
          applyTextureToMesh(mesh, texture, imageAspect, metadata, video);
          video.play().catch(e => console.warn("Video autoplay failed:", e));
        };
        
        // Handle cleanup if loading fails or component unmounts
        video.onerror = (e) => {
          console.warn('Video load error for:', mediaUrl, e);
          document.body.removeChild(video);
          removeMesh(mesh); // Remove mesh on video load failure
        };

      } else {
        // Handle Image
        const loader = new THREE.TextureLoader();
        loader.crossOrigin = '';
        loader.load(mediaUrl,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            const imageAspect = tex.image.width / tex.image.height;
            applyTextureToMesh(mesh, tex, imageAspect, metadata);
          },
          (xhr) => {
            // console.log((xhr.loaded / xhr.total * 100) + '% loaded');
          },
          (err) => {
            console.warn('Texture load error for:', identifier, err);
            removeMesh(mesh); // Remove mesh on texture load failure
          }
        );
      }

    } catch (err) {
      console.warn('fetchAndApplyToMesh error for:', identifier, err);
      // If fetch fails, keep the placeholder material but mark as loaded
      mesh.userData.loaded = true;
      mesh.userData.metadata = { title: 'Error', description: 'Failed to load NFT', image: '', source: '' };
      
      // If loading fails, we still need to position the arrows based on the default size
      updateArrowPositions(mesh, PANEL_W);
    }
  }, [PANEL_W, removeMesh, updateArrowPositions, applyTextureToMesh]);

  const createArrowMesh = useCallback((wallName: keyof typeof GALLERY_PANEL_CONFIG, type: 'arrow-prev' | 'arrow-next', position: THREE.Vector3, rotationY: number, scene: THREE.Scene) => {
    
    // Create a simple triangle shape pointing right (default orientation)
    const shape = new THREE.Shape();
    const halfSize = ARROW_SIZE / 2;
    
    // Define triangle vertices (pointing right: X increases)
    shape.moveTo(-halfSize, halfSize);
    shape.lineTo(halfSize, 0);
    shape.lineTo(-halfSize, -halfSize);
    shape.lineTo(-halfSize, halfSize);

    const geo = new THREE.ShapeGeometry(shape);
    
    // Use a consistent, grey, slightly emissive material
    const mat = new THREE.MeshStandardMaterial({ 
      color: 0xaaaaaa, // Grey color
      emissive: 0xaaaaaa,
      emissiveIntensity: 0.3,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    
    // Fix TS2352: Convert to unknown first
    const mesh = new THREE.Mesh(geo, mat) as unknown as InteractiveMesh;
    mesh.position.copy(position);
    
    let finalRotationY = rotationY;
    
    if (wallName === 'north-wall' || wallName === 'south-wall') {
      // North/South walls: Arrows point horizontally (left/right)
      if (type === 'arrow-prev') {
        // Rotate 180 degrees to point left
        mesh.rotation.z = Math.PI; 
      }
      // Apply wall rotation around Y axis
      finalRotationY = rotationY;
    } else {
      // East/West walls: Arrows point vertically (up/down relative to the viewer)
      
      // Rotate the shape 90 degrees clockwise (to point 'up' relative to the wall)
      mesh.rotation.z = -Math.PI / 2; 
      
      if (type === 'arrow-prev') {
        // If 'prev', rotate 180 degrees from 'up' position (to point 'down')
        mesh.rotation.z += Math.PI; 
      }
      
      // Apply wall rotation around Y axis
      finalRotationY = rotationY;
    }
    
    mesh.rotation.y = finalRotationY;

    mesh.userData = { wallName, type };
    scene.add(mesh);
    interactiveMeshesRef.current.push(mesh);
    return mesh;
  }, [ARROW_SIZE]);


  const createPanel = useCallback((scene: THREE.Scene, wallName: keyof typeof GALLERY_PANEL_CONFIG, position: THREE.Vector3, rotationY: number) => {
    
    const config = GALLERY_PANEL_CONFIG[wallName];
    if (config.contractAddress.startsWith('0xPlaceholder')) {
      // Skip rendering this panel if it uses a placeholder address
      return null;
    }

    // 1. Create Main Panel (Use default size initially)
    const geo = new THREE.PlaneGeometry(PANEL_W, PANEL_H); 
    const mat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0x000000, side: THREE.DoubleSide });
    // Fix TS2352: Convert to unknown first
    const mesh = new THREE.Mesh(geo, mat) as unknown as InteractiveMesh;
    mesh.position.copy(position);
    mesh.rotation.y = rotationY;
    mesh.userData = { wallName, type: 'panel' };
    scene.add(mesh);
    interactiveMeshesRef.current.push(mesh);
    panelMeshesRef.current.push(mesh);
    
    // 2. Create Arrows (Position them temporarily, they will be updated in applyTextureToMesh)
    // We use a large temporary offset so they don't overlap the panel before loading
    const tempOffset = PANEL_W / 2 + 2.0; 
    const arrowY = position.y;
    const arrowZOffset = 0.01; 

    let prevPos = new THREE.Vector3();
    let nextPos = new THREE.Vector3();

    if (wallName === 'east-wall' || wallName === 'west-wall') {
      prevPos.set(position.x, arrowY, position.z - tempOffset);
      nextPos.set(position.x, arrowY, position.z + tempOffset);
    } else {
      prevPos.set(position.x - tempOffset, arrowY, position.z);
      nextPos.set(position.x + tempOffset, arrowY, position.z);
    }
    
    // Adjust Z/X position slightly forward based on rotation (using the same logic as before)
    const forwardDir = new THREE.Vector3(Math.sin(rotationY), 0, Math.cos(rotationY));
    if (wallName === 'east-wall' || wallName === 'west-wall') {
      forwardDir.set(Math.cos(rotationY - Math.PI / 2), 0, Math.sin(rotationY - Math.PI / 2));
    }
    prevPos.add(forwardDir.clone().multiplyScalar(arrowZOffset));
    nextPos.add(forwardDir.clone().multiplyScalar(arrowZOffset));


    const arrowPrev = createArrowMesh(wallName, 'arrow-prev', prevPos, rotationY, scene);
    const arrowNext = createArrowMesh(wallName, 'arrow-next', nextPos, rotationY, scene);
    
    // Store references on the panel mesh
    mesh.userData.arrowPrev = arrowPrev;
    mesh.userData.arrowNext = arrowNext;

    // 3. Fetch and apply initial NFT (This will trigger the final arrow positioning)
    fetchAndApplyToMesh(wallName, mesh);
    
    return mesh;
  }, [fetchAndApplyToMesh, PANEL_W, PANEL_H, createArrowMesh]);

  const setupPanels = useCallback((scene: THREE.Scene) => {
    // Clear existing and clean up video elements
    interactiveMeshesRef.current.forEach(m => removeMesh(m));
    interactiveMeshesRef.current.length = 0;
    panelMeshesRef.current.length = 0;

    const panelY = 1.8;
    const wallOffset = 7.89;
    
    // 1. East Wall (Right wall, X = 7.89, Rot = PI/2)
    createPanel(scene, 'east-wall', new THREE.Vector3(wallOffset, panelY, 0), Math.PI / 2);
    
    // 2. West Wall (Left wall, X = -7.89, Rot = -PI/2)
    createPanel(scene, 'west-wall', new THREE.Vector3(-wallOffset, panelY, 0), -Math.PI / 2);

    // 3. South Wall (Back wall, Z = -7.89, Rot = 0)
    createPanel(scene, 'south-wall', new THREE.Vector3(0, panelY, -wallOffset), 0);

    // 4. North Wall (Front wall, Z = 7.89, Rot = PI)
    createPanel(scene, 'north-wall', new THREE.Vector3(0, panelY, wallOffset), Math.PI);

  }, [createPanel, removeMesh]);

  // --- Core Three.js Setup ---

  useEffect(() => {
    if (!mountRef.current) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050205);

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 1.6, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    // RectAreaLight requires WebGLRenderer.physicallyCorrectLights = true
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountRef.current.appendChild(renderer.domElement);

    // Controls
    const controls = new PointerLockControls(camera, renderer.domElement);
    controlsRef.current = controls;

    controls.addEventListener('lock', () => setInstructionsVisible(false));
    controls.addEventListener('unlock', () => setInstructionsVisible(true));

    // --- Scene Elements (Floor, Walls, Lighting - kept mostly the same) ---

    // Floor
    const floorGeo = new THREE.CircleGeometry(8, 64);
    const floorMat = new THREE.MeshPhysicalMaterial({ 
      color: 0x111111, 
      metalness: 0.9, 
      roughness: 0.1, 
      reflectivity: 0.5,
      clearcoat: 0.5,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Walls
    const room = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.6 }); 
    const wallThickness = 0.2;
    function makeWall(w: number, h: number, d: number, x: number, z: number, ry = 0) {
      const g = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(g, wallMat);
      m.position.set(x, h / 2, z);
      m.rotation.y = ry;
      room.add(m);
    }
    makeWall(16, 4, wallThickness, 0, -8); // back
    makeWall(16, 4, wallThickness, 0, 8);  // front
    makeWall(wallThickness, 4, 16, -8, 0); // left
    makeWall(wallThickness, 4, 16, 8, 0);  // right
    
    // Ceiling
    const ceilingGeo = new THREE.CircleGeometry(8, 64);
    const ceilingMat = new THREE.MeshPhysicalMaterial({ 
      color: 0x111111, 
      metalness: 0.9, 
      roughness: 0.1, 
      reflectivity: 0.5,
      clearcoat: 0.5,
      side: THREE.DoubleSide 
    });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.position.y = 4; 
    ceiling.rotation.x = Math.PI / 2;
    room.add(ceiling);
    
    scene.add(room);

    // Lighting
    
    // 1. Ambient Light (low intensity)
    const amb = new THREE.AmbientLight(0xaaaaaa, 0.5); 
    scene.add(amb);

    // 2. Ceiling Border Downlighting (RectAreaLight) - Main white light
    const lightWidth = 15.8; 
    const lightHeight = 15.8; 
    const lightIntensity = 10; 
    const lightColor = 0xffffff;
    const lightY = 3.9; 

    const rectLight = new THREE.RectAreaLight(lightColor, lightIntensity, lightWidth, lightHeight);
    rectLight.position.set(0, lightY, 0);
    rectLight.rotation.x = -Math.PI / 2; // Pointing down
    scene.add(rectLight);

    // 3. Disco Lights (Increased count and varied patterns)
    const NUM_DISCO_LIGHTS = 20;
    const discoLights: THREE.PointLight[] = [];
    const discoLightHeight = 3.8; 
    const maxRadius = 7.5; // Use full radius

    // Pre-calculate random properties for each light
    const lightProperties = Array.from({ length: NUM_DISCO_LIGHTS }, () => {
      // Calculate initial position using polar coordinates for even spread
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * maxRadius; // Random radius up to max
      
      return {
        color: Math.random() * 0xffffff,
        radius: radius, // Use this as the base radius for movement
        speedFactor: 0.0005 + Math.random() * 0.0005,
        phaseOffset: Math.random() * Math.PI * 2,
        verticalSpeed: 0.0001 + Math.random() * 0.0001,
        verticalOffset: Math.random() * Math.PI * 2,
        initialX: Math.cos(angle) * radius,
        initialZ: Math.sin(angle) * radius,
      };
    });
    
    for (let i = 0; i < NUM_DISCO_LIGHTS; i++) {
      const props = lightProperties[i];
      // Increased intensity and distance significantly to fill the space
      const pl = new THREE.PointLight(props.color, 5.0, 20, 1.5); 
      // Set initial position based on pre-calculated spread
      pl.position.set(props.initialX, discoLightHeight, props.initialZ); 
      scene.add(pl);
      discoLights.push(pl);
    }
    
    // Setup initial panels
    setupPanels(scene);

    // --- Event Handlers ---

    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': moveStateRef.current.forward = 1; break;
        case 'KeyS': moveStateRef.current.backward = 1; break;
        case 'KeyA': moveStateRef.current.left = 1; break;
        case 'KeyD': moveStateRef.current.right = 1; break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': moveStateRef.current.forward = 0; break;
        case 'KeyS': moveStateRef.current.backward = 0; break;
        case 'KeyA': moveStateRef.current.left = 0; break;
        case 'KeyD': moveStateRef.current.right = 0; break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onWindowResize);

    const onDocumentClick = () => {
      if (controls.isLocked === false) return;

      raycasterRef.current.setFromCamera(new THREE.Vector2(0, 0), camera);
      // Check all interactive meshes (panels and arrows)
      const intersects = raycasterRef.current.intersectObjects(interactiveMeshesRef.current, false);

      if (intersects.length > 0) {
        const mesh = intersects[0].object as InteractiveMesh;
        const { type, wallName } = mesh.userData;

        if (type === 'panel') {
          // Handle Panel Click (Open Metadata Modal)
          const metaSourceUrl = mesh.userData.metadata?.source;
          
          // Toggle video play/pause/mute
          if (mesh.userData.videoElement) {
            const video = mesh.userData.videoElement;
            if (video.paused) {
              video.play().catch(e => console.warn("Video play failed on click:", e));
            } else {
              video.pause();
            }
            setSelectedVideoMuted(video.muted);
          } else {
            setSelectedVideoMuted(true);
          }

          if (metaSourceUrl) {
            onPanelClick(metaSourceUrl);
          }
        } else if (type === 'arrow-next' || type === 'arrow-prev') {
          // Handle Arrow Click (Cycle NFT)
          const direction = type === 'arrow-next' ? 'next' : 'prev';
          const panelMesh = panelMeshesRef.current.find(p => p.userData.wallName === wallName);
          
          if (panelMesh) {
            const changed = updatePanelIndex(wallName, direction);
            if (changed) {
              // Re-fetch and apply new NFT media to the panel
              fetchAndApplyToMesh(wallName, panelMesh);
              // Force a state update to refresh UI controls (mute button)
              setGalleryKey(k => k + 1); 
            }
          }
        }
      }
    };
    document.addEventListener('click', onDocumentClick);

    // --- Animation Loop ---

    const animate = () => {
      requestAnimationFrame(animate);
      const delta = clockRef.current.getDelta();
      
      const time = performance.now();

      // Update disco lights rotate and move
      for (let i = 0; i < discoLights.length; i++) {
        const pl = discoLights[i];
        const props = lightProperties[i];
        
        const angle = time * props.speedFactor + props.phaseOffset;
        
        // Horizontal movement: Oscillate around the initial spread position
        // We use the initial position (props.initialX/Z) as the center of oscillation
        // and props.radius (which is up to 7.5) to define the oscillation magnitude.
        const oscillationMagnitude = 1.5; // Max distance the light moves from its initial point
        
        pl.position.x = props.initialX + Math.cos(angle) * oscillationMagnitude;
        pl.position.z = props.initialZ + Math.sin(angle * 0.8) * oscillationMagnitude; 
        
        // Vertical movement (subtle bobbing)
        pl.position.y = discoLightHeight + Math.sin(time * props.verticalSpeed + props.verticalOffset) * 0.1;
      }

      // Movement
      if (controls.isLocked) {
        const previousPosition = camera.position.clone();

        const direction = new THREE.Vector3();
        direction.z = moveStateRef.current.forward - moveStateRef.current.backward;
        direction.x = moveStateRef.current.right - moveStateRef.current.left;
        direction.normalize();

        controls.moveForward(direction.z * speed * delta);
        controls.moveRight(direction.x * speed * delta);

        // Boundary Check
        if (camera.position.x > BOUNDARY || camera.position.x < -BOUNDARY) {
          camera.position.x = previousPosition.x;
        }
        if (camera.position.z > BOUNDARY || camera.position.z < -BOUNDARY) {
          camera.position.z = previousPosition.z;
        }

        // Raycast for highlighting/selection
        raycasterRef.current.setFromCamera(new THREE.Vector2(0, 0), camera);
        // Highlight only the main panels, not the arrows
        const intersects = raycasterRef.current.intersectObjects(panelMeshesRef.current, false);

        if (intersects.length > 0) {
          const mesh = intersects[0].object as InteractiveMesh;
          if (selectedPanelRef.current !== mesh) {
            if (selectedPanelRef.current) {
              (selectedPanelRef.current.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
            }
            (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x101010);
            selectedPanelRef.current = mesh;
            
            // Update UI state based on new selection
            if (mesh.userData.videoElement) {
              setSelectedVideoMuted(mesh.userData.videoElement.muted);
            } else {
              setSelectedVideoMuted(true); 
            }
          }
        } else {
          if (selectedPanelRef.current) {
            (selectedPanelRef.current.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
            selectedPanelRef.current = null;
            setSelectedVideoMuted(true); 
          }
        }
      }

      // Update video textures
      panelMeshesRef.current.forEach(mesh => {
        if (mesh.userData.videoElement && mesh.material instanceof THREE.MeshStandardMaterial && mesh.material.map instanceof THREE.VideoTexture) {
          mesh.material.map.needsUpdate = true;
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    // --- Cleanup ---
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onWindowResize);
      document.removeEventListener('click', onDocumentClick);
      
      // Clean up video elements and meshes
      interactiveMeshesRef.current.forEach(m => removeMesh(m));

      mountRef.current?.removeChild(renderer.domElement);
      controls.dispose();
      renderer.dispose();
    };
  }, [onPanelClick, setupPanels, fetchAndApplyToMesh, setInstructionsVisible, removeMesh, galleryKey]); // Added galleryKey dependency to trigger re-setup if needed, though setupPanels is only called once.

  // Function to toggle mute state of the currently selected video
  const toggleMute = useCallback(() => {
    const video = selectedPanelRef.current?.userData.videoElement;
    if (video) {
      const newMutedState = !video.muted;
      video.muted = newMutedState;
      setSelectedVideoMuted(newMutedState);
    }
  }, []);

  // Pass imperative functions up to the parent component
  useEffect(() => {
    (window as any).galleryControls = {
      getSelectedPanelUrl: () => selectedPanelRef.current?.userData.metadata?.source || '',
      lockControls: () => controlsRef.current?.lock(),
      toggleMute: toggleMute,
      isMuted: () => selectedVideoMuted,
      hasVideo: () => !!selectedPanelRef.current?.userData.videoElement,
    };
  }, [toggleMute, selectedVideoMuted]);


  return (
    <div ref={mountRef} className="fixed inset-0 z-0" />
  );
};

export default NftGallery;