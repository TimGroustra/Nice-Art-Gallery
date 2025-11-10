import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { fetchNftMetadata, NftMetadata, NftSource } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';

// Define types for the panel objects
interface Panel {
  mesh: THREE.Mesh;
  wallName: keyof PanelConfig;
  metadataUrl: string;
  isVideo: boolean;
  prevArrow: THREE.Mesh;
  nextArrow: THREE.Mesh;
  // NFT Info
  titleMesh: THREE.Mesh;
  descriptionMesh: THREE.Mesh;
  currentDescription: string;
  descriptionScrollY: number;
  descriptionTextHeight: number;
  // Collection Info
  collectionTitleMesh: THREE.Mesh;
  collectionDescriptionMesh: THREE.Mesh;
  totalSupplyMesh: THREE.Mesh;
  currentCollectionDescription: string;
  collectionDescriptionScrollY: number;
  collectionDescriptionTextHeight: number;
}

interface NftGalleryProps {
  setInstructionsVisible: (visible: boolean) => void;
}

// Global state for UI interaction
let currentTargetedPanel: Panel | null = null;
let currentTargetedArrow: THREE.Mesh | null = null;
let currentTargetedDescriptionPanel: Panel | null = null;
let currentTargetedCollectionDescriptionPanel: Panel | null = null;

// Helper function to create a text texture using Canvas
const createTextTexture = (text: string, width: number, height: number, fontSize: number, color: string = 'white', scrollY: number = 0): { texture: THREE.CanvasTexture, totalHeight: number } => {
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
    context.textAlign = 'left';
    context.textBaseline = 'top';

    const padding = 40;
    const lineHeight = actualFontSize * 1.2;
    const maxTextWidth = canvas.width - 2 * padding;
    
    const words = text.split(' ');
    let line = '';
    let y = padding;

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
    
    const totalHeight = y + lineHeight - padding;

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return { texture, totalHeight };
};


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
      const { texture: titleTexture } = createTextTexture(metadata.title, 1.5, 0.5, 80, 'white');
      (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTexture;
      panel.titleMesh.visible = true;

      if (panel.descriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.descriptionMesh.material.map) {
        panel.descriptionMesh.material.map.dispose();
      }
      const descriptionText = metadata.description;
      const { texture: descriptionTexture, totalHeight } = createTextTexture(descriptionText, 1.5, 1.5, 40, 'lightgray');
      (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = descriptionTexture;
      panel.descriptionMesh.visible = true;

      panel.currentDescription = descriptionText;
      panel.descriptionTextHeight = totalHeight;
      panel.descriptionScrollY = 0;

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
    }
  }, [loadTexture, manageVideoPlayback]);

  useEffect(() => {
    if (!mountRef.current) return;

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
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), new THREE.MeshPhongMaterial({ color: 0x006400, side: THREE.DoubleSide }));
    floor.rotation.x = Math.PI / 2;
    scene.add(floor);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), new THREE.MeshPhongMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallHeight;
    scene.add(ceiling);
    const wallMaterial = new THREE.MeshPhongMaterial({ color: 0x444444, side: THREE.DoubleSide });
    const northWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), wallMaterial);
    northWall.position.set(0, wallHeight / 2, -roomSize / 2);
    scene.add(northWall);
    const southWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), wallMaterial);
    southWall.rotation.y = Math.PI;
    southWall.position.set(0, wallHeight / 2, roomSize / 2);
    scene.add(southWall);
    const eastWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), wallMaterial);
    eastWall.rotation.y = -Math.PI / 2;
    eastWall.position.set(roomSize / 2, wallHeight / 2, 0);
    scene.add(eastWall);
    const westWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), wallMaterial);
    westWall.rotation.y = Math.PI / 2;
    westWall.position.set(-roomSize / 2, wallHeight / 2, 0);
    scene.add(westWall);

    const lights: THREE.PointLight[] = [];
    const NUM_DISCO_LIGHTS = 3, discoLightHeight = 2.5, lightColors = [0xff0066, 0x00ffd5, 0xffff00];
    for (let i = 0; i < NUM_DISCO_LIGHTS; i++) {
      const pl = new THREE.PointLight(lightColors[i], 1.2, 15, 2);
      pl.position.set(Math.cos(i / NUM_DISCO_LIGHTS * Math.PI * 2) * 3, discoLightHeight, Math.sin(i / NUM_DISCO_LIGHTS * Math.PI * 2) * 3);
      scene.add(pl);
      lights.push(pl);
    }
    scene.add(new THREE.AmbientLight(0x404050, 0.8));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, wallHeight, 0);
    scene.add(hemiLight);

    const panelGeometry = new THREE.PlaneGeometry(2, 2);
    const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15); arrowShape.lineTo(0.3, 0); arrowShape.lineTo(0, -0.15); arrowShape.lineTo(0, 0.15);
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const ARROW_COLOR_DEFAULT = 0xcccccc, ARROW_COLOR_HOVER = 0x00ff00;
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: ARROW_COLOR_DEFAULT, side: THREE.DoubleSide });
    const ARROW_DEPTH_OFFSET = 0.02, ARROW_PANEL_OFFSET = 1.5, TEXT_DEPTH_OFFSET = 0.03;
    const TEXT_PANEL_WIDTH = 1.5, TEXT_BLOCK_OFFSET_X = 3;
    const { texture: placeholderTexture } = createTextTexture('Loading...', TEXT_PANEL_WIDTH, 2, 30, 'white');
    const placeholderMaterial = new THREE.MeshBasicMaterial({ map: placeholderTexture, transparent: true, side: THREE.DoubleSide, alphaTest: 0.01, depthWrite: false });
    
    // Geometries for NFT info (left side)
    const titleGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, 0.5);
    const descriptionGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, 1.5);

    // Geometries for Collection info (right side)
    const COLLECTION_TITLE_HEIGHT = 0.5, COLLECTION_DESCRIPTION_HEIGHT = 1.25, SUPPLY_HEIGHT = 0.25;
    const collectionTitleGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, COLLECTION_TITLE_HEIGHT);
    const collectionDescriptionGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, COLLECTION_DESCRIPTION_HEIGHT);
    const totalSupplyGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, SUPPLY_HEIGHT);

    const panelConfigs = [
      { wallName: 'north-wall', position: [0, panelYPosition, -roomSize / 2 + ARROW_DEPTH_OFFSET], rotation: [0, 0, 0] },
      { wallName: 'south-wall', position: [0, panelYPosition, roomSize / 2 - ARROW_DEPTH_OFFSET], rotation: [0, Math.PI, 0] },
      { wallName: 'east-wall', position: [roomSize / 2 - ARROW_DEPTH_OFFSET, panelYPosition, 0], rotation: [0, -Math.PI / 2, 0] },
      { wallName: 'west-wall', position: [-roomSize / 2 + ARROW_DEPTH_OFFSET, panelYPosition, 0], rotation: [0, Math.PI / 2, 0] },
    ];

    panelConfigs.forEach(config => {
      const mesh = new THREE.Mesh(panelGeometry, panelMaterial.clone());
      mesh.position.set(...config.position);
      mesh.rotation.set(...config.rotation);
      scene.add(mesh);
      
      const wallRotation = new THREE.Euler(...config.rotation, 'XYZ');
      const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);
      const upVector = new THREE.Vector3(0, 1, 0).applyEuler(wallRotation);
      const forwardVector = new THREE.Vector3(0, 0, 1).applyEuler(wallRotation);
      const basePosition = new THREE.Vector3(...config.position);
      
      // Left side: NFT Info
      const leftTextGroupPosition = basePosition.clone().addScaledVector(rightVector, -TEXT_BLOCK_OFFSET_X);
      const titleMesh = new THREE.Mesh(titleGeometry, placeholderMaterial.clone());
      titleMesh.rotation.set(...config.rotation);
      titleMesh.position.copy(leftTextGroupPosition.clone().addScaledVector(upVector, 0.5).addScaledVector(forwardVector, TEXT_DEPTH_OFFSET));
      scene.add(titleMesh);
      const descriptionMesh = new THREE.Mesh(descriptionGeometry, placeholderMaterial.clone());
      descriptionMesh.rotation.set(...config.rotation);
      descriptionMesh.position.copy(leftTextGroupPosition.clone().addScaledVector(upVector, -0.25).addScaledVector(forwardVector, TEXT_DEPTH_OFFSET));
      scene.add(descriptionMesh);
      
      // Right side: Collection Info
      const rightTextGroupPosition = basePosition.clone().addScaledVector(rightVector, TEXT_BLOCK_OFFSET_X);
      const collectionTitleMesh = new THREE.Mesh(collectionTitleGeometry, placeholderMaterial.clone());
      collectionTitleMesh.rotation.set(...config.rotation);
      collectionTitleMesh.position.copy(rightTextGroupPosition.clone().addScaledVector(upVector, 0.75).addScaledVector(forwardVector, TEXT_DEPTH_OFFSET));
      scene.add(collectionTitleMesh);
      const collectionDescriptionMesh = new THREE.Mesh(collectionDescriptionGeometry, placeholderMaterial.clone());
      collectionDescriptionMesh.rotation.set(...config.rotation);
      collectionDescriptionMesh.position.copy(rightTextGroupPosition.clone().addScaledVector(upVector, -0.125).addScaledVector(forwardVector, TEXT_DEPTH_OFFSET));
      scene.add(collectionDescriptionMesh);
      const totalSupplyMesh = new THREE.Mesh(totalSupplyGeometry, placeholderMaterial.clone());
      totalSupplyMesh.rotation.set(...config.rotation);
      totalSupplyMesh.position.copy(rightTextGroupPosition.clone().addScaledVector(upVector, -0.875).addScaledVector(forwardVector, TEXT_DEPTH_OFFSET));
      scene.add(totalSupplyMesh);

      // Arrows
      const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      prevArrow.rotation.set(config.rotation[0], config.rotation[1] + Math.PI, config.rotation[2]);
      prevArrow.position.copy(new THREE.Vector3(...config.position).addScaledVector(rightVector, -ARROW_PANEL_OFFSET));
      scene.add(prevArrow);
      const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      nextArrow.rotation.set(...config.rotation);
      nextArrow.position.copy(new THREE.Vector3(...config.position).addScaledVector(rightVector, ARROW_PANEL_OFFSET));
      scene.add(nextArrow);

      const panel: Panel = {
        mesh, wallName: config.wallName as keyof PanelConfig, metadataUrl: '', isVideo: false, prevArrow, nextArrow, titleMesh, descriptionMesh,
        currentDescription: '', descriptionScrollY: 0, descriptionTextHeight: 0,
        collectionTitleMesh, collectionDescriptionMesh, totalSupplyMesh,
        currentCollectionDescription: '', collectionDescriptionScrollY: 0, collectionDescriptionTextHeight: 0,
      };
      panelsRef.current.push(panel);
    });

    let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
    const velocity = new THREE.Vector3(), direction = new THREE.Vector3(), speed = 20.0;
    const onKeyDown = (e: KeyboardEvent) => { e.code === 'KeyW' ? moveForward = true : e.code === 'KeyA' ? moveLeft = true : e.code === 'KeyS' ? moveBackward = true : e.code === 'KeyD' && (moveRight = true); };
    const onKeyUp = (e: KeyboardEvent) => { e.code === 'KeyW' ? moveForward = false : e.code === 'KeyA' ? moveLeft = false : e.code === 'KeyS' ? moveBackward = false : e.code === 'KeyD' && (moveRight = false); };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);
    const interactiveMeshes = panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow, p.descriptionMesh, p.collectionDescriptionMesh]);

    const onDocumentMouseDown = () => {
      if (!controls.isLocked || !currentTargetedArrow) return;
      const panel = panelsRef.current.find(p => p.prevArrow === currentTargetedArrow || p.nextArrow === currentTargetedArrow);
      if (panel) {
        const direction = currentTargetedArrow === panel.nextArrow ? 'next' : 'prev';
        if (updatePanelIndex(panel.wallName, direction)) {
          const newSource = getCurrentNftSource(panel.wallName);
          if (newSource) updatePanelContent(panel, newSource);
        }
      }
    };
    document.addEventListener('mousedown', onDocumentMouseDown);

    const updateDescriptionTexture = (panel: Panel) => {
      if (panel.descriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.descriptionMesh.material.map) panel.descriptionMesh.material.map.dispose();
      const { texture } = createTextTexture(panel.currentDescription, 1.5, 1.5, 40, 'lightgray', panel.descriptionScrollY);
      (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = texture;
    };
    const updateCollectionDescriptionTexture = (panel: Panel) => {
      if (panel.collectionDescriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.collectionDescriptionMesh.material.map) panel.collectionDescriptionMesh.material.map.dispose();
      const { texture } = createTextTexture(panel.currentCollectionDescription, 1.5, COLLECTION_DESCRIPTION_HEIGHT, 35, 'lightgray', panel.collectionDescriptionScrollY);
      (panel.collectionDescriptionMesh.material as THREE.MeshBasicMaterial).map = texture;
    };

    const onDocumentWheel = (event: WheelEvent) => {
      if (!controls.isLocked) return;
      const scrollAmount = event.deltaY * 0.5, canvasHeight = 512, padding = 40, effectiveViewportHeight = canvasHeight - 2 * padding;
      if (currentTargetedDescriptionPanel) {
        const panel = currentTargetedDescriptionPanel;
        const maxScroll = Math.max(0, panel.descriptionTextHeight - effectiveViewportHeight);
        let newScrollY = Math.max(0, Math.min(panel.descriptionScrollY + scrollAmount, maxScroll));
        if (panel.descriptionScrollY !== newScrollY) { panel.descriptionScrollY = newScrollY; updateDescriptionTexture(panel); }
      } else if (currentTargetedCollectionDescriptionPanel) {
        const panel = currentTargetedCollectionDescriptionPanel;
        const maxScroll = Math.max(0, panel.collectionDescriptionTextHeight - effectiveViewportHeight);
        let newScrollY = Math.max(0, Math.min(panel.collectionDescriptionScrollY + scrollAmount, maxScroll));
        if (panel.collectionDescriptionScrollY !== newScrollY) { panel.collectionDescriptionScrollY = newScrollY; updateCollectionDescriptionTexture(panel); }
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
        
        panelsRef.current.forEach(p => { (p.prevArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_DEFAULT); (p.nextArrow.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_DEFAULT); });
        
        currentTargetedPanel = currentTargetedArrow = currentTargetedDescriptionPanel = currentTargetedCollectionDescriptionPanel = null;

        if (intersects.length > 0 && intersects[0].distance < 5) {
          const intersectedMesh = intersects[0].object as THREE.Mesh;
          const panel = panelsRef.current.find(p => p.mesh === intersectedMesh || p.prevArrow === intersectedMesh || p.nextArrow === intersectedMesh || p.descriptionMesh === intersectedMesh || p.collectionDescriptionMesh === intersectedMesh);
          if (panel) {
            if (intersectedMesh === panel.mesh) currentTargetedPanel = panel;
            else if (intersectedMesh === panel.prevArrow || intersectedMesh === panel.nextArrow) { currentTargetedArrow = intersectedMesh; (intersectedMesh.material as THREE.MeshBasicMaterial).color.setHex(ARROW_COLOR_HOVER); }
            else if (intersectedMesh === panel.descriptionMesh) currentTargetedDescriptionPanel = panel;
            else if (intersectedMesh === panel.collectionDescriptionMesh) currentTargetedCollectionDescriptionPanel = panel;
          }
        }
      }
      prevTime = time;
      renderer.render(scene, camera);
    };

    const onWindowResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
    window.addEventListener('resize', onWindowResize);

    const updatePanelCollectionInfo = (panel: Panel) => {
      const config = GALLERY_PANEL_CONFIG[panel.wallName];
      if (!config) return;
      const { collectionName, collectionDescription, totalSupply } = config;
      if (panel.collectionTitleMesh.material instanceof THREE.MeshBasicMaterial && panel.collectionTitleMesh.material.map) panel.collectionTitleMesh.material.map.dispose();
      const { texture: titleTexture } = createTextTexture(collectionName || 'Untitled Collection', 1.5, COLLECTION_TITLE_HEIGHT, 60, 'white');
      (panel.collectionTitleMesh.material as THREE.MeshBasicMaterial).map = titleTexture;
      if (panel.collectionDescriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.collectionDescriptionMesh.material.map) panel.collectionDescriptionMesh.material.map.dispose();
      const descText = collectionDescription || 'No description.';
      const { texture: descTexture, totalHeight } = createTextTexture(descText, 1.5, COLLECTION_DESCRIPTION_HEIGHT, 35, 'lightgray');
      (panel.collectionDescriptionMesh.material as THREE.MeshBasicMaterial).map = descTexture;
      panel.currentCollectionDescription = descText;
      panel.collectionDescriptionTextHeight = totalHeight;
      panel.collectionDescriptionScrollY = 0;
      if (panel.totalSupplyMesh.material instanceof THREE.MeshBasicMaterial && panel.totalSupplyMesh.material.map) panel.totalSupplyMesh.material.map.dispose();
      const supplyText = `Total Supply: ${totalSupply !== undefined ? totalSupply : 'N/A'}`;
      const { texture: supplyTexture } = createTextTexture(supplyText, 1.5, SUPPLY_HEIGHT, 40, 'white');
      (panel.totalSupplyMesh.material as THREE.MeshBasicMaterial).map = supplyTexture;
    };

    initializeGalleryConfig().then(() => {
      panelsRef.current.forEach(panel => {
        const source = getCurrentNftSource(panel.wallName);
        if (source) updatePanelContent(panel, source);
        updatePanelCollectionInfo(panel);
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
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute('src'); videoRef.current.load(); }
      delete (window as any).galleryControls;
      currentTargetedPanel = currentTargetedArrow = currentTargetedDescriptionPanel = currentTargetedCollectionDescriptionPanel = null;
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