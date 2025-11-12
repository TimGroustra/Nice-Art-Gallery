import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache'; // <-- Updated import
import { normalizeUrl, NftMetadata, NftSource, NftAttribute } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';

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

// Helper function to create a text texture using Canvas
const createTextTexture = (text: string, width: number, height: number, fontSize: number = 30, color: string = 'white', options: { scrollY?: number, wordWrap?: boolean } = {}): { texture: THREE.CanvasTexture, totalHeight: number } => {
    const { scrollY = 0, wordWrap = false } = options;
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
    
    const padding = 40;
    const lineHeight = actualFontSize * 1.2;
    let totalHeight = 0;

    if (wordWrap) {
        context.textAlign = 'left';
        context.textBaseline = 'top';
        let y = padding;
        const words = text.split(' ');
        let line = '';
        const maxTextWidth = canvas.width - 2 * padding;

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
        totalHeight = y + lineHeight - padding;
    } else {
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        totalHeight = lineHeight;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return { texture, totalHeight };
};

const createAttributesTextTexture = (attributes: NftAttribute[], width: number, height: number, fontSize: number, color: string = 'white'): { texture: THREE.CanvasTexture } => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return { texture: new THREE.CanvasTexture(document.createElement('canvas')) };

    const resolution = 512;
    canvas.width = resolution * (width / height);
    canvas.height = resolution;

    context.clearRect(0, 0, canvas.width, canvas.height);

    context.font = `bold ${fontSize}px Arial`;
    context.fillStyle = color;
    context.textAlign = 'left';
    context.textBaseline = 'top';

    const padding = 40;
    const lineHeight = fontSize * 1.2;
    let y = padding;
    const maxTextWidth = canvas.width - 2 * padding;

    if (!attributes || attributes.length === 0) {
        context.fillText('No attributes found.', padding, y);
    } else {
        attributes.forEach(attr => {
            if (attr.trait_type && attr.value) {
                const line = `${attr.trait_type}: ${attr.value}`;
                
                // Word wrapping logic
                const words = line.split(' ');
                let currentLine = '';
                for (let n = 0; n < words.length; n++) {
                    const testLine = currentLine + words[n] + ' ';
                    const metrics = context.measureText(testLine);
                    const testWidth = metrics.width;
                    if (testWidth > maxTextWidth && n > 0) {
                        context.fillText(currentLine, padding, y);
                        currentLine = words[n] + ' ';
                        y += lineHeight;
                    } else {
                        currentLine = testLine;
                    }
                }
                context.fillText(currentLine, padding, y);
                y += lineHeight;
            }
        });
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return { texture };
};

// Helper function to load texture asynchronously using Promises
const loadTextureAsync = (url: string, isVideo: boolean, videoElement: HTMLVideoElement | null, manageVideoPlayback: (shouldPlay: boolean) => void): Promise<THREE.Texture | THREE.VideoTexture> => {
    return new Promise((resolve, reject) => {
        if (isVideo) {
            if (videoElement) {
                videoElement.pause();
                videoElement.src = url;
                videoElement.load();
                videoElement.loop = true;
                videoElement.muted = true; 
                if ((window as any).galleryControls?.isLocked?.()) {
                     manageVideoPlayback(true);
                }
                // VideoTexture creation is synchronous, but playback relies on the video element
                resolve(new THREE.VideoTexture(videoElement));
            } else {
                reject(new Error("Video element not available."));
            }
        } else {
            const loader = new THREE.TextureLoader();
            loader.load(
                url,
                (texture) => resolve(texture),
                undefined,
                (error) => {
                    reject(new Error(`Failed to load image texture: ${url}. Error: ${error.message}`));
                }
            );
        }
    });
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

  const updatePanelContent = useCallback(async (panel: Panel, source: NftSource) => {
    // Helper function to reset panel to placeholder state
    const resetPanel = () => {
        if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
            panel.mesh.material.map?.dispose();
            panel.mesh.material.dispose();
        }
        // Use a distinct color for failed loads
        panel.mesh.material = new THREE.MeshBasicMaterial({ color: 0x880000, side: THREE.DoubleSide }); 
        panel.metadataUrl = '';
        panel.isVideo = false;
        if (panel.titleMesh) panel.titleMesh.visible = false;
        if (panel.descriptionMesh) panel.descriptionMesh.visible = false;
        if (panel.attributesMesh) panel.attributesMesh.visible = false;
        if (panel.wallTitleMesh) panel.wallTitleMesh.visible = false;
    };

    try {
      // 1. Fetch Metadata (Cached)
      const metadata: NftMetadata = await getCachedNftMetadata(source.contractAddress, source.tokenId);
      const collectionName = GALLERY_PANEL_CONFIG[panel.wallName]?.name || '...';
      
      const imageUrl = metadata.image;
      const isVideo = imageUrl.endsWith('.mp4') || imageUrl.endsWith('.webm') || imageUrl.endsWith('.ogg');
      
      if (isVideo && videoRef.current) manageVideoPlayback(false);

      // 2. Load Texture (Async/Awaited)
      const texture = await loadTextureAsync(imageUrl, isVideo, videoRef.current, manageVideoPlayback);
      
      // 3. Apply Texture
      if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
        panel.mesh.material.map?.dispose();
        panel.mesh.material.dispose();
      }

      panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
      panel.metadataUrl = metadata.source;
      panel.isVideo = isVideo;

      // 4. Update Text Panels
      
      // Title
      if (panel.titleMesh.material instanceof THREE.MeshBasicMaterial && panel.titleMesh.material.map) {
        panel.titleMesh.material.map.dispose();
      }
      const { texture: titleTexture } = createTextTexture(metadata.title, 4.0, 0.5, 120, 'white', { wordWrap: false });
      (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTexture;
      panel.titleMesh.visible = true;

      // Description
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

      // Attributes
      if (panel.attributesMesh.material instanceof THREE.MeshBasicMaterial && panel.attributesMesh.material.map) {
          panel.attributesMesh.material.map.dispose();
      }
      const attributes = metadata.attributes || [];
      panel.currentAttributes = attributes;
      const { texture: attributesTexture } = createAttributesTextTexture(attributes, TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT, 40, 'lightgray');
      (panel.attributesMesh.material as THREE.MeshBasicMaterial).map = attributesTexture;
      panel.attributesMesh.visible = true;

      // Wall Title
      if (panel.wallTitleMesh.material instanceof THREE.MeshBasicMaterial && panel.wallTitleMesh.material.map) {
        panel.wallTitleMesh.material.map.dispose();
      }
      const { texture: wallTitleTexture } = createTextTexture(collectionName, 8, 0.75, 120, 'white', { wordWrap: false });
      (panel.wallTitleMesh.material as THREE.MeshBasicMaterial).map = wallTitleTexture;
      panel.wallTitleMesh.visible = true;

      showSuccess(isVideo ? `Loaded video NFT: ${metadata.title}` : `Loaded image NFT: ${metadata.title}`);
      
    } catch (error) {
      console.error(`Error updating panel ${panel.wallName} for token ${source.tokenId}:`, error);
      showError(`Failed to load NFT for ${panel.wallName}.`);
      
      // Reset panel to distinct failure color upon failure
      resetPanel();
    }
  }, [manageVideoPlayback]);

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

    // --- ROOM GEOMETRY SETUP (70x70) ---
    const ROOM_SEGMENT_SIZE = 10;
    const NUM_SEGMENTS = 7;
    const ROOM_SIZE = ROOM_SEGMENT_SIZE * NUM_SEGMENTS; // 70
    const WALL_HEIGHT = 4;
    const PANEL_Y_POSITION = 1.8;
    const BOUNDARY = ROOM_SIZE / 2 - 0.5; // 34.5

    const roomSize = ROOM_SIZE, wallHeight = WALL_HEIGHT, panelYPosition = PANEL_Y_POSITION, boundary = BOUNDARY;
    const halfRoomSize = ROOM_SIZE / 2;
    
    const segmentGeometry = new THREE.PlaneGeometry(ROOM_SEGMENT_SIZE, ROOM_SEGMENT_SIZE);
    const wallSegmentGeometry = new THREE.PlaneGeometry(ROOM_SEGMENT_SIZE, WALL_HEIGHT);
    const outerFloorMaterial = new THREE.MeshPhongMaterial({ color: 0xF5F5F5, side: THREE.DoubleSide });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });

    // 1. Create Modular Floor and Ceiling
    for (let i = 0; i < NUM_SEGMENTS; i++) {
        for (let j = 0; j < NUM_SEGMENTS; j++) {
            const segmentCenter = (i - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;
            const segmentCenterZ = (j - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;

            // Outer Floor Segment
            const outerFloor = new THREE.Mesh(segmentGeometry, outerFloorMaterial);
            outerFloor.rotation.x = Math.PI / 2;
            outerFloor.position.x = segmentCenter;
            outerFloor.position.z = segmentCenterZ;
            scene.add(outerFloor);

            // Ceiling Segment
            const ceiling = new THREE.Mesh(segmentGeometry, new THREE.MeshPhongMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
            ceiling.rotation.x = Math.PI / 2;
            ceiling.position.x = segmentCenter;
            ceiling.position.z = segmentCenterZ;
            ceiling.position.y = wallHeight;
            scene.add(ceiling);
        }
    }

    // 2. Inner Floor (using a single large plane with repeated texture)
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('/floor.jpg', (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(NUM_SEGMENTS, NUM_SEGMENTS); 

        const innerFloorGeometry = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
        const innerFloorMaterial = new THREE.MeshPhongMaterial({ map: texture, side: THREE.DoubleSide });
        const innerFloor = new THREE.Mesh(innerFloorGeometry, innerFloorMaterial);
        
        innerFloor.rotation.x = Math.PI / 2;
        innerFloor.position.y = 0.01; 
        scene.add(innerFloor);
    });

    // 3. Create Modular Walls
    for (let i = 0; i < NUM_SEGMENTS; i++) {
        const segmentCenter = (i - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;

        // North Wall Segments (Z = -halfRoomSize)
        const northWall = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
        northWall.position.set(segmentCenter, WALL_HEIGHT / 2, -halfRoomSize);
        scene.add(northWall);

        // South Wall Segments (Z = halfRoomSize)
        const southWall = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
        southWall.rotation.y = Math.PI;
        southWall.position.set(segmentCenter, WALL_HEIGHT / 2, halfRoomSize);
        scene.add(southWall);

        // East Wall Segments (X = halfRoomSize)
        const eastWall = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
        eastWall.rotation.y = -Math.PI / 2;
        eastWall.position.set(halfRoomSize, WALL_HEIGHT / 2, segmentCenter);
        scene.add(eastWall);

        // West Wall Segments (X = -halfRoomSize)
        const westWall = new THREE.Mesh(wallSegmentGeometry, wallMaterial.clone());
        westWall.rotation.y = Math.PI / 2;
        westWall.position.set(-halfRoomSize, WALL_HEIGHT / 2, segmentCenter);
        scene.add(westWall);
    }

    // 4. Lighting Setup
    const lights: THREE.PointLight[] = [];
    const NUM_DISCO_LIGHTS = 10; 
    const discoLightHeight = 3.5; 
    const lightColors = [0xff0066, 0x00ffd5, 0xffff00, 0x66ff00, 0x0066ff]; 
    const lightRadius = ROOM_SIZE * 0.4; 
    const lightDistance = ROOM_SIZE * 1.5; 
    const lightDecay = 1.5; 

    for (let i = 0; i < NUM_DISCO_LIGHTS; i++) {
      const colorIndex = i % lightColors.length;
      const pl = new THREE.PointLight(lightColors[colorIndex], 1.5, lightDistance, lightDecay);
      pl.position.set(
        Math.cos(i / NUM_DISCO_LIGHTS * Math.PI * 2) * lightRadius, 
        discoLightHeight, 
        Math.sin(i / NUM_DISCO_LIGHTS * Math.PI * 2) * lightRadius
      );
      scene.add(pl);
      lights.push(pl);
    }
    scene.add(new THREE.AmbientLight(0x404050, 0.5));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.2);
    hemiLight.position.set(0, WALL_HEIGHT, 0);
    scene.add(hemiLight);

    // 5. Cove Lighting (Modular)
    const coveLightColor = 0x87CEEB; 
    const coveLightIntensity = 10;
    const coveLightWidth = ROOM_SEGMENT_SIZE; 
    const coveLightHeight = 0.1;
    const offset = 0.1;
    const yPos = WALL_HEIGHT - 0.1;

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

    for (let i = 0; i < NUM_SEGMENTS; i++) {
        const segmentCenter = (i - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE;

        // North
        createCoveLighting([segmentCenter, yPos, -halfRoomSize + offset], [Math.PI / 2, 0, 0]);
        // South
        createCoveLighting([segmentCenter, yPos, halfRoomSize - offset], [-Math.PI / 2, 0, 0]);
        
        // East
        createCoveLighting([halfRoomSize - offset, yPos, segmentCenter], [-Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
        // West
        createCoveLighting([-halfRoomSize + offset, yPos, segmentCenter], [-Math.PI / 2, Math.PI / 2, 0], 'YXZ');
    }
    // --- END ROOM GEOMETRY SETUP ---


    const panelGeometry = new THREE.PlaneGeometry(2, 2);
    // Use a distinct initial color (e.g., light gray) for the main panel before loading starts
    const initialPanelMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide }); 
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
    
    // Geometries defined once outside the loop
    const titleGeometry = new THREE.PlaneGeometry(TITLE_PANEL_WIDTH, TITLE_HEIGHT);
    const descriptionGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT);
    const attributesGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT);
    const wallTitleGeometry = new THREE.PlaneGeometry(8, 0.75); 

    // Dynamic Panel Configuration Generation
    const WALL_ROTATIONS: { [key: string]: [number, number, number] } = {
        'north-wall': [0, 0, 0],
        'south-wall': [0, Math.PI, 0],
        'east-wall': [0, -Math.PI / 2, 0],
        'west-wall': [0, Math.PI / 2, 0],
    };

    const WALL_AXIS_MAP: { [key: string]: { axis: 'x' | 'z', sign: 1 | -1 } } = {
        'north-wall': { axis: 'z', sign: -1 }, // Z = -halfRoomSize
        'south-wall': { axis: 'z', sign: 1 },  // Z = halfRoomSize
        'east-wall': { axis: 'x', sign: 1 },   // X = halfRoomSize
        'west-wall': { axis: 'x', sign: -1 },  // X = -halfRoomSize
    };

    const dynamicPanelConfigs: { wallName: keyof PanelConfig, position: [number, number, number], rotation: [number, number, number] }[] = [];

    // Iterate over the 7 segments
    for (let i = 0; i < NUM_SEGMENTS; i++) {
        // Calculate the center position of the segment along the wall axis
        const segmentCenter = (i - (NUM_SEGMENTS - 1) / 2) * ROOM_SEGMENT_SIZE; // -30, -20, ..., 30

        // Iterate over the 4 walls
        for (const wallNameBase of ['north-wall', 'south-wall', 'east-wall', 'west-wall']) {
            const panelKey = `${wallNameBase}-${i}` as keyof PanelConfig;
            
            // Check if this panel key exists in the configuration
            if (!GALLERY_PANEL_CONFIG[panelKey]) continue;

            const rotation = WALL_ROTATIONS[wallNameBase];
            const map = WALL_AXIS_MAP[wallNameBase];
            
            let x = 0, z = 0;
            
            if (map.axis === 'z') {
                x = segmentCenter;
                z = map.sign * halfRoomSize;
            } else { // map.axis === 'x'
                x = map.sign * halfRoomSize;
                z = segmentCenter;
            }

            // Calculate offset to push the panel slightly into the room (opposite direction of wall sign)
            const depthOffset = -map.sign * ARROW_DEPTH_OFFSET;

            dynamicPanelConfigs.push({
                wallName: panelKey,
                // Apply depth offset
                position: [x + (map.axis === 'x' ? depthOffset : 0), panelYPosition, z + (map.axis === 'z' ? depthOffset : 0)],
                rotation: rotation,
            });
        }
    }

    // Clear existing panels before populating
    panelsRef.current = [];

    dynamicPanelConfigs.forEach(config => {
      const mesh = new THREE.Mesh(panelGeometry, initialPanelMaterial.clone());
      mesh.position.set(config.position[0], config.position[1], config.position[2]);
      mesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      scene.add(mesh);
      
      const wallRotation = new THREE.Euler(config.rotation[0], config.rotation[1], config.rotation[2], 'XYZ');
      const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);
      const upVector = new THREE.Vector3(0, 1, 0).applyEuler(wallRotation);
      const forwardVector = new THREE.Vector3(0, 0, 1).applyEuler(wallRotation);
      
      // FIX: Initialize basePosition using indexed access
      const basePosition = new THREE.Vector3(config.position[0], config.position[1], config.position[2]);
      
      const titleMesh = new THREE.Mesh(titleGeometry, placeholderMaterial.clone());
      titleMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const titleYOffset = -1 - (TITLE_HEIGHT / 2) - 0.1; // panel half-height (1) + title half-height + gap
      const titlePosition = basePosition.clone()
          .addScaledVector(upVector, titleYOffset)
          .addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      titleMesh.position.copy(titlePosition);
      scene.add(titleMesh);

      // Description Panel (Left side relative to the NFT panel)
      const textGroupPosition = basePosition.clone().addScaledVector(rightVector, -TEXT_PANEL_OFFSET_X);
      const descriptionMesh = new THREE.Mesh(descriptionGeometry, placeholderMaterial.clone());
      descriptionMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const descriptionPosition = textGroupPosition.clone().addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      descriptionMesh.position.copy(descriptionPosition);
      scene.add(descriptionMesh);
      
      const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      prevArrow.rotation.set(config.rotation[0], config.rotation[1] + Math.PI, config.rotation[2]);
      // FIX: Initialize prevPosition using indexed access
      const prevPosition = new THREE.Vector3(config.position[0], config.position[1], config.position[2]).addScaledVector(rightVector, -ARROW_PANEL_OFFSET);
      prevArrow.position.copy(prevPosition);
      scene.add(prevArrow);
      
      const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      nextArrow.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      // FIX: Initialize nextPosition using indexed access
      const nextPosition = new THREE.Vector3(config.position[0], config.position[1], config.position[2]).addScaledVector(rightVector, ARROW_PANEL_OFFSET);
      nextArrow.position.copy(nextPosition);
      scene.add(nextArrow);

      // Attributes Panel (Right side relative to the NFT panel)
      const collectionInfoGroupPosition = basePosition.clone().addScaledVector(rightVector, TEXT_PANEL_OFFSET_X);
      const attributesMesh = new THREE.Mesh(attributesGeometry, placeholderMaterial.clone());
      attributesMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const attributesPosition = collectionInfoGroupPosition.clone().addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      attributesMesh.position.copy(attributesPosition);
      scene.add(attributesMesh);

      const wallTitleMesh = new THREE.Mesh(wallTitleGeometry, placeholderMaterial.clone());
      wallTitleMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      // FIX: Initialize wallTitlePosition using indexed access
      const wallTitlePosition = new THREE.Vector3(config.position[0], config.position[1], config.position[2]);
      wallTitlePosition.y = 3.2; // Position it above the main panel
      wallTitleMesh.position.copy(wallTitlePosition);
      scene.add(wallTitleMesh);

      const panel: Panel = {
        mesh, wallName: config.wallName as keyof PanelConfig, metadataUrl: '', isVideo: false, prevArrow, nextArrow, titleMesh, descriptionMesh,
        attributesMesh, wallTitleMesh, currentDescription: '', descriptionScrollY: 0, descriptionTextHeight: 0, currentAttributes: [],
      };
      panelsRef.current.push(panel);
      
      // Initial load is handled after initialization completes below
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

    let prevTime = performance.now();
    const animate = () => {
      requestAnimationFrame(animate);
      const time = performance.now(), delta = (time - prevTime) / 1000;
      lights.forEach((light, i) => {
        const angle = time * 0.0005 + i * (Math.PI * 2 / NUM_DISCO_LIGHTS);
        light.position.x = Math.cos(angle) * lightRadius;
        light.position.z = Math.sin(angle) * lightRadius;
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