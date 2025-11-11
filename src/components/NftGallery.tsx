import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { fetchNftMetadata, normalizeUrl, NftMetadata, NftAttribute, NftSource } from '@/utils/nftFetcher';
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
const createTextTexture = (text: string, width: number, height: number, fontSize: number, color: string = 'white', options: { scrollY?: number, wordWrap?: boolean } = {}): { texture: THREE.CanvasTexture, totalHeight: number } => {
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

// Fallback texture for failed loads
const createFallbackTexture = (message: string, width: number, height: number): THREE.Texture => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return new THREE.Texture();

    const resolution = 512;
    canvas.width = resolution * (width / height);
    canvas.height = resolution;

    context.fillStyle = '#333333';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = 'bold 60px Arial';
    context.fillStyle = 'red';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(message, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
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

  const applyFallbackContent = useCallback((panel: Panel, collectionName: string, error: string) => {
    // 1. Update main mesh to show error
    if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
        panel.mesh.material.map?.dispose();
        panel.mesh.material.dispose();
    }
    panel.mesh.material = new THREE.MeshBasicMaterial({ map: createFallbackTexture(error, 2, 2), side: THREE.DoubleSide });
    panel.metadataUrl = '';
    panel.isVideo = false;

    // 2. Update title mesh
    if (panel.titleMesh.material instanceof THREE.MeshBasicMaterial && panel.titleMesh.material.map) {
        panel.titleMesh.material.map.dispose();
    }
    const { texture: titleTexture } = createTextTexture("NFT Load Failed", 4.0, 0.5, 120, 'red', { wordWrap: false });
    (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTexture;
    panel.titleMesh.visible = true;

    // 3. Update description mesh
    if (panel.descriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.descriptionMesh.material.map) {
        panel.descriptionMesh.material.map.dispose();
    }
    const { texture: descriptionTexture, totalHeight } = createTextTexture(`Error loading token ${GALLERY_PANEL_CONFIG[panel.wallName].tokenIds[GALLERY_PANEL_CONFIG[panel.wallName].currentIndex]}. Check console for details.`, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, 'red', { wordWrap: true });
    (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = descriptionTexture;
    panel.descriptionMesh.visible = true;
    panel.currentDescription = '';
    panel.descriptionTextHeight = totalHeight;
    panel.descriptionScrollY = 0;

    // 4. Update attributes mesh
    if (panel.attributesMesh.material instanceof THREE.MeshBasicMaterial && panel.attributesMesh.material.map) {
        panel.attributesMesh.material.map.dispose();
    }
    const { texture: attributesTexture } = createAttributesTextTexture([], TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT, 40, 'lightgray');
    (panel.attributesMesh.material as THREE.MeshBasicMaterial).map = attributesTexture;
    panel.attributesMesh.visible = true;
    panel.currentAttributes = [];

    // 5. Update wall title (this should still show the collection name)
    if (panel.wallTitleMesh.material instanceof THREE.MeshBasicMaterial && panel.wallTitleMesh.material.map) {
        panel.wallTitleMesh.material.map.dispose();
    }
    const { texture: wallTitleTexture } = createTextTexture(collectionName, 8, 0.75, 120, 'white', { wordWrap: false });
    (panel.wallTitleMesh.material as THREE.MeshBasicMaterial).map = wallTitleTexture;
    panel.wallTitleMesh.visible = true;

    showError(`Failed to load NFT for ${panel.wallName}.`);
  }, []);


  const updatePanelContent = useCallback(async (panel: Panel, source: NftSource) => {
    const collectionName = GALLERY_PANEL_CONFIG[panel.wallName]?.name || '...';
    
    try {
      const metadata: NftMetadata = await fetchNftMetadata(source.contractAddress, source.tokenId);
      
      const imageUrl = metadata.image;
      
      if (!imageUrl) {
          throw new Error("Image URL is missing in metadata.");
      }

      const isVideo = imageUrl.endsWith('.mp4') || imageUrl.endsWith('.webm') || imageUrl.endsWith('.ogg');
      
      if (isVideo && videoRef.current) manageVideoPlayback(false);

      const texture = loadTexture(imageUrl, isVideo);
      
      if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
        panel.mesh.material.map?.dispose();
        panel.mesh.material.dispose();
      }

      panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
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
      applyFallbackContent(panel, collectionName, "LOAD FAILED");
    }
  }, [loadTexture, manageVideoPlayback, applyFallbackContent]);

  useEffect(() => {
    if (!mountRef.current) return;

    RectAreaLightUniformsLib.init();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaaaaaa);
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 15); 
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

    const roomSize = 120, wallHeight = 4, panelYPosition = 1.8, boundary = roomSize / 2 - 0.5;
    
    // Create the floor
    const floorMaterial = new THREE.MeshPhongMaterial({ color: 0xF5F5F5, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), floorMaterial);
    floor.rotation.x = Math.PI / 2;
    scene.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, roomSize), new THREE.MeshPhongMaterial({ color: 0xcccccc, side: THREE.DoubleSide }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallHeight;
    scene.add(ceiling);
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });
    const northWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), wallMaterial);
    northWall.position.set(0, wallHeight / 2, -roomSize / 2);
    scene.add(northWall);
    const southWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), wallMaterial);
    southWall.rotation.y = Math.PI;
    southWall.position.set(0, wallHeight / 2, roomSize / 2);
    scene.add(southWall);
    const eastWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), wallMaterial);
    eastWall.rotation.y = Math.PI / 2;
    eastWall.position.set(roomSize / 2, wallHeight / 2, 0);
    scene.add(eastWall);
    const westWall = new THREE.Mesh(new THREE.PlaneGeometry(roomSize, wallHeight), wallMaterial);
    westWall.rotation.y = -Math.PI / 2;
    westWall.position.set(-roomSize / 2, wallHeight / 2, 0);
    scene.add(westWall);

    // --- Create Inner Room (85x85) ---
    const innerRoomSize = 85;
    const innerWallMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });
    const doorwayWidth = 10;
    const wallSegmentWidth = (innerRoomSize - doorwayWidth) / 2;
    const wallSegmentGeometry = new THREE.PlaneGeometry(wallSegmentWidth, wallHeight);
    const segmentOffset = doorwayWidth / 2 + wallSegmentWidth / 2;

    // North Inner Wall
    const northInnerWall1 = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial);
    northInnerWall1.position.set(-segmentOffset, wallHeight / 2, -innerRoomSize / 2);
    scene.add(northInnerWall1);
    const northInnerWall2 = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial);
    northInnerWall2.position.set(segmentOffset, wallHeight / 2, -innerRoomSize / 2);
    scene.add(northInnerWall2);

    // South Inner Wall
    const southInnerWall1 = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial);
    southInnerWall1.position.set(-segmentOffset, wallHeight / 2, innerRoomSize / 2);
    southInnerWall1.rotation.y = Math.PI;
    scene.add(southInnerWall1);
    const southInnerWall2 = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial);
    southInnerWall2.position.set(segmentOffset, wallHeight / 2, innerRoomSize / 2);
    southInnerWall2.rotation.y = Math.PI;
    scene.add(southInnerWall2);

    // East Inner Wall
    const eastInnerWall1 = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial);
    eastInnerWall1.position.set(innerRoomSize / 2, wallHeight / 2, -segmentOffset);
    eastInnerWall1.rotation.y = Math.PI / 2;
    scene.add(eastInnerWall1);
    const eastInnerWall2 = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial);
    eastInnerWall2.position.set(innerRoomSize / 2, wallHeight / 2, segmentOffset);
    eastInnerWall2.rotation.y = Math.PI / 2;
    scene.add(eastInnerWall2);

    // West Inner Wall
    const westInnerWall1 = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial);
    westInnerWall1.position.set(-innerRoomSize / 2, wallHeight / 2, -segmentOffset);
    westInnerWall1.rotation.y = -Math.PI / 2;
    scene.add(westInnerWall1);
    const westInnerWall2 = new THREE.Mesh(wallSegmentGeometry, innerWallMaterial);
    westInnerWall2.position.set(-innerRoomSize / 2, wallHeight / 2, segmentOffset);
    westInnerWall2.rotation.y = -Math.PI / 2;
    scene.add(westInnerWall2);
    // --- End Inner Room ---

    // --- Create Innermost Room (50x50) ---
    const innermostRoomSize = 50;
    const innermostWallMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });
    const innermostDoorwayWidth = 8;
    const innermostWallSegmentWidth = (innermostRoomSize - innermostDoorwayWidth) / 2;
    const innermostWallSegmentGeometry = new THREE.PlaneGeometry(innermostWallSegmentWidth, wallHeight);
    const innermostSegmentOffset = innermostDoorwayWidth / 2 + innermostWallSegmentWidth / 2;

    // North Innermost Wall
    const northInnermostWall1 = new THREE.Mesh(innermostWallSegmentGeometry, innermostWallMaterial);
    northInnermostWall1.position.set(-innermostSegmentOffset, wallHeight / 2, -innermostRoomSize / 2);
    scene.add(northInnermostWall1);
    const northInnermostWall2 = new THREE.Mesh(innermostWallSegmentGeometry, innermostWallMaterial);
    northInnermostWall2.position.set(innermostSegmentOffset, wallHeight / 2, -innermostRoomSize / 2);
    scene.add(northInnermostWall2);

    // South Innermost Wall
    const southInnermostWall1 = new THREE.Mesh(innermostWallSegmentGeometry, innermostWallMaterial);
    southInnermostWall1.position.set(-innermostSegmentOffset, wallHeight / 2, innermostRoomSize / 2);
    southInnermostWall1.rotation.y = Math.PI;
    scene.add(southInnermostWall1);
    const southInnermostWall2 = new THREE.Mesh(innermostWallSegmentGeometry, innermostWallMaterial);
    southInnermostWall2.position.set(innermostSegmentOffset, wallHeight / 2, innermostRoomSize / 2);
    southInnermostWall2.rotation.y = Math.PI;
    scene.add(southInnermostWall2);

    // East Innermost Wall
    const eastInnermostWall1 = new THREE.Mesh(innermostWallSegmentGeometry, innermostWallMaterial);
    eastInnermostWall1.position.set(innermostRoomSize / 2, wallHeight / 2, -innermostSegmentOffset);
    eastInnermostWall1.rotation.y = Math.PI / 2;
    scene.add(eastInnermostWall1);
    const eastInnermostWall2 = new THREE.Mesh(innermostWallSegmentGeometry, innermostWallMaterial);
    eastInnermostWall2.position.set(innermostRoomSize / 2, wallHeight / 2, innermostSegmentOffset);
    eastInnermostWall2.rotation.y = Math.PI / 2;
    scene.add(eastInnermostWall2);

    // West Innermost Wall
    const westInnermostWall1 = new THREE.Mesh(innermostWallSegmentGeometry, innermostWallMaterial);
    westInnermostWall1.position.set(-innermostRoomSize / 2, wallHeight / 2, -innermostSegmentOffset);
    westInnermostWall1.rotation.y = -Math.PI / 2;
    scene.add(westInnermostWall1);
    const westInnermostWall2 = new THREE.Mesh(innermostWallSegmentGeometry, innermostWallMaterial);
    westInnermostWall2.position.set(-innermostRoomSize / 2, wallHeight / 2, innermostSegmentOffset);
    westInnermostWall2.rotation.y = -Math.PI / 2;
    scene.add(westInnermostWall2);
    // --- End Innermost Room ---

    // --- Create Central Pillar (10x10) ---
    const centralPillarSize = 10;
    const centralPillarMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });
    const centralPillarGeometry = new THREE.BoxGeometry(centralPillarSize, wallHeight, centralPillarSize);
    const centralPillar = new THREE.Mesh(centralPillarGeometry, centralPillarMaterial);
    centralPillar.position.set(0, wallHeight / 2, 0);
    scene.add(centralPillar);
    // --- End Central Pillar ---

    const lights: THREE.PointLight[] = [];
    const NUM_DISCO_LIGHTS = 3, discoLightHeight = 2.5, lightColors = [0xff0066, 0x00ffd5, 0xffff00];
    for (let i = 0; i < NUM_DISCO_LIGHTS; i++) {
      const pl = new THREE.PointLight(lightColors[i], 0.8, 50, 2);
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

    const panelSpacing = 15; // Distance between centers of panels

    const panelConfigs: { wallName: string; position: [number, number, number]; rotation: [number, number, number]; }[] = [];
    
    // Outer walls
    const panelsPerOuterWall = 7;
    const outerWalls = ['north', 'south', 'east', 'west'];
    outerWalls.forEach(wall => {
      for (let i = 0; i < panelsPerOuterWall; i++) {
        const wallName = `${wall}-wall-${i + 1}`;
        const offset = -(panelSpacing * (panelsPerOuterWall - 1)) / 2 + i * panelSpacing;
        let position: [number, number, number] = [0, 0, 0];
        let rotation: [number, number, number] = [0, 0, 0];
        switch (wall) {
          case 'north':
            position = [offset, panelYPosition, -roomSize / 2 + ARROW_DEPTH_OFFSET];
            rotation = [0, 0, 0];
            break;
          case 'south':
            position = [-offset, panelYPosition, roomSize / 2 - ARROW_DEPTH_OFFSET];
            rotation = [0, Math.PI, 0];
            break;
          case 'east':
            position = [roomSize / 2 - ARROW_DEPTH_OFFSET, panelYPosition, offset];
            rotation = [0, -Math.PI / 2, 0];
            break;
          case 'west':
            position = [-roomSize / 2 + ARROW_DEPTH_OFFSET, panelYPosition, -offset];
            rotation = [0, Math.PI / 2, 0];
            break;
        }
        panelConfigs.push({ wallName, position, rotation });
      }
    });

    // Inner walls
    const panelsPerInnerSegment = 2;
    const innerWalls = ['north-inner', 'south-inner', 'east-inner', 'west-inner'];
    const innerSegmentOffset = doorwayWidth / 2 + wallSegmentWidth / 2; // Re-using calculated offset
    innerWalls.forEach(wall => {
      for (let i = 0; i < panelsPerInnerSegment * 2; i++) {
        const wallName = `${wall}-wall-${i + 1}`;
        const segmentIndex = Math.floor(i / panelsPerInnerSegment); // 0 for left/first, 1 for right/second
        const panelInSegment = i % panelsPerInnerSegment;
        
        const segmentCenter = (segmentIndex === 0 ? -1 : 1) * innerSegmentOffset;
        const panelOffset = -(panelSpacing * (panelsPerInnerSegment - 1)) / 2 + panelInSegment * panelSpacing;
        const finalOffset = segmentCenter + panelOffset;

        let position: [number, number, number] = [0, 0, 0];
        let rotation: [number, number, number] = [0, 0, 0];
        switch (wall) {
          case 'north-inner':
            position = [finalOffset, panelYPosition, -innerRoomSize / 2 + ARROW_DEPTH_OFFSET];
            rotation = [0, 0, 0];
            break;
          case 'south-inner':
            position = [-finalOffset, panelYPosition, innerRoomSize / 2 - ARROW_DEPTH_OFFSET];
            rotation = [0, Math.PI, 0];
            break;
          case 'east-inner':
            position = [innerRoomSize / 2 - ARROW_DEPTH_OFFSET, panelYPosition, finalOffset];
            rotation = [0, -Math.PI / 2, 0];
            break;
          case 'west-inner':
            position = [-innerRoomSize / 2 + ARROW_DEPTH_OFFSET, panelYPosition, -finalOffset];
            rotation = [0, Math.PI / 2, 0];
            break;
        }
        panelConfigs.push({ wallName, position, rotation });
      }
    });

    // Innermost walls
    const panelsPerInnermostSegment = 1;
    const innermostWalls = ['north-innermost', 'south-innermost', 'east-innermost', 'west-innermost'];
    innermostWalls.forEach(wall => {
      for (let i = 0; i < panelsPerInnermostSegment * 2; i++) {
        const wallName = `${wall}-wall-${i + 1}`;
        const segmentIndex = i; // 0 or 1
        const finalOffset = (segmentIndex === 0 ? -1 : 1) * innermostSegmentOffset;

        let position: [number, number, number] = [0, 0, 0];
        let rotation: [number, number, number] = [0, 0, 0];
        switch (wall) {
          case 'north-innermost':
            position = [finalOffset, panelYPosition, -innermostRoomSize / 2 + ARROW_DEPTH_OFFSET];
            rotation = [0, 0, 0];
            break;
          case 'south-innermost':
            position = [-finalOffset, panelYPosition, innermostRoomSize / 2 - ARROW_DEPTH_OFFSET];
            rotation = [0, Math.PI, 0];
            break;
          case 'east-innermost':
            position = [innermostRoomSize / 2 - ARROW_DEPTH_OFFSET, panelYPosition, finalOffset];
            rotation = [0, -Math.PI / 2, 0];
            break;
          case 'west-innermost':
            position = [-innermostRoomSize / 2 + ARROW_DEPTH_OFFSET, panelYPosition, -finalOffset];
            rotation = [0, Math.PI / 2, 0];
            break;
        }
        panelConfigs.push({ wallName, position, rotation });
      }
    });
    
    // Central Pillar Walls (4 panels)
    const centralPillarHalf = centralPillarSize / 2;
    panelConfigs.push({ 
      wallName: 'center-pillar-1', 
      position: [0, panelYPosition, -centralPillarHalf - ARROW_DEPTH_OFFSET], 
      rotation: [0, Math.PI, 0] // Facing -Z (North side of pillar)
    });
    panelConfigs.push({ 
      wallName: 'center-pillar-2', 
      position: [0, panelYPosition, centralPillarHalf + ARROW_DEPTH_OFFSET], 
      rotation: [0, 0, 0] // Facing +Z (South side of pillar)
    });
    panelConfigs.push({ 
      wallName: 'center-pillar-3', 
      position: [centralPillarHalf + ARROW_DEPTH_OFFSET, panelYPosition, 0], 
      rotation: [0, Math.PI / 2, 0] // Facing +X (East side of pillar)
    });
    panelConfigs.push({ 
      wallName: 'center-pillar-4', 
      position: [-centralPillarHalf - ARROW_DEPTH_OFFSET, panelYPosition, 0], 
      rotation: [0, -Math.PI / 2, 0] // Facing -X (West side of pillar)
    });


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
      
      const titleMesh = new THREE.Mesh(titleGeometry, placeholderMaterial.clone());
      titleMesh.rotation.set(...config.rotation);
      const titleYOffset = -1 - (TITLE_HEIGHT / 2) - 0.1; // panel half-height (1) + title half-height + gap
      const titlePosition = basePosition.clone()
          .addScaledVector(upVector, titleYOffset)
          .addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      titleMesh.position.copy(titlePosition);
      scene.add(titleMesh);

      // Description Panel (Left side)
      const textGroupPosition = basePosition.clone().addScaledVector(rightVector, -TEXT_PANEL_OFFSET_X);
      const descriptionGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT);
      const descriptionMesh = new THREE.Mesh(descriptionGeometry, placeholderMaterial.clone());
      descriptionMesh.rotation.set(...config.rotation);
      const descriptionPosition = textGroupPosition.clone().addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      descriptionMesh.position.copy(descriptionPosition);
      scene.add(descriptionMesh);
      
      const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      prevArrow.rotation.set(config.rotation[0], config.rotation[1] + Math.PI, config.rotation[2]);
      const prevPosition = new THREE.Vector3(...config.position).addScaledVector(rightVector, -ARROW_PANEL_OFFSET);
      prevArrow.position.copy(prevPosition);
      scene.add(prevArrow);
      
      const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      nextArrow.rotation.set(...config.rotation);
      const nextPosition = new THREE.Vector3(...config.position).addScaledVector(rightVector, ARROW_PANEL_OFFSET);
      nextArrow.position.copy(nextPosition);
      scene.add(nextArrow);

      // Attributes Panel (Right side)
      const collectionInfoGroupPosition = basePosition.clone().addScaledVector(rightVector, TEXT_PANEL_OFFSET_X);
      const attributesGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT);
      const attributesMesh = new THREE.Mesh(attributesGeometry, placeholderMaterial.clone());
      attributesMesh.rotation.set(...config.rotation);
      const attributesPosition = collectionInfoGroupPosition.clone().addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      attributesMesh.position.copy(attributesPosition);
      scene.add(attributesMesh);

      const wallTitleGeometry = new THREE.PlaneGeometry(8, 0.75); // Doubled width for wall title
      const wallTitleMesh = new THREE.Mesh(wallTitleGeometry, placeholderMaterial.clone());
      wallTitleMesh.rotation.set(...config.rotation);
      const wallTitlePosition = new THREE.Vector3(...config.position);
      wallTitlePosition.y = 3.2; // Position it above the main panel
      wallTitleMesh.position.copy(wallTitlePosition);
      scene.add(wallTitleMesh);

      const panel: Panel = {
        mesh, wallName: config.wallName as keyof PanelConfig, metadataUrl: '', isVideo: false, prevArrow, nextArrow, titleMesh, descriptionMesh,
        attributesMesh, wallTitleMesh, currentDescription: '', descriptionScrollY: 0, descriptionTextHeight: 0, currentAttributes: [],
      };
      panelsRef.current.push(panel);
      
      // Initial content is set to 'Loading...' placeholder.
      // The actual content loading will happen sequentially below.
    });

    // --- Sequential Loading Logic ---
    const loadAllPanelsSequentially = async () => {
      await initializeGalleryConfig();
      
      for (const panel of panelsRef.current) {
        const source = getCurrentNftSource(panel.wallName);
        if (source) {
          // Use await here to ensure sequential loading
          await updatePanelContent(panel, source);
        }
      }
      console.log("All gallery panels initialized.");
    };
    
    loadAllPanelsSequentially();
    // --- End Sequential Loading Logic ---


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
        
        // --- START NEW COLLISION LOGIC ---
        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.setFromQuaternion(camera.quaternion);

        const moveVector = new THREE.Vector3();
        // Calculate rightward movement vector
        moveVector.set(1, 0, 0).applyEuler(euler).multiplyScalar(-velocity.x * delta);
        // Add forward movement vector
        moveVector.add(new THREE.Vector3(0, 0, -1).applyEuler(euler).multiplyScalar(-velocity.z * delta));

        const pillarSize = 10;
        const pillarHalfSize = pillarSize / 2;
        const playerRadius = 0.5; // A small buffer for the player

        const checkCollision = (pos: THREE.Vector3) => {
            return (
                pos.x > -pillarHalfSize + playerRadius &&
                pos.x < pillarHalfSize - playerRadius &&
                pos.z > -pillarHalfSize + playerRadius &&
                pos.z < pillarHalfSize - playerRadius
            );
        };

        const futurePosition = camera.position.clone().add(moveVector);

        if (!checkCollision(futurePosition)) {
            // No collision, move freely
            camera.position.copy(futurePosition);
        } else {
            // Collision detected, try to slide along world axes
            const tempPosition = camera.position.clone();

            // Try moving only on world X axis
            const futurePositionX = tempPosition.clone();
            futurePositionX.x += moveVector.x;
            if (!checkCollision(futurePositionX)) {
                tempPosition.x += moveVector.x;
            }

            // Try moving only on world Z axis
            const futurePositionZ = tempPosition.clone();
            futurePositionZ.z += moveVector.z;
            if (!checkCollision(futurePositionZ)) {
                tempPosition.z += moveVector.z;
            }
            
            camera.position.copy(tempPosition);
        }
        // --- END NEW COLLISION LOGIC ---

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
  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback, applyFallbackContent]);

  return (
    <>
      <video ref={videoRef} style={{ display: 'none' }} playsInline autoPlay muted />
      <div ref={mountRef} className="w-full h-full" />
    </>
  );
};

export default NftGallery;