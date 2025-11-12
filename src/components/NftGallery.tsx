import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { fetchNftMetadata, normalizeUrl, NftMetadata, NftAttribute, NftSource } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';
import { createTextTexture, createAttributesTextTexture } from '@/utils/threeUtils';

// Constants for geometry
const TEXT_PANEL_WIDTH = 2.5;
const TITLE_HEIGHT = 0.5;
const DESCRIPTION_HEIGHT = 1.5;
const ATTRIBUTES_HEIGHT = 1.5;
const DESCRIPTION_PANEL_HEIGHT = TITLE_HEIGHT + DESCRIPTION_HEIGHT;

// Define types for the panel objects
interface Panel {
  mesh: THREE.Mesh;
  wallName: keyof PanelConfig;
  metadataUrl: string;
  isVideo: boolean;
  prevArrow: THREE.Mesh;
  nextArrow: THREE.Mesh;
  titleMesh: THREE.Mesh;
  descriptionMesh: THREE.Mesh;
  attributesMesh: THREE.Mesh;
  wallTitleMesh: THREE.Mesh;
  // New properties for scrolling description
  currentDescription: string;
  descriptionScrollY: number;
  descriptionTextHeight: number;
  currentAttributes: NftAttribute[];
}

interface NftGalleryProps {
  setInstructionsVisible: (visible: boolean) => void;
}

// Global state for UI interaction
let currentTargetedPanel: Panel | null = null;
let currentTargetedArrow: THREE.Mesh | null = null;
let currentTargetedDescriptionPanel: Panel | null = null; // New state for scroll focus

const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isLocked, setIsLocked] = useState(false); 
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);

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
      // Increased font size from 100 to 120
      const { texture: titleTexture } = createTextTexture(metadata.title, 4.0, 0.5, 120, 'white', { wordWrap: false }); // Updated width to 4.0
      (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTexture;
      panel.titleMesh.visible = true;

      if (panel.descriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.descriptionMesh.material.map) {
        panel.descriptionMesh.material.map.dispose();
      }
      const descriptionText = metadata.description;
      const { texture: descriptionTexture, totalHeight } = createTextTexture(descriptionText, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, 'lightgray', { wordWrap: true });
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
      const { texture: attributesTexture } = createAttributesTextTexture(attributes, TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT, 40, 'lightgray');
      (panel.attributesMesh.material as THREE.MeshBasicMaterial).map = attributesTexture;
      panel.attributesMesh.visible = true;

      // Update wall title
      if (panel.wallTitleMesh.material instanceof THREE.MeshBasicMaterial && panel.wallTitleMesh.material.map) {
        panel.wallTitleMesh.material.map.dispose();
      }
      // Increased font size from 100 to 120
      const { texture: wallTitleTexture } = createTextTexture(collectionName, 8, 0.75, 120, 'white', { wordWrap: false }); // Updated width to 8
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
    
    // Start camera outside the 50x50 room, looking towards the center
    camera.position.set(0, 1.6, -26); 
    
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

    const roomSize = 10, wallHeight = 4;
    const totalAreaSize = 70;
    const boundary = totalAreaSize / 2; // 35 units
    const panelYPosition = 1.8; // Defined panelYPosition here
    
    // Create the outer floor for padding (now the main floor)
    const outerFloorMaterial = new THREE.MeshPhongMaterial({ color: 0xF5F5F5, side: THREE.DoubleSide });
    const outerFloor = new THREE.Mesh(new THREE.PlaneGeometry(totalAreaSize, totalAreaSize), outerFloorMaterial);
    outerFloor.rotation.x = Math.PI / 2;
    scene.add(outerFloor);

    // Create the inner floor with the image (scaled down to fit the original 10x10 area)
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

    // Ceiling expanded to totalAreaSize
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(totalAreaSize, totalAreaSize), new THREE.MeshPhongMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallHeight;
    scene.add(ceiling);
    
    // Walls remain 10x10 (Inner Room)
    const innerWallMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });
    const northWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), innerWallMaterial);
    northWall.position.set(0, wallHeight / 2, -roomSize / 2);
    scene.add(northWall);
    const southWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), innerWallMaterial);
    southWall.rotation.y = Math.PI;
    southWall.position.set(0, wallHeight / 2, roomSize / 2);
    scene.add(southWall);
    const eastWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), innerWallMaterial);
    eastWall.rotation.y = -Math.PI / 2;
    eastWall.position.set(roomSize / 2, wallHeight / 2, 0);
    scene.add(eastWall);
    const westWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), innerWallMaterial);
    westWall.rotation.y = Math.PI / 2;
    westWall.position.set(-roomSize / 2, wallHeight / 2, 0);
    scene.add(westWall);

    const outerWallMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });
    
    // --- 30x30 Outer Room Walls ---
    const outerRoomSize = 30;
    const outerWallPosition = outerRoomSize / 2; // 15
    const outerWallSegmentLength = 10;
    const outerWallGeometry = new THREE.PlaneGeometry(outerWallSegmentLength, wallHeight);
    
    // North Outer Wall (Z = -15)
    const northOuterWall1 = new THREE.Mesh(outerWallGeometry, outerWallMaterial);
    northOuterWall1.position.set(-outerWallSegmentLength / 2 - 5, wallHeight / 2, -outerWallPosition); // X = -10
    scene.add(northOuterWall1);
    
    const northOuterWall2 = new THREE.Mesh(outerWallGeometry, outerWallMaterial);
    northOuterWall2.position.set(outerWallSegmentLength / 2 + 5, wallHeight / 2, -outerWallPosition); // X = 10
    scene.add(northOuterWall2);

    // South Outer Wall (Z = 15)
    const southOuterWall1 = new THREE.Mesh(outerWallGeometry, outerWallMaterial);
    southOuterWall1.rotation.y = Math.PI;
    southOuterWall1.position.set(-outerWallSegmentLength / 2 - 5, wallHeight / 2, outerWallPosition); // X = -10
    scene.add(southOuterWall1);
    
    const southOuterWall2 = new THREE.Mesh(outerWallGeometry, outerWallMaterial);
    southOuterWall2.rotation.y = Math.PI;
    southOuterWall2.position.set(outerWallSegmentLength / 2 + 5, wallHeight / 2, outerWallPosition); // X = 10
    scene.add(southOuterWall2);

    // East Outer Wall (X = 15)
    const eastOuterWall1 = new THREE.Mesh(outerWallGeometry, outerWallMaterial);
    eastOuterWall1.rotation.y = -Math.PI / 2;
    eastOuterWall1.position.set(outerWallPosition, wallHeight / 2, -outerWallSegmentLength / 2 - 5); // Z = -10
    scene.add(eastOuterWall1);
    
    const eastOuterWall2 = new THREE.Mesh(outerWallGeometry, outerWallMaterial);
    eastOuterWall2.rotation.y = -Math.PI / 2;
    eastOuterWall2.position.set(outerWallPosition, wallHeight / 2, outerWallSegmentLength / 2 + 5); // Z = 10
    scene.add(eastOuterWall2);

    // West Outer Wall (X = -15)
    const westOuterWall1 = new THREE.Mesh(outerWallGeometry, outerWallMaterial);
    westOuterWall1.rotation.y = Math.PI / 2;
    westOuterWall1.position.set(-outerWallPosition, wallHeight / 2, -outerWallSegmentLength / 2 - 5); // Z = -10
    scene.add(westOuterWall1);
    
    const westOuterWall2 = new THREE.Mesh(outerWallGeometry, outerWallMaterial);
    westOuterWall2.rotation.y = Math.PI / 2;
    westOuterWall2.position.set(-outerWallPosition, wallHeight / 2, outerWallSegmentLength / 2 + 5); // Z = 10
    scene.add(westOuterWall2);
    // --- End 30x30 Outer Room Walls ---
    
    // --- 50x50 Outer Room Walls ---
    const outerRoomSize2 = 50;
    const outerWallPosition2 = outerRoomSize2 / 2; // 25
    const outerWallSegmentLength2 = 10; // Corrected length: 50 total - 30 gap = 20 remaining. 2 segments of 10.
    const outerWallGeometry2 = new THREE.PlaneGeometry(outerWallSegmentLength2, wallHeight);

    // North Outer Wall (Z = -25)
    const northOuterWall3 = new THREE.Mesh(outerWallGeometry2, outerWallMaterial);
    // Center at X = -20 (from -25 to -15)
    northOuterWall3.position.set(-20, wallHeight / 2, -outerWallPosition2); 
    scene.add(northOuterWall3);
    
    const northOuterWall4 = new THREE.Mesh(outerWallGeometry2, outerWallMaterial);
    // Center at X = 20 (from 15 to 25)
    northOuterWall4.position.set(20, wallHeight / 2, -outerWallPosition2); 
    scene.add(northOuterWall4);

    // South Outer Wall (Z = 25)
    const southOuterWall3 = new THREE.Mesh(outerWallGeometry2, outerWallMaterial);
    southOuterWall3.rotation.y = Math.PI;
    southOuterWall3.position.set(-20, wallHeight / 2, outerWallPosition2); 
    scene.add(southOuterWall3);
    
    const southOuterWall4 = new THREE.Mesh(outerWallGeometry2, outerWallMaterial);
    southOuterWall4.rotation.y = Math.PI;
    southOuterWall4.position.set(20, wallHeight / 2, outerWallPosition2); 
    scene.add(southOuterWall4);

    // East Outer Wall (X = 25)
    const eastOuterWall3 = new THREE.Mesh(outerWallGeometry2, outerWallMaterial);
    eastOuterWall3.rotation.y = -Math.PI / 2;
    eastOuterWall3.position.set(outerWallPosition2, wallHeight / 2, -20); // Z = -20
    scene.add(eastOuterWall3);
    
    const eastOuterWall4 = new THREE.Mesh(outerWallGeometry2, outerWallMaterial);
    eastOuterWall4.rotation.y = -Math.PI / 2;
    eastOuterWall4.position.set(outerWallPosition2, wallHeight / 2, 20); // Z = 20
    scene.add(eastOuterWall4);

    // West Outer Wall (X = -25)
    const westOuterWall3 = new THREE.Mesh(outerWallGeometry2, outerWallMaterial);
    westOuterWall3.rotation.y = Math.PI / 2;
    westOuterWall3.position.set(-outerWallPosition2, wallHeight / 2, -20); // Z = -20
    scene.add(westOuterWall3);
    
    const westOuterWall4 = new THREE.Mesh(outerWallGeometry2, outerWallMaterial);
    westOuterWall4.rotation.y = Math.PI / 2;
    westOuterWall4.position.set(-outerWallPosition2, wallHeight / 2, 20); // Z = 20
    scene.add(westOuterWall4);
    // --- End 50x50 Outer Room Walls ---
    
    // --- 70x70 Outer Room Walls (Continuous) ---
    const outerRoomSize3 = 70;
    const outerWallPosition3 = outerRoomSize3 / 2; // 35
    const outerWallGeometry3 = new THREE.PlaneGeometry(outerRoomSize3, wallHeight); // Full 70 unit length

    // North Outer Wall (Z = -35)
    const northOuterWall5 = new THREE.Mesh(outerWallGeometry3, outerWallMaterial);
    northOuterWall5.position.set(0, wallHeight / 2, -outerWallPosition3); 
    scene.add(northOuterWall5);
    
    // South Outer Wall (Z = 35)
    const southOuterWall5 = new THREE.Mesh(outerWallGeometry3, outerWallMaterial);
    southOuterWall5.rotation.y = Math.PI;
    southOuterWall5.position.set(0, wallHeight / 2, outerWallPosition3); 
    scene.add(southOuterWall5);

    // East Outer Wall (X = 35)
    const eastOuterWall5 = new THREE.Mesh(outerWallGeometry3, outerWallMaterial);
    eastOuterWall5.rotation.y = -Math.PI / 2;
    eastOuterWall5.position.set(outerWallPosition3, wallHeight / 2, 0); 
    scene.add(eastOuterWall5);
    
    // West Outer Wall (X = -35)
    const westOuterWall5 = new THREE.Mesh(outerWallGeometry3, outerWallMaterial);
    westOuterWall5.rotation.y = Math.PI / 2;
    westOuterWall5.position.set(-outerWallPosition3, wallHeight / 2, 0); 
    scene.add(westOuterWall5);
    // --- End 70x70 Outer Room Walls ---


    // Ambient Light Setup
    const ambientLight = new THREE.AmbientLight(0x404050, 0.3);
    ambientLightRef.current = ambientLight;
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.2);
    hemiLight.position.set(0, wallHeight, 0);
    scene.add(hemiLight);

    // Add glowing cove lighting 
    const coveLightColor = 0x87CEEB; // A soft sky blue glow
    const coveLightIntensity = 10;
    const coveLightHeight = 0.1;
    const yPos = wallHeight - 0.1;
    const offset = 0.1;

    const createCoveLighting = (
        position: [number, number, number],
        rotation: [number, number, number],
        width: number,
        order: THREE.EulerOrder = 'XYZ'
    ) => {
        const rectLight = new THREE.RectAreaLight(coveLightColor, coveLightIntensity, width, coveLightHeight);
        rectLight.position.set(...position);
        rectLight.rotation.set(rotation[0], rotation[1], rotation[2], order);
        scene.add(rectLight);

        const glowGeo = new THREE.BoxGeometry(width, coveLightHeight, 0.02);
        const glowMat = new THREE.MeshBasicMaterial({ color: coveLightColor, toneMapped: false });
        const glowMesh = new THREE.Mesh(glowGeo, glowMat);
        glowMesh.position.set(...position);
        glowMesh.rotation.set(rotation[0], rotation[1], rotation[2], order);
        scene.add(glowMesh);
    };

    // Inner Room (10x10)
    createCoveLighting([0, yPos, -roomSize / 2 + offset], [Math.PI / 2, 0, 0], roomSize); // North
    createCoveLighting([0, yPos, roomSize / 2 - offset], [-Math.PI / 2, 0, 0], roomSize); // South
    createCoveLighting([roomSize / 2 - offset, yPos, 0], [-Math.PI / 2, -Math.PI / 2, 0], roomSize, 'YXZ'); // East
    createCoveLighting([-roomSize / 2 + offset, yPos, 0], [-Math.PI / 2, Math.PI / 2, 0], roomSize, 'YXZ'); // West
    
    // Outer Boundary (70x70)
    const outerCoveWidth = totalAreaSize; // 70
    const outerOffset = 0.1;
    const outerWallPos = boundary; // 35

    // North Outer Boundary (Z = -35)
    createCoveLighting([0, yPos, -outerWallPos + outerOffset], [Math.PI / 2, 0, 0], outerCoveWidth);
    // South Outer Boundary (Z = 35)
    createCoveLighting([0, yPos, outerWallPos - outerOffset], [-Math.PI / 2, 0, 0], outerCoveWidth);
    // East Outer Boundary (X = 35)
    createCoveLighting([outerWallPos - outerOffset, yPos, 0], [-Math.PI / 2, -Math.PI / 2, 0], outerCoveWidth, 'YXZ');
    // West Outer Boundary (X = -35)
    createCoveLighting([-outerWallPos + outerOffset, yPos, 0], [-Math.PI / 2, Math.PI / 2, 0], outerCoveWidth, 'YXZ');


    const panelGeometry = new THREE.PlaneGeometry(2, 2);
    const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15); arrowShape.lineTo(0.3, 0); arrowShape.lineTo(0, -0.15); arrowShape.lineTo(0, 0.15);
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const ARROW_COLOR_DEFAULT = 0xcccccc, ARROW_COLOR_HOVER = 0x00ff00;
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: ARROW_COLOR_DEFAULT, side: THREE.DoubleSide });
    const ARROW_DEPTH_OFFSET = 0.02, ARROW_PANEL_OFFSET = 1.5, TEXT_DEPTH_OFFSET = 0.03;
    const TEXT_PANEL_OFFSET_X = 3.25; // Offset for description/attributes panels
    const TITLE_PANEL_WIDTH = 4.0; // Doubled width for NFT title
    const { texture: placeholderTexture } = createTextTexture('Loading...', TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, 'white', { wordWrap: false });
    const placeholderMaterial = new THREE.MeshBasicMaterial({ map: placeholderTexture, transparent: true, side: THREE.DoubleSide, alphaTest: 0.01, depthWrite: false });
    const titleGeometry = new THREE.PlaneGeometry(TITLE_PANEL_WIDTH, TITLE_HEIGHT);
    const descriptionGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT);
    
    // Helper function to determine panel placement based on wall name
    const getPanelPlacement = (wallName: keyof PanelConfig) => {
        if (wallName === 'north-wall') return { position: [0, panelYPosition, -roomSize / 2 + ARROW_DEPTH_OFFSET], rotation: [0, 0, 0] };
        if (wallName === 'south-wall') return { position: [0, panelYPosition, roomSize / 2 - ARROW_DEPTH_OFFSET], rotation: [0, Math.PI, 0] };
        if (wallName === 'east-wall') return { position: [roomSize / 2 - ARROW_DEPTH_OFFSET, panelYPosition, 0], rotation: [0, -Math.PI / 2, 0] };
        if (wallName === 'west-wall') return { position: [-roomSize / 2 + ARROW_DEPTH_OFFSET, panelYPosition, 0], rotation: [0, Math.PI / 2, 0] };

        // Handle outer walls: wall-[Direction]-[Coord]-X/Z[Position]
        const parts = wallName.split('-');
        if (parts.length !== 5 || parts[0] !== 'wall') {
            // This should not happen if galleryConfig is generated correctly
            return null;
        }
        
        const direction = parts[1]; // N, S, E, W
        const coord = parseFloat(parts[2]); // 15, 25, 35
        const axis = parts[3]; // X or Z
        const positionValue = parseFloat(parts[4].substring(axis.length)); 

        let x = 0, z = 0, rotationY = 0;

        if (direction === 'N') {
            z = -coord + ARROW_DEPTH_OFFSET;
            x = positionValue;
            rotationY = 0; // Facing +Z
        } else if (direction === 'S') {
            z = coord - ARROW_DEPTH_OFFSET;
            x = positionValue;
            rotationY = Math.PI; // Facing -Z
        } else if (direction === 'E') {
            x = coord - ARROW_DEPTH_OFFSET;
            z = positionValue;
            rotationY = -Math.PI / 2; // Facing -X
        } else if (direction === 'W') {
            x = -coord + ARROW_DEPTH_OFFSET;
            z = positionValue;
            rotationY = Math.PI / 2; // Facing +X
        } else {
            return null;
        }

        return { position: [x, panelYPosition, z], rotation: [0, rotationY, 0] };
    };


    // --- Initialize Panels ---
    panelsRef.current = []; 
    const interactiveMeshes: THREE.Mesh[] = [];

    Object.keys(GALLERY_PANEL_CONFIG).forEach(wallName => {
      const config = getPanelPlacement(wallName as keyof PanelConfig);
      if (!config) return;

      const mesh = new THREE.Mesh(panelGeometry, panelMaterial.clone());
      mesh.position.set(config.position[0], config.position[1], config.position[2]);
      mesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      scene.add(mesh);
      
      const wallRotation = new THREE.Euler(config.rotation[0], config.rotation[1], config.rotation[2], 'XYZ');
      const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);
      const upVector = new THREE.Vector3(0, 1, 0).applyEuler(wallRotation);
      const forwardVector = new THREE.Vector3(0, 0, 1).applyEuler(wallRotation);
      
      const basePosition = new THREE.Vector3(config.position[0], config.position[1], config.position[2]);
      
      const titleMesh = new THREE.Mesh(titleGeometry, placeholderMaterial.clone());
      titleMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const titleYOffset = -1 - (TITLE_HEIGHT / 2) - 0.1; // panel half-height (1) + title half-height + gap
      const titlePosition = basePosition.clone()
          .addScaledVector(upVector, titleYOffset)
          .addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      titleMesh.position.copy(titlePosition);
      scene.add(titleMesh);

      // Description Panel (Left side)
      const textGroupPosition = basePosition.clone().addScaledVector(rightVector, -TEXT_PANEL_OFFSET_X);
      const descriptionMesh = new THREE.Mesh(descriptionGeometry, placeholderMaterial.clone());
      descriptionMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const descriptionPosition = textGroupPosition.clone().addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      descriptionMesh.position.copy(descriptionPosition);
      scene.add(descriptionMesh);
      
      // Note: Arrow rotations are relative to the panel's rotation.
      // Prev arrow needs to point left (relative to viewer), so it's rotated PI relative to the panel's forward direction.
      const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      prevArrow.rotation.set(config.rotation[0], config.rotation[1] + Math.PI, config.rotation[2]);
      const prevPosition = new THREE.Vector3(config.position[0], config.position[1], config.position[2]).addScaledVector(rightVector, -ARROW_PANEL_OFFSET);
      prevArrow.position.copy(prevPosition);
      scene.add(prevArrow);
      
      const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      nextArrow.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const nextPosition = new THREE.Vector3(config.position[0], config.position[1], config.position[2]).addScaledVector(rightVector, ARROW_PANEL_OFFSET);
      nextArrow.position.copy(nextPosition);
      scene.add(nextArrow);

      // Attributes Panel (Right side)
      const collectionInfoGroupPosition = basePosition.clone().addScaledVector(rightVector, TEXT_PANEL_OFFSET_X);
      const attributesGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT);
      const attributesMesh = new THREE.Mesh(attributesGeometry, placeholderMaterial.clone());
      attributesMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const attributesPosition = collectionInfoGroupPosition.clone().addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      attributesMesh.position.copy(attributesPosition);
      scene.add(attributesMesh);

      const wallTitleGeometry = new THREE.PlaneGeometry(8, 0.75); // Doubled width for wall title
      const wallTitleMesh = new THREE.Mesh(wallTitleGeometry, placeholderMaterial.clone());
      wallTitleMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const wallTitlePosition = new THREE.Vector3(config.position[0], config.position[1], config.position[2]);
      wallTitlePosition.y = 3.2; // Position it above the main panel
      wallTitleMesh.position.copy(wallTitlePosition);
      scene.add(wallTitleMesh);

      const panel: Panel = {
        mesh, wallName: wallName as keyof PanelConfig, metadataUrl: '', isVideo: false, prevArrow, nextArrow, titleMesh, descriptionMesh,
        attributesMesh, wallTitleMesh, currentDescription: '', descriptionScrollY: 0, descriptionTextHeight: 0, currentAttributes: [],
      };
      panelsRef.current.push(panel);
      
      interactiveMeshes.push(mesh, prevArrow, nextArrow, descriptionMesh);
    });
    // --- End Initialize Panels ---


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

    const updateDescriptionTexture = (panel: Panel) => {
      if (panel.descriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.descriptionMesh.material.map) {
        panel.descriptionMesh.material.map.dispose();
      }
      const { texture } = createTextTexture(panel.currentDescription, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, 'lightgray', { wordWrap: true, scrollY: panel.descriptionScrollY });
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

    let prevTime = performance.now();
    
    const animate = () => {
      requestAnimationFrame(animate);
      const time = performance.now(), delta = (time - prevTime) / 1000;
      
      // Ambient light color shift (slowly cycle hue)
      if (ambientLightRef.current) {
        // Cycle hue from 0 to 1 over 60 seconds (0.0000166 * 60 * 1000 = 1)
        const hue = (time * 0.0000166) % 1; 
        ambientLightRef.current.color.setHSL(hue, 0.5, 0.5); // Saturation 0.5, Lightness 0.5
      }

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