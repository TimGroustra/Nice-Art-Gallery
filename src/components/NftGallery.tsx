import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { fetchNftMetadata, NftSource, NftMetadata } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';
import { buildGalleryWall, Panel, WallConfig, createTextTexture, createAttributesTextTexture } from '@/utils/galleryBuilder';

// Global state for UI interaction
let currentTargetedPanel: Panel | null = null;
let currentTargetedArrow: THREE.Mesh | null = null;
let currentTargetedDescriptionPanel: Panel | null = null; // New state for scroll focus

interface NftGalleryProps {
  setInstructionsVisible: (visible: boolean) => void;
}

const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
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
      showError(`Failed to load image: ${url.substring(0, 50)}...`);
    });
  }, [manageVideoPlayback]);

  const updatePanelContent = useCallback(async (panel: Panel, source: NftSource) => {
    try {
      const metadata: NftMetadata = await fetchNftMetadata(source.contractAddress, source.tokenId);
      const collectionName = GALLERY_PANEL_CONFIG[panel.wallName]?.name || '...';
      
      const imageUrl = metadata.image;
      const isVideo = imageUrl.endsWith('.mp4') || imageUrl.endsWith('.webm') || imageUrl.endsWith('.ogg');
      
      if (isVideo && videoRef.current) manageVideoPlayback(false);

      const texture = loadTexture(imageUrl, isVideo);
      
      if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
        panel.mesh.material.map?.dispose();
        panel.mesh.material.dispose();
      }

      panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture });
      panel.metadataUrl = metadata.source;
      panel.isVideo = isVideo;

      if (panel.titleMesh.material instanceof THREE.MeshBasicMaterial && panel.titleMesh.material.map) {
        panel.titleMesh.material.map.dispose();
      }
      // Use imported helper
      const { texture: titleTexture } = createTextTexture(metadata.title, 2.0, 0.5, 100, 'white', { wordWrap: false });
      (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTexture;
      panel.titleMesh.visible = true;

      if (panel.descriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.descriptionMesh.material.map) {
        panel.descriptionMesh.material.map.dispose();
      }
      const descriptionText = metadata.description;
      // Use imported helper
      const { texture: descriptionTexture, totalHeight } = createTextTexture(descriptionText, 1.5, 2.0, 40, 'lightgray', { wordWrap: true });
      (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = descriptionTexture;
      panel.descriptionMesh.visible = true;

      // Update panel state for scrolling
      panel.currentDescription = descriptionText;
      panel.descriptionTextHeight = totalHeight;
      panel.descriptionScrollY = 0;

      // Update attributes
      if (panel.attributesMesh.material instanceof THREE.MeshBasicMaterial && panel.attributesMesh.material.map) {
          panel.attributesMesh.material.map.dispose();
      }
      const attributes = metadata.attributes || [];
      panel.currentAttributes = attributes;
      // Use imported helper
      const { texture: attributesTexture } = createAttributesTextTexture(attributes, 1.5, 1.5, 40, 'lightgray');
      (panel.attributesMesh.material as THREE.MeshBasicMaterial).map = attributesTexture;
      panel.attributesMesh.visible = true;

      // Update wall title (This is handled inside buildGalleryWall initially, but we update it here if needed)
      if (panel.wallTitleMesh.material instanceof THREE.MeshBasicMaterial && panel.wallTitleMesh.material.map) {
        panel.wallTitleMesh.material.map.dispose();
      }
      const { texture: wallTitleTexture } = createTextTexture(collectionName, 4, 0.75, 100, 'white', { wordWrap: false });
      (panel.wallTitleMesh.material as THREE.MeshBasicMaterial).map = wallTitleTexture;
      panel.wallTitleMesh.visible = true;

      showSuccess(isVideo ? `Loaded video NFT: ${metadata.title}` : `Loaded image NFT: ${metadata.title}`);
      
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
      if (panel.titleMesh) panel.titleMesh.visible = false;
      if (panel.descriptionMesh) panel.descriptionMesh.visible = false;
      if (panel.attributesMesh) panel.attributesMesh.visible = false;
      if (panel.wallTitleMesh) panel.wallTitleMesh.visible = false;
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
    
    (window as any).galleryControls = {
      lockControls: () => controls.lock(),
      hasVideo: () => panelsRef.current.some(p => p.isVideo),
      isMuted: () => videoRef.current?.muted ?? true,
      toggleMute: () => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; },
      isLocked: () => controls.isLocked, 
      getTargetedPanel: () => currentTargetedPanel,
    };

    controls.addEventListener('lock', () => {
      setIsLocked(true);
      setInstructionsVisible(false);
      if (panelsRef.current.some(p => p.isVideo)) manageVideoPlayback(true);
    });
    controls.addEventListener('unlock', () => {
      setIsLocked(false);
      setInstructionsVisible(true);
      manageVideoPlayback(false);
    });

    const roomSize = 10, wallHeight = 4, panelYPosition = 1.8, boundary = roomSize / 2 - 0.5;
    
    // Define Wall Configurations
    const wallDimensions = { width: roomSize, height: wallHeight };
    const panelDimensions = { width: 2, height: 2 };

    const WALL_CONFIGS: WallConfig[] = [
      { 
        wallName: 'north-wall', 
        position: [0, wallHeight / 2, -roomSize / 2], 
        rotation: [0, 0, 0],
        wallDimensions,
        panelDimensions,
      },
      { 
        wallName: 'south-wall', 
        position: [0, wallHeight / 2, roomSize / 2], 
        rotation: [0, Math.PI, 0],
        wallDimensions,
        panelDimensions,
      },
      { 
        wallName: 'east-wall', 
        position: [roomSize / 2, wallHeight / 2, 0], 
        rotation: [0, -Math.PI / 2, 0],
        wallDimensions,
        panelDimensions,
      },
      { 
        wallName: 'west-wall', 
        position: [-roomSize / 2, wallHeight / 2, 0], 
        rotation: [0, Math.PI / 2, 0],
        wallDimensions,
        panelDimensions,
      },
    ];

    // Create the outer floor for padding
    const outerFloorMaterial = new THREE.MeshPhongMaterial({ color: 0xF5F5F5, side: THREE.DoubleSide });
    const outerFloor = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), outerFloorMaterial);
    outerFloor.rotation.x = Math.PI / 2;
    scene.add(outerFloor);

    // Create the inner floor with the image
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('/floor.jpg', (texture) => {
        // Calculate inner plane dimensions based on texture aspect ratio
        const padding = 1.0; // 1 unit of padding on each side
        const maxInnerSize = roomSize - 2 * padding;
        const imageAspect = texture.image.width / texture.image.height;

        let innerPlaneWidth, innerPlaneHeight;
        if (imageAspect >= 1) { // Landscape or square
            innerPlaneWidth = maxInnerSize;
            innerPlaneHeight = maxInnerSize / imageAspect;
        } else { // Portrait
            innerPlaneHeight = maxInnerSize;
            innerPlaneWidth = maxInnerSize * imageAspect;
        }

        const innerFloorGeometry = new THREE.PlaneGeometry(innerPlaneWidth, innerPlaneHeight);
        const innerFloorMaterial = new THREE.MeshPhongMaterial({ map: texture, side: THREE.DoubleSide });
        const innerFloor = new THREE.Mesh(innerFloorGeometry, innerFloorMaterial);
        
        innerFloor.rotation.x = Math.PI / 2;
        innerFloor.position.y = 0.01; // Place slightly above the outer floor to prevent z-fighting
        scene.add(innerFloor);
    });

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), new THREE.MeshPhongMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallHeight;
    scene.add(ceiling);
    
    // --- Modular Wall Creation ---
    panelsRef.current = [];
    WALL_CONFIGS.forEach(config => {
      const collectionName = GALLERY_PANEL_CONFIG[config.wallName]?.name || 'Loading...';
      // We use the wall's center Y position (wallHeight / 2) for the wall mesh, 
      // but pass the desired panel Y position (1.8) for vertical centering of the panel content.
      const panel = buildGalleryWall(scene, { ...config, position: [config.position[0], wallHeight / 2, config.position[2]], panelDimensions: { width: 2, height: 2 } }, collectionName);
      // We manually adjust the panel mesh Y position to match the original 1.8 height, 
      // as buildGalleryWall centers the panel on the wall's center (wallHeight/2).
      // Since the original code used panelYPosition=1.8, we adjust the panel mesh here.
      // Wait, let's adjust the position passed to buildGalleryWall to ensure the panel is centered at 1.8.
      // Re-reading buildGalleryWall: it uses position[1] for the wall center, and panelYPosition for the panel center.
      // Let's ensure the panel is centered at 1.8, and the wall is centered at 2.0 (wallHeight/2).
      
      // Re-running buildGalleryWall with correct parameters:
      // Wall center Y is wallHeight / 2 = 2.0
      // Panel center Y is panelYPosition = 1.8
      
      // Since buildGalleryWall creates the wall centered at position[1] and the panel centered at position[1], 
      // we need to ensure the panel is positioned correctly relative to the wall.
      // Let's stick to passing the wall center (2.0) and let the panel be centered there for now, 
      // or adjust the panel position after creation if 1.8 is critical.
      
      // Original code used panelYPosition = 1.8, but the wall was centered at wallHeight/2 = 2.0.
      // The panel was positioned at 1.8, while the wall was positioned at 2.0.
      
      // Let's adjust the panel mesh position after creation to match the original 1.8 height.
      const panelResult = buildGalleryWall(scene, config, collectionName);
      panelResult.mesh.position.y = panelYPosition;
      panelResult.titleMesh.position.y += (panelYPosition - config.position[1]);
      panelResult.descriptionMesh.position.y += (panelYPosition - config.position[1]);
      panelResult.attributesMesh.position.y += (panelYPosition - config.position[1]);
      panelResult.prevArrow.position.y = panelYPosition;
      panelResult.nextArrow.position.y = panelYPosition;
      
      panelsRef.current.push(panelResult);
    });
    
    const lights: THREE.PointLight[] = [];
    const NUM_DISCO_LIGHTS = 3, discoLightHeight = 2.5, lightColors = [0xff0066, 0x00ffd5, 0xffff00];
    for (let i = 0; i < NUM_DISCO_LIGHTS; i++) {
      const pl = new THREE.PointLight(lightColors[i], 0.8, 15, 2);
      pl.position.set(Math.cos(i / NUM_DISCO_LIGHTS * Math.PI * 2) * 3, discoLightHeight, Math.sin(i / NUM_DISCO_LIGHTS * Math.PI * 2) * 3);
      scene.add(pl);
      lights.push(pl);
    }
    scene.add(new THREE.AmbientLight(0x404050, 0.3));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.2);
    hemiLight.position.set(0, wallHeight, 0);
    scene.add(hemiLight);

    // Add glowing cove lighting
    const coveLightColor = 0x87CEEB; // A soft sky blue glow
    const coveLightIntensity = 10;
    const coveLightWidth = roomSize;
    const coveLightHeight = 0.1;

    const createCoveLighting = (
        position: [number, number, number],
        rotation: [number, number, number],
        order: THREE.EulerOrder = 'XYZ'
    ) => {
        const rectLight = new THREE.RectAreaLight(coveLightColor, coveLightIntensity, coveLightWidth, coveLightHeight);
        rectLight.position.set(...position);
        rectLight.rotation.set(rotation[0], rotation[1], rotation[2], order);
        scene.add(rectLight);

        const glowGeo = new THREE.BoxGeometry(coveLightWidth, coveLightHeight, 0.02);
        const glowMat = new THREE.MeshBasicMaterial({ color: coveLightColor, toneMapped: false });
        const glowMesh = new THREE.Mesh(glowGeo, glowMat);
        glowMesh.position.set(...position);
        glowMesh.rotation.set(rotation[0], rotation[1], rotation[2], order);
        scene.add(glowMesh);
    };

    const yPos = wallHeight - 0.1;
    const offset = 0.1;

    // North
    createCoveLighting([0, yPos, -roomSize / 2 + offset], [Math.PI / 2, 0, 0]);
    // South
    createCoveLighting([0, yPos, roomSize / 2 - offset], [-Math.PI / 2, 0, 0]);
    // East
    createCoveLighting([roomSize / 2 - offset, yPos, 0], [-Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
    // West
    createCoveLighting([-roomSize / 2 + offset, yPos, 0], [-Math.PI / 2, Math.PI / 2, 0], 'YXZ');

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
    
    // Update interactiveMeshes definition
    const interactiveMeshes = panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow, p.descriptionMesh]);

    const onDocumentMouseDown = () => {
      if (!controls.isLocked) return;
      if (currentTargetedArrow) {
        const panel = panelsRef.current.find(p => p.prevArrow === currentTargetedArrow || p.nextArrow === currentTargetedArrow);
        if (panel) {
          const direction = currentTargetedArrow === panel.nextArrow ? 'next' : 'prev';
          if (updatePanelIndex(panel.wallName, direction)) {
            const newSource = getCurrentNftSource(panel.wallName);
            if (newSource) updatePanelContent(panel, newSource);
          }
        }
      }
    };
    document.addEventListener('mousedown', onDocumentMouseDown);

    const ARROW_COLOR_DEFAULT = 0xcccccc, ARROW_COLOR_HOVER = 0x00ff00;

    const updateDescriptionTexture = (panel: Panel) => {
      if (panel.descriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.descriptionMesh.material.map) {
        panel.descriptionMesh.material.map.dispose();
      }
      const { texture } = createTextTexture(panel.currentDescription, 1.5, 2.0, 40, 'lightgray', { wordWrap: true, scrollY: panel.descriptionScrollY });
      (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = texture;
    };

    const onDocumentWheel = (event: WheelEvent) => {
      if (!controls.isLocked || !currentTargetedDescriptionPanel) return;
      const panel = currentTargetedDescriptionPanel;
      const scrollAmount = event.deltaY * 0.5;
      
      const canvasHeight = 512;
      const padding = 40; // Must match padding in createTextTexture
      const effectiveViewportHeight = canvasHeight - 2 * padding;
      const maxScroll = Math.max(0, panel.descriptionTextHeight - effectiveViewportHeight);

      let newScrollY = panel.descriptionScrollY + scrollAmount;
      newScrollY = Math.max(0, Math.min(newScrollY, maxScroll));
      
      if (panel.descriptionScrollY !== newScrollY) {
        panel.descriptionScrollY = newScrollY;
        updateDescriptionTexture(panel);
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
        
        panelsRef.current.forEach(p => {
          (p.prevArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_DEFAULT);
          (p.nextArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_DEFAULT);
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
              (intersectedMesh.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_HOVER);
            } else if (intersectedMesh === panel.descriptionMesh) {
              currentTargetedDescriptionPanel = panel;
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
      panelsRef.current.forEach(panel => {
        const source = getCurrentNftSource(panel.wallName);
        if (source) updatePanelContent(panel, source);
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
          else { if (obj.material.map) obj.material.map.dispose(); obj.material.dispose(); }
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