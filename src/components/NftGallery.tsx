import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GALLERY_PANEL_CONFIG } from '@/config/galleryConfig';

// Define types for the panel mesh userData
interface PanelMetadata {
  title: string;
  description: string;
  image: string;
  source: string;
}

interface PanelMesh extends THREE.Mesh {
  userData: {
    metadataUrl: string;
    loaded: boolean;
    metadata?: PanelMetadata;
    videoElement?: HTMLVideoElement; // Added for video handling
  };
}

interface NftGalleryProps {
  onPanelClick: (metadataUrl: string) => void;
  setInstructionsVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

// Utility: normalize ipfs:// to https gateway
function normalizeUrl(url: string): string {
  if (!url) return url;
  url = url.trim();
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  return url;
}

// Define position names for mapping
const POSITION_NAMES = ['left-left', 'left-center', 'center-center', 'right-center', 'right-right'];

const NftGallery: React.FC<NftGalleryProps> = ({ onPanelClick, setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const panelMeshesRef = useRef<PanelMesh[]>([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const clockRef = useRef(new THREE.Clock());
  const moveStateRef = useRef({ forward: 0, backward: 0, left: 0, right: 0 });
  const speed = 4.0;

  const selectedPanelRef = useRef<PanelMesh | null>(null);
  const [selectedVideoMuted, setSelectedVideoMuted] = useState(true);

  // Define max dimensions for the panels
  const MAX_W = 1.8;
  const MAX_H = 1.2;

  // Fibonacci sequence F(1) through F(7): 1, 1, 2, 3, 5, 8, 13
  const fib = useRef([1, 1, 2, 3, 5, 8, 13]); 

  // Define room boundaries (slightly inside the walls at +/- 8)
  const BOUNDARY = 7.5; 

  // Utility to check if a URL points to a video file
  const isVideoUrl = (url: string): boolean => {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.webm') || lowerUrl.endsWith('.ogg');
  };

  // --- Panel Logic ---

  const applyTextureToMesh = useCallback((mesh: PanelMesh, texture: THREE.Texture, imageAspect: number, metadataUrl: string, json: any, videoElement?: HTMLVideoElement) => {
    // 1. Calculate Aspect Ratio
    
    let newW = MAX_W;
    let newH = MAX_H;

    // 2. Determine new dimensions based on constraints
    if (imageAspect > MAX_W / MAX_H) {
      // Image is wider than the max frame aspect ratio (constrained by MAX_W)
      newH = MAX_W / imageAspect;
    } else {
      // Image is taller than the max frame aspect ratio (constrained by MAX_H)
      newW = MAX_H * imageAspect;
    }

    // 3. Update Geometry
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(newW, newH);
    
    // 4. Apply Texture
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.map = texture;
    material.needsUpdate = true;
    
    mesh.userData.loaded = true;
    mesh.userData.metadata = {
      title: json.name || '',
      description: json.description || '',
      image: json.image || json.image_url || json.imageURI || json.gif,
      source: metadataUrl
    };
    if (videoElement) {
      mesh.userData.videoElement = videoElement;
    }
  }, [MAX_W, MAX_H]);


  const fetchAndApplyToMesh = useCallback(async (metadataUrl: string, mesh: PanelMesh) => {
    const url = normalizeUrl(metadataUrl);
    mesh.userData.metadataUrl = metadataUrl;
    mesh.userData.loaded = false;
    // Use a slightly brighter material initially so spotlights work well
    mesh.material = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0x000000, side: THREE.DoubleSide });
    (mesh.material as THREE.MeshStandardMaterial).needsUpdate = true;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Metadata fetch failed ' + res.status);
      const json = await res.json();

      let mediaUrl = json.image || json.image_url || json.imageURI || json.gif;
      mediaUrl = normalizeUrl(mediaUrl);
      if (!mediaUrl) throw new Error('No media field in metadata');

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
          
          applyTextureToMesh(mesh, texture, imageAspect, metadataUrl, json, video);
          video.play().catch(e => console.warn("Video autoplay failed:", e));
        };
        
        // Handle cleanup if loading fails or component unmounts
        video.onerror = (e) => {
          console.warn('Video load error for:', mediaUrl, e);
          document.body.removeChild(video);
        };

      } else {
        // Handle Image (including GIFs, which will load as static textures)
        const loader = new THREE.TextureLoader();
        loader.crossOrigin = '';
        loader.load(mediaUrl,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            const imageAspect = tex.image.width / tex.image.height;
            applyTextureToMesh(mesh, tex, imageAspect, metadataUrl, json);
          },
          (xhr) => {
            // console.log((xhr.loaded / xhr.total * 100) + '% loaded');
          },
          (err) => {
            console.warn('Texture load error for:', metadataUrl, err);
          }
        );
      }

    } catch (err) {
      console.warn('fetchAndApplyToMesh error for:', metadataUrl, err);
    }
  }, [MAX_W, MAX_H, applyTextureToMesh]);

  const createPanel = useCallback((scene: THREE.Scene, position: THREE.Vector3, rotationY: number, metadataUrl: string) => {
    // Start with max dimensions, they will be resized upon texture load
    const geo = new THREE.PlaneGeometry(MAX_W, MAX_H); 
    const mat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0x000000, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat) as unknown as PanelMesh;
    mesh.position.copy(position);
    mesh.rotation.y = rotationY;
    mesh.userData = { metadataUrl: metadataUrl, loaded: false };
    scene.add(mesh);
    panelMeshesRef.current.push(mesh);
    if (metadataUrl) fetchAndApplyToMesh(metadataUrl, mesh);
    return mesh;
  }, [fetchAndApplyToMesh, MAX_W, MAX_H]);

  const setupPanels = useCallback((scene: THREE.Scene) => {
    // Clear existing and clean up video elements
    panelMeshesRef.current.forEach(m => {
      if (m.userData.videoElement) {
        m.userData.videoElement.pause();
        m.userData.videoElement.remove();
      }
      scene.remove(m);
    });
    panelMeshesRef.current.length = 0;

    const panelCenters = [-6, -3, 0, 3, 6]; // 5 positions
    const panelY = 1.8;
    
    // Helper to get URL based on wall name and index (0-4)
    const getUrl = (wallName: string, index: number) => {
      let positionKey: string;
      
      // East and South walls iterate from Left-to-Right relative to the wall face.
      if (wallName === 'east-wall' || wallName === 'south-wall') {
        positionKey = POSITION_NAMES[index];
      } 
      // West and North walls iterate from Right-to-Left relative to the wall face (due to coordinate system).
      else { 
        positionKey = POSITION_NAMES[4 - index]; // Reverse index mapping
      }
      
      const key = `${wallName}-${positionKey}`;
      return GALLERY_PANEL_CONFIG[key] || '';
    };

    // 1. East Wall (Right wall, X = 7.89, Rot = PI/2)
    panelCenters.forEach((z, index) => {
      const pos = new THREE.Vector3(7.89, panelY, z);
      const rot = Math.PI / 2; // face -x
      createPanel(scene, pos, rot, getUrl('east-wall', index));
    });
    
    // 2. West Wall (Left wall, X = -7.89, Rot = -PI/2)
    panelCenters.forEach((z, index) => {
      const pos = new THREE.Vector3(-7.89, panelY, z);
      const rot = -Math.PI / 2; // face +x
      createPanel(scene, pos, rot, getUrl('west-wall', index));
    });

    // 3. South Wall (Back wall, Z = -7.89, Rot = 0)
    panelCenters.forEach((x, index) => {
      const pos = new THREE.Vector3(x, panelY, -7.89);
      const rot = 0; // face +z
      createPanel(scene, pos, rot, getUrl('south-wall', index));
    });

    // 4. North Wall (Front wall, Z = 7.89, Rot = PI)
    panelCenters.forEach((x, index) => {
      const pos = new THREE.Vector3(x, panelY, 7.89);
      const rot = Math.PI; // face -z
      createPanel(scene, pos, rot, getUrl('north-wall', index));
    });

  }, [createPanel]);

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountRef.current.appendChild(renderer.domElement);

    // Controls
    const controls = new PointerLockControls(camera, renderer.domElement);
    controlsRef.current = controls;

    controls.addEventListener('lock', () => setInstructionsVisible(false));
    controls.addEventListener('unlock', () => setInstructionsVisible(true));

    // --- Scene Elements ---

    // Floor (Highly reflective material for mirror effect)
    const floorGeo = new THREE.CircleGeometry(8, 64);
    const floorMat = new THREE.MeshStandardMaterial({ 
      color: 0x111111, 
      metalness: 0.7, 
      roughness: 0.3, 
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Walls
    const room = new THREE.Group();
    // Brightened wall color and reduced roughness slightly
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
    
    // Ceiling (Highly reflective material)
    const ceilingGeo = new THREE.CircleGeometry(8, 64);
    const ceilingMat = new THREE.MeshStandardMaterial({ 
      color: 0x111111, 
      metalness: 0.7, 
      roughness: 0.3, 
      side: THREE.DoubleSide 
    });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.position.y = 4; // Assuming room height is 4
    ceiling.rotation.x = Math.PI / 2;
    room.add(ceiling);
    
    scene.add(room);

    // --- Lighting ---
    
    // 1. Ambient Light (General Glow) - Increased intensity significantly
    const amb = new THREE.AmbientLight(0xaaaaaa, 2.0); 
    scene.add(amb);

    // 2. Disco Point Lights (Rotating Mood Lights)
    const discoLights: THREE.PointLight[] = [];
    // Rainbow colors (7 total: R, O, Y, G, B, I, V)
    const lightColors = [0xFF0000, 0xFF8C00, 0xFFFF00, 0x00FF00, 0x0000FF, 0x4B0082, 0xEE82EE];
    const lightHeight = 3.8; 
    
    // Use a larger scale factor (0.5) to spread lights out more
    for (let i = 0; i < 7; i++) {
      const radiusFactor = fib.current[i] * 0.5; // Scale factor increased to 0.5
      // Slightly increased intensity for better reflection
      const pl = new THREE.PointLight(lightColors[i], 2.0, 10, 1.5); 
      
      // Initial position based on Fibonacci radius and even angular distribution
      pl.position.set(Math.cos(i / 7 * Math.PI * 2) * radiusFactor, lightHeight, Math.sin(i / 7 * Math.PI * 2) * radiusFactor);
      scene.add(pl);
      discoLights.push(pl);
    }
    
    // 3. Dedicated Spotlights for Art Panels (White, static)
    const panelPositions = [];
    const panelCenters = [-6, -3, 0, 3, 6];
    const panelY = 1.8;
    const lightHeightSpot = 3.5;
    const wallOffset = 7.89;
    const targetOffset = 0.1; // How far the target is from the wall

    // Right wall (x=7.89)
    panelCenters.forEach((z) => {
        panelPositions.push({ 
            x: wallOffset, 
            z: z, 
            targetX: wallOffset - targetOffset, 
            targetZ: z,
            targetY: panelY 
        });
    });
    // Left wall (x=-7.89)
    panelCenters.forEach((z) => {
        panelPositions.push({ 
            x: -wallOffset, 
            z: z, 
            targetX: -wallOffset + targetOffset, 
            targetZ: z,
            targetY: panelY
        });
    });
    // Back wall (z=-7.89)
    panelCenters.forEach((x) => {
        panelPositions.push({ 
            x: x, 
            z: -wallOffset, 
            targetX: x, 
            targetZ: -wallOffset + targetOffset,
            targetY: panelY
        });
    });
    // Front wall (z=7.89)
    panelCenters.forEach((x) => {
        panelPositions.push({ 
            x: x, 
            z: wallOffset, 
            targetX: x, 
            targetZ: wallOffset - targetOffset,
            targetY: panelY
        });
    });

    panelPositions.forEach((pos) => {
      // Increased spotlight intensity slightly
      const spotLight = new THREE.SpotLight(0xffffff, 8, 5, Math.PI / 8, 0.5, 1); 
      spotLight.position.set(pos.x, lightHeightSpot, pos.z); // Positioned high above the panel
      
      const target = new THREE.Object3D();
      target.position.set(pos.targetX, pos.targetY, pos.targetZ); // Aimed at the panel center
      scene.add(target);
      spotLight.target = target;
      
      scene.add(spotLight);
    });


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
      const intersects = raycasterRef.current.intersectObjects(panelMeshesRef.current, false);

      if (intersects.length > 0) {
        const mesh = intersects[0].object as PanelMesh;
        const meta = mesh.userData.metadataUrl;
        
        // Update selected video state
        if (mesh.userData.videoElement) {
          const video = mesh.userData.videoElement;
          // Toggle play/pause on click
          if (video.paused) {
            video.play().catch(e => console.warn("Video play failed on click:", e));
          } else {
            video.pause();
          }
          setSelectedVideoMuted(video.muted);
        } else {
          setSelectedVideoMuted(true); // Default to muted state if not a video
        }

        if (meta) {
          onPanelClick(meta);
        }
      }
    };
    document.addEventListener('click', onDocumentClick);

    // --- Animation Loop ---

    const animate = () => {
      requestAnimationFrame(animate);
      const delta = clockRef.current.getDelta();
      
      const baseSpeed = 0.0004;

      // Update disco lights rotate using Fibonacci radii
      for (let i = 0; i < discoLights.length; i++) {
        // Use a slightly varied speed based on index, but keep it close to the base speed
        const speedFactor = baseSpeed * (1 + i * 0.05); 
        const a = performance.now() * speedFactor;
        const radiusFactor = fib.current[i] * 0.5; 
        
        discoLights[i].position.x = Math.cos(a + i) * radiusFactor;
        discoLights[i].position.z = Math.sin(a + i) * radiusFactor;
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
        // We use the previous position to restore if the new position is outside the boundary
        if (camera.position.x > BOUNDARY || camera.position.x < -BOUNDARY) {
          camera.position.x = previousPosition.x;
        }
        if (camera.position.z > BOUNDARY || camera.position.z < -BOUNDARY) {
          camera.position.z = previousPosition.z;
        }

        // Raycast for highlighting/selection
        raycasterRef.current.setFromCamera(new THREE.Vector2(0, 0), camera);
        const intersects = raycasterRef.current.intersectObjects(panelMeshesRef.current, false);

        if (intersects.length > 0) {
          const mesh = intersects[0].object as PanelMesh;
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
              setSelectedVideoMuted(true); // Hide controls when nothing is selected
            }
          }
        } else {
          if (selectedPanelRef.current) {
            (selectedPanelRef.current.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
            selectedPanelRef.current = null;
            setSelectedVideoMuted(true); // Hide controls when nothing is selected
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
      
      // Clean up video elements
      panelMeshesRef.current.forEach(m => {
        if (m.userData.videoElement) {
          m.userData.videoElement.pause();
          m.userData.videoElement.remove();
        }
      });

      mountRef.current?.removeChild(renderer.domElement);
      controls.dispose();
      renderer.dispose();
    };
  }, [onPanelClick, setupPanels, createPanel, fetchAndApplyToMesh, setInstructionsVisible]);

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
      getSelectedPanelUrl: () => selectedPanelRef.current?.userData.metadataUrl || '',
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