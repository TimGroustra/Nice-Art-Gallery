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
  prevArrow: THREE.Mesh; // New 3D arrow mesh
  nextArrow: THREE.Mesh; // New 3D arrow mesh
  titleMesh: THREE.Mesh; // Added
  descriptionMesh: THREE.Mesh; // Added
}

interface NftGalleryProps {
  setInstructionsVisible: (visible: boolean) => void;
}

// Global state for UI interaction
let currentTargetedPanel: Panel | null = null;
let currentTargetedArrow: THREE.Mesh | null = null; // Track targeted arrow for visual feedback

// Helper function to create a text texture using Canvas
const createTextTexture = (text: string, width: number, height: number, fontSize: number, color: string = 'white'): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return new THREE.CanvasTexture(document.createElement('canvas'));

    const resolution = 512;
    // Calculate canvas dimensions based on desired aspect ratio (width/height)
    canvas.width = resolution * (width / height);
    canvas.height = resolution;

    // 1. Make background transparent
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Use the provided fontSize directly as a pixel value for the canvas context
    const actualFontSize = fontSize;
    context.font = `bold ${actualFontSize}px Arial`; // Set font to bold
    context.fillStyle = color;
    context.textAlign = 'left';
    context.textBaseline = 'top';

    const padding = 20;
    const lineHeight = actualFontSize * 1.2;
    const maxTextWidth = canvas.width - 2 * padding;
    
    // Simple word wrapping
    const words = text.split(' ');
    let line = '';
    let y = padding;

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = context.measureText(testLine);
        const testWidth = metrics.width;

        if (testWidth > maxTextWidth && n > 0) {
            context.fillText(line, padding, y);
            line = words[n] + ' ';
            y += lineHeight;
            if (y > canvas.height - padding) break; // Prevent overflow
        } else {
            line = testLine;
        }
    }
    if (y < canvas.height - padding) {
        context.fillText(line, padding, y);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
};


const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isLocked, setIsLocked] = useState(false); 

  // Function to manage video playback based on lock state
  const manageVideoPlayback = useCallback((shouldPlay: boolean) => {
    if (videoRef.current) {
      if (shouldPlay) {
        const controlsLocked = (window as any).galleryControls?.isLocked?.() ?? false;
        
        if (controlsLocked) {
          videoRef.current.play().catch(e => {
            console.warn("Video playback prevented or failed:", e);
          });
        }
      } else {
        videoRef.current.pause();
      }
    }
  }, []);


  // --- Utility Functions for Three.js Content Management ---

  const loadTexture = useCallback((url: string, isVideo: boolean = false): THREE.Texture | THREE.VideoTexture => {
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
    return new THREE.TextureLoader().load(url, 
      () => {}, 
      undefined, 
      (error) => {
        console.error('Error loading texture:', url, error);
        showError(`Failed to load image: ${url.substring(0, 50)}...`);
      }
    );
  }, [manageVideoPlayback]);

  const updatePanelContent = useCallback(async (panel: Panel, source: NftSource) => {
    try {
      const metadata: NftMetadata = await fetchNftMetadata(source.contractAddress, source.tokenId);
      
      const imageUrl = metadata.image;
      const isVideo = imageUrl.endsWith('.mp4') || imageUrl.endsWith('.webm') || imageUrl.endsWith('.ogg');
      
      if (isVideo && videoRef.current) {
        manageVideoPlayback(false);
      }

      const texture = loadTexture(imageUrl, isVideo);
      
      if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
        panel.mesh.material.map?.dispose();
        panel.mesh.material.dispose();
      }

      panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture });
      panel.metadataUrl = metadata.source;
      panel.isVideo = isVideo;

      // 1. Update Title Text (Using large, bold font)
      if (panel.titleMesh.material instanceof THREE.MeshBasicMaterial && panel.titleMesh.material.map) {
        panel.titleMesh.material.map.dispose();
      }
      const titleTexture = createTextTexture(metadata.title, 1.5, 0.5, 80, 'white');
      (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTexture;
      panel.titleMesh.visible = true;

      // 2. Update Description Text (Using large, bold font)
      if (panel.descriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.descriptionMesh.material.map) {
        panel.descriptionMesh.material.map.dispose();
      }
      // Limit description length for readability on the small panel
      const descriptionText = metadata.description.length > 150 ? metadata.description.substring(0, 147) + '...' : metadata.description;
      const descriptionTexture = createTextTexture(descriptionText, 1.5, 1.5, 40, 'lightgray');
      (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = descriptionTexture;
      panel.descriptionMesh.visible = true;


      if (isVideo) {
        showSuccess(`Loaded video NFT: ${metadata.title}`);
      } else {
        showSuccess(`Loaded image NFT: ${metadata.title}`);
      }
      
    } catch (error) {
      console.error(`Error updating panel ${panel.wallName}:`, error);
      showError(`Failed to load NFT for ${panel.wallName}.`);
      
      if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
        panel.mesh.material.map?.dispose();
        panel.mesh.material.dispose();
      }
      panel.mesh.material = new THREE.MeshBasicMaterial({ color: 0x333333 });
      panel.metadataUrl = '';
      panel.isVideo = false;
      
      // Hide text panels on error, safely checking if meshes exist
      if (panel.titleMesh) panel.titleMesh.visible = false;
      if (panel.descriptionMesh) panel.descriptionMesh.visible = false;
    }
  }, [loadTexture, manageVideoPlayback]);

  // --- Three.js Setup Effect ---

  useEffect(() => {
    if (!mountRef.current) return;

    // 1. Setup Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaaaaaa);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 4.5); 

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    // 2. Controls (PointerLockControls)
    const controls = new PointerLockControls(camera, renderer.domElement);
    
    (window as any).galleryControls = {
      lockControls: () => controls.lock(),
      hasVideo: () => panelsRef.current.some(p => p.isVideo),
      isMuted: () => videoRef.current?.muted ?? true,
      toggleMute: () => {
        if (videoRef.current) {
          videoRef.current.muted = !videoRef.current.muted;
        }
      },
      isLocked: () => controls.isLocked, 
      getTargetedPanel: () => currentTargetedPanel,
    };

    controls.addEventListener('lock', () => {
      setIsLocked(true);
      setInstructionsVisible(false);
      if (panelsRef.current.some(p => p.isVideo)) {
        manageVideoPlayback(true);
      }
    });
    controls.addEventListener('unlock', () => {
      setIsLocked(false);
      setInstructionsVisible(true);
      manageVideoPlayback(false);
    });


    // 3. Geometry: Floor, Ceiling, Walls
    const roomSize = 10;
    const wallHeight = 4;
    const panelYPosition = 1.8; 
    const boundary = roomSize / 2 - 0.5; 

    // Floor (Green)
    const floorGeometry = new THREE.PlaneGeometry(roomSize, roomSize);
    const floorMaterial = new THREE.MeshPhongMaterial({ color: 0x006400, side: THREE.DoubleSide });
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
    
    // Ambient Light (Increased intensity slightly)
    const amb = new THREE.AmbientLight(0x404050, 0.8); 
    scene.add(amb);

    // Hemisphere Light for even ceiling illumination
    // Sky color (ceiling): white/light grey (0xffffff)
    // Ground color (floor): dark grey/black (0x000000)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, wallHeight, 0); // Positioned at the ceiling height
    scene.add(hemiLight);


    // 5. Setup initial panels and 3D arrows
    const panelGeometry = new THREE.PlaneGeometry(2, 2);
    const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
    
    // Arrow geometry (simple triangle pointing right along the positive X axis of its local coordinate system)
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15);
    arrowShape.lineTo(0.3, 0);
    arrowShape.lineTo(0, -0.15);
    arrowShape.lineTo(0, 0.15);
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const ARROW_COLOR_DEFAULT = 0xcccccc;
    const ARROW_COLOR_HOVER = 0x00ff00; // Bright Green Hover Color
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: ARROW_COLOR_DEFAULT, side: THREE.DoubleSide });
    
    // Offset constants
    const ARROW_DEPTH_OFFSET = 0.02; 
    const ARROW_PANEL_OFFSET = 1.5; // Distance from panel center to arrow center
    const TEXT_DEPTH_OFFSET = 0.03; // Slightly further out than the arrows/NFT panel

    // Text panel constants
    const TEXT_PANEL_WIDTH = 1.5;
    const TITLE_HEIGHT = 0.5;
    const DESCRIPTION_HEIGHT = 1.5;
    const TEXT_BLOCK_OFFSET_X = 3; // Distance from center of NFT panel to center of text block.
    
    // Placeholder text meshes
    // Use a transparent material for the text planes
    const placeholderTexture = createTextTexture('Loading...', TEXT_PANEL_WIDTH, TITLE_HEIGHT + DESCRIPTION_HEIGHT, 30, 'white');
    const placeholderMaterial = new THREE.MeshBasicMaterial({ 
        map: placeholderTexture, 
        transparent: true, 
        side: THREE.DoubleSide,
        alphaTest: 0.01, // Lower alpha test to ensure text pixels are visible
        depthWrite: false // Crucial for transparent planes near other geometry
    });
    const titleGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, TITLE_HEIGHT);
    const descriptionGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, DESCRIPTION_HEIGHT);


    const panelConfigs: { wallName: keyof PanelConfig, position: [number, number, number], rotation: [number, number, number] }[] = [
      { wallName: 'north-wall', position: [0, panelYPosition, -roomSize / 2 + ARROW_DEPTH_OFFSET], rotation: [0, 0, 0] }, // -Z wall
      { wallName: 'south-wall', position: [0, panelYPosition, roomSize / 2 - ARROW_DEPTH_OFFSET], rotation: [0, Math.PI, 0] }, // +Z wall
      { wallName: 'east-wall', position: [roomSize / 2 - ARROW_DEPTH_OFFSET, panelYPosition, 0], rotation: [0, -Math.PI / 2, 0] }, // +X wall
      { wallName: 'west-wall', position: [-roomSize / 2 + ARROW_DEPTH_OFFSET, panelYPosition, 0], rotation: [0, Math.PI / 2, 0] }, // -X wall
    ];

    panelConfigs.forEach(config => {
      // Panel Mesh
      const mesh = new THREE.Mesh(panelGeometry, panelMaterial.clone());
      mesh.position.set(config.position[0], config.position[1], config.position[2]);
      mesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      scene.add(mesh);
      
      const arrowY = config.position[1];
      
      // Calculate the local X vector (Right direction relative to the wall)
      const wallRotation = new THREE.Euler().set(config.rotation[0], config.rotation[1], config.rotation[2], 'XYZ');
      const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);
      const upVector = new THREE.Vector3(0, 1, 0).applyEuler(wallRotation);
      const forwardVector = new THREE.Vector3(0, 0, 1).applyEuler(wallRotation); // Vector pointing out from the wall
      
      // --- Text Panel Positioning ---
      
      // Base position (center of the wall panel)
      const basePosition = new THREE.Vector3(config.position[0], panelYPosition, config.position[2]);
      
      // Text Panel Group Position (centered in the space to the left of the NFT panel)
      const textGroupPosition = basePosition.clone();
      textGroupPosition.addScaledVector(rightVector, -TEXT_BLOCK_OFFSET_X); 
      
      // Title Mesh
      // Clone the material to ensure each text panel can have a unique texture map
      const titleMesh = new THREE.Mesh(titleGeometry, placeholderMaterial.clone());
      titleMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      
      // Position title: centered horizontally in the text group, top of the text group area
      const titlePosition = textGroupPosition.clone();
      // Move up to position the title correctly relative to the center (panelYPosition)
      titlePosition.addScaledVector(upVector, (DESCRIPTION_HEIGHT / 2) - (TITLE_HEIGHT / 2)); 
      
      // Move slightly forward from the wall
      titlePosition.addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      titleMesh.position.copy(titlePosition);
      scene.add(titleMesh);

      // Description Mesh
      const descriptionMesh = new THREE.Mesh(descriptionGeometry, placeholderMaterial.clone());
      descriptionMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      
      // Position description: centered horizontally in the text group, bottom of the text group area
      const descriptionPosition = textGroupPosition.clone();
      // Move down below the title
      descriptionPosition.addScaledVector(upVector, -(TITLE_HEIGHT / 2)); 
      
      // Move slightly forward from the wall
      descriptionPosition.addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      descriptionMesh.position.copy(descriptionPosition);
      scene.add(descriptionMesh);
      
      // --- Previous Arrow (Left) ---
      const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      
      // Rotation: Panel rotation + PI (to flip the triangle to point left)
      prevArrow.rotation.set(config.rotation[0], config.rotation[1] + Math.PI, config.rotation[2]);
      
      // Position: Panel center - (Right vector * offset) = Panel center + (Left vector * offset)
      const prevPosition = new THREE.Vector3(config.position[0], arrowY, config.position[2]);
      prevPosition.addScaledVector(rightVector, -ARROW_PANEL_OFFSET); // Move left
      prevArrow.position.copy(prevPosition);
      scene.add(prevArrow);
      
      // --- Next Arrow (Right) ---
      const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      
      // Rotation: Panel rotation (default triangle points right)
      nextArrow.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      
      // Position: Panel center + (Right vector * offset)
      const nextPosition = new THREE.Vector3(config.position[0], arrowY, config.position[2]);
      nextPosition.addScaledVector(rightVector, ARROW_PANEL_OFFSET); // Move right
      nextArrow.position.copy(nextPosition);
      scene.add(nextArrow);


      const panel: Panel = {
        mesh,
        wallName: config.wallName,
        metadataUrl: '',
        isVideo: false,
        prevArrow,
        nextArrow,
        titleMesh,
        descriptionMesh,
      };
      panelsRef.current.push(panel);
      
      // Load initial content
      const source = getCurrentNftSource(config.wallName);
      if (source) {
        updatePanelContent(panel, source);
      }
    });

    // 6. Movement Variables and Handlers
    let moveForward = false;
    let moveBackward = false;
    let moveLeft = false;
    let moveRight = false;
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const speed = 20.0; // Movement speed

    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveForward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveLeft = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveBackward = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          moveRight = true;
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveForward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveLeft = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveBackward = false;
          break;
          case 'KeyD':
        case 'ArrowRight':
          moveRight = false;
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);


    // 7. Interaction (Raycasting)
    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0); // Center of the screen for targeting

    const interactiveMeshes = panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow]);

    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!controls.isLocked) return; 

      console.log("Click detected while controls are locked.");
      
      if (currentTargetedArrow) {
        console.log("Targeted Arrow clicked. Cycling NFT.");
        const panel = panelsRef.current.find(p => p.prevArrow === currentTargetedArrow || p.nextArrow === currentTargetedArrow);
        if (panel) {
          const direction = currentTargetedArrow === panel.nextArrow ? 'next' : 'prev';
          const updated = updatePanelIndex(panel.wallName, direction);
          
          if (updated) {
            console.log(`Successfully updated index for ${panel.wallName}. Loading new content.`);
            const newSource = getCurrentNftSource(panel.wallName);
            if (newSource) {
              updatePanelContent(panel, newSource);
            }
          } else {
            console.log(`Index update failed for ${panel.wallName}. (Maybe only one token available?)`);
          }
        }
      } else if (currentTargetedPanel) {
        console.log("Targeted Panel clicked. Action removed.");
        // Clicked the NFT panel itself -> NO ACTION
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown, false);

    // 8. Animation Loop
    let prevTime = performance.now();
    
    const animate = () => {
      requestAnimationFrame(animate);

      const time = performance.now();
      const delta = (time - prevTime) / 1000;

      // Disco light animation
      lights.forEach((light, index) => {
        const angle = time * 0.0005 + index * (Math.PI * 2 / NUM_DISCO_LIGHTS);
        light.position.x = Math.cos(angle) * 3;
        light.position.z = Math.sin(angle) * 3;
      });

      if (controls.isLocked) {
        // Movement logic
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize(); // ensures consistent movements in all directions

        if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        
        // Keep player height constant (no jumping/falling)
        camera.position.y = 1.6; 

        // Boundary Check (Clamping position)
        camera.position.x = Math.max(-boundary, Math.min(boundary, camera.position.x));
        camera.position.z = Math.max(-boundary, Math.min(boundary, camera.position.z));
        
        // Raycast from center of screen to check for targeted objects
        raycaster.setFromCamera(center, camera);
        // Note: We don't need to include title/description meshes in interactiveMeshes as they are not clickable.
        const intersects = raycaster.intersectObjects(interactiveMeshes);
        
        // Reset hover state for all arrows
        panelsRef.current.forEach(panel => {
          if (panel.prevArrow.material instanceof THREE.MeshBasicMaterial) {
            panel.prevArrow.material.color.setHex(ARROW_COLOR_DEFAULT);
          }
          if (panel.nextArrow.material instanceof THREE.MeshBasicMaterial) {
            panel.nextArrow.material.color.setHex(ARROW_COLOR_DEFAULT);
          }
        });
        
        currentTargetedPanel = null;
        currentTargetedArrow = null;

        if (intersects.length > 0 && intersects[0].distance < 5) { // Check if object is within 5 units
          const intersectedMesh = intersects[0].object as THREE.Mesh;
          const panel = panelsRef.current.find(p => p.mesh === intersectedMesh || p.prevArrow === intersectedMesh || p.nextArrow === intersectedMesh);

          if (panel) {
            if (intersectedMesh === panel.mesh) {
              currentTargetedPanel = panel;
            } else if (intersectedMesh === panel.prevArrow || intersectedMesh === panel.nextArrow) {
              currentTargetedArrow = intersectedMesh;
              // Apply hover color
              if (intersectedMesh.material instanceof THREE.MeshBasicMaterial) {
                intersectedMesh.material.color.setHex(ARROW_COLOR_HOVER);
              }
            }
          }
        }
      } else {
        currentTargetedPanel = null;
        currentTargetedArrow = null;
      }

      prevTime = time;
      renderer.render(scene, camera);
    };

    // 9. Handle Resize
    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', onWindowResize);

    // 10. Initialization
    initializeGalleryConfig().then(() => {
      // Re-load content after config is initialized (especially for Panth.art)
      panelsRef.current.forEach(panel => {
        const source = getCurrentNftSource(panel.wallName);
        if (source) {
          updatePanelContent(panel, source);
        }
      });
    });

    animate();

    // 11. Cleanup
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown, false);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onWindowResize);
      mountRef.current?.removeChild(renderer.domElement);
      controls.dispose();
      
      // Dispose of Three.js objects to prevent memory leaks
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(material => {
              if (material.map) material.map.dispose();
              material.dispose();
            });
          } else {
            if (object.material.map) object.material.map.dispose();
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
      currentTargetedPanel = null; 
      currentTargetedArrow = null;
    };
  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback]);

  return (
    <>
      {/* Hidden video element for Three.js VideoTexture */}
      <video ref={videoRef} style={{ display: 'none' }} playsInline autoPlay muted />
      <div ref={mountRef} className="w-full h-full" />
    </>
  );
};

export default NftGallery;