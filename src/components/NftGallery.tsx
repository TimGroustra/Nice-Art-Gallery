import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource, NftAttribute } from '@/utils/nftFetcher';
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
  // NEW: Dedicated video element for this panel
  videoElement: HTMLVideoElement | null;
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


const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const [isLocked, setIsLocked] = useState(false); 

  const manageVideoPlayback = useCallback((shouldPlay: boolean) => {
    panelsRef.current.forEach(panel => {
        if (panel.videoElement) {
            if (shouldPlay) {
                const controlsLocked = (window as any).galleryControls?.isLocked?.() ?? false;
                if (controlsLocked) {
                    panel.videoElement.play().catch(e => console.warn("Video playback prevented:", e));
                }
            } else {
                panel.videoElement.pause();
            }
        }
    });
  }, []);

  const loadTexture = useCallback((url: string, panel: Panel, isVideo: boolean = false): THREE.Texture | THREE.VideoTexture => {
    if (isVideo) {
      let videoEl = panel.videoElement;
      if (!videoEl) {
          // Create a new video element if it doesn't exist for this panel
          videoEl = document.createElement('video');
          videoEl.playsInline = true;
          videoEl.autoplay = true;
          videoEl.loop = true;
          videoEl.muted = true;
          videoEl.style.display = 'none'; // Keep it hidden
          panel.videoElement = videoEl;
      }

      // Stop previous playback and set new source
      videoEl.pause();
      videoEl.src = url;
      videoEl.load();
      
      // Start playback if controls are locked
      if ((window as any).galleryControls?.isLocked?.()) {
           videoEl.play().catch(e => console.warn("Video playback prevented:", e));
      }
      
      const videoTexture = new THREE.VideoTexture(videoEl);
      // Set filters for better video quality
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.needsUpdate = true;
      
      return videoTexture;
    }
    
    // If it's not a video, ensure we clean up any existing video element for this panel
    if (panel.videoElement) {
        panel.videoElement.pause();
        panel.videoElement.removeAttribute('src');
        panel.videoElement = null;
    }
    
    return new THREE.TextureLoader().load(url, () => {}, undefined, (error) => {
      console.error('Error loading texture:', url, error);
      showError(`Failed to load image: ${url.substring(0, 50)}...`);
    });
  }, []);

  const updatePanelContent = useCallback(async (panel: Panel, source: NftSource) => {
    try {
      // Use the cached fetcher
      const metadata: NftMetadata = await getCachedNftMetadata(source.contractAddress, source.tokenId);
      const collectionName = GALLERY_PANEL_CONFIG[panel.wallName]?.name || '...';
      
      const imageUrl = metadata.image;
      const isVideo = imageUrl.endsWith('.mp4') || imageUrl.endsWith('.webm') || imageUrl.endsWith('.ogg');
      
      // Pass the panel object to loadTexture
      const texture = loadTexture(imageUrl, panel, isVideo);
      
      if (panel.mesh.material instanceof THREE.MeshBasicMaterial) {
        panel.mesh.material.map?.dispose();
        panel.mesh.material.dispose();
      }

      panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture });
      panel.metadataUrl = metadata.source;
      panel.isVideo = isVideo;

      // Title update
      if (panel.titleMesh.material instanceof THREE.MeshBasicMaterial && panel.titleMesh.material.map) {
        panel.titleMesh.material.map.dispose();
        (panel.titleMesh.material as THREE.MeshBasicMaterial).map = null; // Explicitly nullify map
      }
      const { texture: titleTexture } = createTextTexture(metadata.title, 4.0, 0.5, 120, 'white', { wordWrap: false });
      (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTexture;
      panel.titleMesh.visible = true;

      // Description update
      if (panel.descriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.descriptionMesh.material.map) {
        panel.descriptionMesh.material.map.dispose();
        (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = null; // Explicitly nullify map
      }
      const descriptionText = metadata.description;
      const { texture: descriptionTexture, totalHeight } = createTextTexture(descriptionText, TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, 'lightgray', { wordWrap: true });
      (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = descriptionTexture;
      panel.descriptionMesh.visible = true;

      // Update panel state for scrolling
      panel.currentDescription = descriptionText;
      panel.descriptionTextHeight = totalHeight;
      panel.descriptionScrollY = 0;

      // Attributes update
      if (panel.attributesMesh.material instanceof THREE.MeshBasicMaterial && panel.attributesMesh.material.map) {
          panel.attributesMesh.material.map.dispose();
          (panel.attributesMesh.material as THREE.MeshBasicMaterial).map = null; // Explicitly nullify map
      }
      const attributes = metadata.attributes || [];
      panel.currentAttributes = attributes;
      const { texture: attributesTexture } = createAttributesTextTexture(attributes, TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT, 40, 'lightgray');
      (panel.attributesMesh.material as THREE.MeshBasicMaterial).map = attributesTexture;
      panel.attributesMesh.visible = true;

      // Wall title update
      if (panel.wallTitleMesh.material instanceof THREE.MeshBasicMaterial && panel.wallTitleMesh.material.map) {
        panel.wallTitleMesh.material.map.dispose();
        (panel.wallTitleMesh.material as THREE.MeshBasicMaterial).map = null; // Explicitly nullify map
      }
      const { texture: wallTitleTexture } = createTextTexture(collectionName, 8, 0.75, 120, 'white', { wordWrap: false });
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
      
      // Ensure video cleanup on failure
      if (panel.videoElement) {
        panel.videoElement.pause();
        panel.videoElement.removeAttribute('src');
        panel.videoElement = null;
      }
    }
  }, [loadTexture]);

  useEffect(() => {
    if (!mountRef.current) return;

    RectAreaLightUniformsLib.init();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaaaaaa);
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 20); // New spawn point: between 30x30 (15) and 50x50 (25) walls
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    const controls = new PointerLockControls(camera, renderer.domElement);
    
    (window as any).galleryControls = {
      lockControls: () => controls.lock(),
      // Check if ANY panel has a video element
      hasVideo: () => panelsRef.current.some(p => p.videoElement !== null),
      // Check if ALL active video elements are muted
      isMuted: () => {
        const activeVideos = panelsRef.current.filter(p => p.videoElement);
        if (activeVideos.length === 0) return true;
        return activeVideos.every(p => p.videoElement!.muted);
      },
      // Toggle mute on ALL active video elements
      toggleMute: () => { 
        const activeVideos = panelsRef.current.filter(p => p.videoElement);
        if (activeVideos.length > 0) {
          const currentlyMuted = activeVideos[0].videoElement!.muted;
          activeVideos.forEach(p => {
            p.videoElement!.muted = !currentlyMuted;
          });
        }
      },
      isLocked: () => controls.isLocked, 
      getTargetedPanel: () => currentTargetedPanel,
    };

    controls.addEventListener('lock', () => {
      setIsLocked(true);
      setInstructionsVisible(false);
      // Start playback for all active videos
      manageVideoPlayback(true);
    });
    controls.addEventListener('unlock', () => {
      setIsLocked(false);
      setInstructionsVisible(true);
      // Pause playback for all active videos
      manageVideoPlayback(false);
    });

    // --- ROOM GEOMETRY SETUP (50x50 as new outer boundary) ---
    const ROOM_SEGMENT_SIZE = 10;
    const NUM_SEGMENTS = 7;
    const ROOM_SIZE = ROOM_SEGMENT_SIZE * NUM_SEGMENTS; // 70 (for floor/ceiling extent)
    const WALL_HEIGHT = 4;
    const PANEL_Y_POSITION = 1.8;
    
    // Define new boundaries
    const OUTER_WALL_BOUNDARY = 25; // New effective outer boundary (50x50 room)
    const BOUNDARY = OUTER_WALL_BOUNDARY - 0.5; // 24.5 for player movement limit

    const roomSize = ROOM_SIZE, wallHeight = WALL_HEIGHT, panelYPosition = PANEL_Y_POSITION, boundary = BOUNDARY;
    const halfRoomSize = ROOM_SIZE / 2; // Still 35 for floor/ceiling extent
    
    const segmentGeometry = new THREE.PlaneGeometry(ROOM_SEGMENT_SIZE, ROOM_SEGMENT_SIZE);
    const wallSegmentGeometry = new THREE.PlaneGeometry(ROOM_SEGMENT_SIZE, WALL_HEIGHT);
    const outerFloorMaterial = new THREE.MeshPhongMaterial({ color: 0xF5F5F5, side: THREE.DoubleSide });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });

    // Define constants for inner rooms centrally
    const SEGMENT_TO_SKIP = 0; // Center segment (for walkway)
    const outerSegmentCenters = [-20, -10, 0, 10, 20]; // 50x50 room segments (New outer walls)
    const innerSegmentCenters = [-10, 0, 10]; // 30x30 room segments
    const innerInnerSegmentCenters = [0]; // 10x10 room segments


    // 1. Create Modular Floor and Ceiling (Still covering 70x70 area)
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

    // 3. Create Modular Outer Walls (50x50) - New Gallery Boundary
    const OUTER_WALL_HEIGHT = WALL_HEIGHT;
    const outerWallMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });
    const outerWallSegmentGeometry = new THREE.PlaneGeometry(ROOM_SEGMENT_SIZE, OUTER_WALL_HEIGHT);

    outerSegmentCenters.forEach(segmentCenter => {
        if (segmentCenter === SEGMENT_TO_SKIP) return; // Skip the center segment for the walkway

        // North Outer Wall (Z = -25)
        const northOuterWall = new THREE.Mesh(outerWallSegmentGeometry, outerWallMaterial.clone());
        northOuterWall.position.set(segmentCenter, OUTER_WALL_HEIGHT / 2, -OUTER_WALL_BOUNDARY);
        scene.add(northOuterWall);

        // South Outer Wall (Z = 25)
        const southOuterWall = new THREE.Mesh(outerWallSegmentGeometry, outerWallMaterial.clone());
        southOuterWall.rotation.y = Math.PI;
        southOuterWall.position.set(segmentCenter, OUTER_WALL_HEIGHT / 2, OUTER_WALL_BOUNDARY);
        scene.add(southOuterWall);

        // East Outer Wall (X = 25)
        const eastOuterWall = new THREE.Mesh(outerWallSegmentGeometry, outerWallMaterial.clone());
        eastOuterWall.rotation.y = -Math.PI / 2;
        eastOuterWall.position.set(OUTER_WALL_BOUNDARY, OUTER_WALL_HEIGHT / 2, segmentCenter);
        scene.add(eastOuterWall);

        // West Outer Wall (X = -25)
        const westOuterWall = new THREE.Mesh(outerWallSegmentGeometry, outerWallMaterial.clone());
        westOuterWall.rotation.y = Math.PI / 2;
        westOuterWall.position.set(-OUTER_WALL_BOUNDARY, OUTER_WALL_HEIGHT / 2, segmentCenter);
        scene.add(westOuterWall);
    });
    // --- END OUTER ROOM SETUP (50x50) ---

    // --- START INNER ROOM SETUP (30x30) ---
    const INNER_WALL_BOUNDARY = 15;

    innerSegmentCenters.forEach(segmentCenter => {
        if (segmentCenter === SEGMENT_TO_SKIP) return; // Skip the center segment for the walkway

        // North Inner Inner Wall (Z = -15)
        const northInnerInnerWall = new THREE.Mesh(outerWallSegmentGeometry, outerWallMaterial.clone());
        northInnerInnerWall.position.set(segmentCenter, WALL_HEIGHT / 2, -INNER_WALL_BOUNDARY);
        scene.add(northInnerInnerWall);

        // South Inner Inner Wall (Z = 15)
        const southInnerInnerWall = new THREE.Mesh(outerWallSegmentGeometry, outerWallMaterial.clone());
        southInnerInnerWall.rotation.y = Math.PI;
        southInnerInnerWall.position.set(segmentCenter, WALL_HEIGHT / 2, INNER_WALL_BOUNDARY);
        scene.add(southInnerInnerWall);

        // East Inner Inner Wall (X = 15)
        const eastInnerInnerWall = new THREE.Mesh(outerWallSegmentGeometry, outerWallMaterial.clone());
        eastInnerInnerWall.rotation.y = -Math.PI / 2;
        eastInnerInnerWall.position.set(INNER_WALL_BOUNDARY, WALL_HEIGHT / 2, segmentCenter);
        scene.add(eastInnerInnerWall);

        // West Inner Inner Wall (X = -15)
        const westInnerInnerWall = new THREE.Mesh(outerWallSegmentGeometry, outerWallMaterial.clone());
        westInnerInnerWall.rotation.y = Math.PI / 2;
        westInnerInnerWall.position.set(-INNER_WALL_BOUNDARY, WALL_HEIGHT / 2, segmentCenter);
        scene.add(westInnerInnerWall);
    });
    // --- END INNER INNER ROOM SETUP ---
    
    // --- START INNER INNER INNER ROOM SETUP (10x10) ---
    const INNER_INNER_INNER_WALL_BOUNDARY = 5;
    
    innerInnerSegmentCenters.forEach(segmentCenter => {
        // North Wall (Z = -5)
        const northWall = new THREE.Mesh(outerWallSegmentGeometry, outerWallMaterial.clone());
        northWall.position.set(segmentCenter, WALL_HEIGHT / 2, -INNER_INNER_INNER_WALL_BOUNDARY);
        scene.add(northWall);

        // South Wall (Z = 5)
        const southWall = new THREE.Mesh(outerWallSegmentGeometry, outerWallMaterial.clone());
        southWall.rotation.y = Math.PI;
        southWall.position.set(segmentCenter, WALL_HEIGHT / 2, INNER_INNER_INNER_WALL_BOUNDARY);
        scene.add(southWall);

        // East Wall (X = 5)
        const eastWall = new THREE.Mesh(outerWallSegmentGeometry, outerWallMaterial.clone());
        eastWall.rotation.y = -Math.PI / 2;
        eastWall.position.set(INNER_INNER_INNER_WALL_BOUNDARY, WALL_HEIGHT / 2, segmentCenter);
        scene.add(eastWall);

        // West Wall (X = -5)
        const westWall = new THREE.Mesh(outerWallSegmentGeometry, outerWallMaterial.clone());
        westWall.rotation.y = Math.PI / 2;
        westWall.position.set(-INNER_INNER_INNER_WALL_BOUNDARY, WALL_HEIGHT / 2, segmentCenter);
        scene.add(westWall);
    });
    // --- END INNER INNER INNER ROOM SETUP ---


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
    const wallThicknessOffset = 0.05; // Half the wall thickness (assuming wall is centered on boundary line)


    const createCoveLighting = (
        position: [number, number, number],
        rotation: [number, number, number],
        order: THREE.EulerOrder = 'XYZ'
    ) => {
        const rectLight = new THREE.RectAreaLight(coveLightColor, coveLightIntensity, coveLightWidth, coveLightHeight);
        rectLight.position.set(...position);
        rectLight.rotation.set(rotation[0], rotation.length > 1 ? rotation[1] : 0, rotation.length > 2 ? rotation[2] : 0, order);
        scene.add(rectLight);

        const glowGeo = new THREE.BoxGeometry(coveLightWidth, coveLightHeight, 0.02);
        const glowMat = new THREE.MeshBasicMaterial({ color: coveLightColor, toneMapped: false });
        const glowMesh = new THREE.Mesh(glowGeo, glowMat);
        glowMesh.position.set(...position);
        glowMesh.rotation.set(rotation[0], rotation.length > 1 ? rotation[1] : 0, rotation.length > 2 ? rotation[2] : 0, order);
        scene.add(glowMesh);
    };

    // Outer Cove Lighting (50x50)
    const outerYPos = WALL_HEIGHT - 0.1;
    const outerOffset = 0.1;

    outerSegmentCenters.forEach(segmentCenter => {
        if (segmentCenter === SEGMENT_TO_SKIP) return; // Skip the center segment for the walkway

        // North Outer Wall (Z = -25)
        // Outer side (facing -Z, outside world)
        createCoveLighting([segmentCenter, outerYPos, -OUTER_WALL_BOUNDARY + outerOffset - wallThicknessOffset], [Math.PI / 2, 0, 0]);
        // Inner side (facing +Z, corridor)
        createCoveLighting([segmentCenter, outerYPos, -OUTER_WALL_BOUNDARY + outerOffset + wallThicknessOffset], [-Math.PI / 2, Math.PI, 0]);

        // South Outer Wall (Z = 25)
        // Outer side (facing +Z, outside world)
        createCoveLighting([segmentCenter, outerYPos, OUTER_WALL_BOUNDARY - outerOffset + wallThicknessOffset], [-Math.PI / 2, 0, 0]);
        // Inner side (facing -Z, corridor)
        createCoveLighting([segmentCenter, outerYPos, OUTER_WALL_BOUNDARY - outerOffset - wallThicknessOffset], [Math.PI / 2, Math.PI, 0]);
        
        // East Outer Wall (X = 25)
        // Outer side (facing +X, outside world)
        createCoveLighting([OUTER_WALL_BOUNDARY - outerOffset + wallThicknessOffset, outerYPos, segmentCenter], [-Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
        // Inner side (facing -X, corridor)
        createCoveLighting([OUTER_WALL_BOUNDARY - outerOffset - wallThicknessOffset, outerYPos, segmentCenter], [Math.PI / 2, Math.PI / 2, 0], 'YXZ');

        // West Outer Wall (X = -25)
        // Outer side (facing -X, outside world)
        createCoveLighting([-OUTER_WALL_BOUNDARY + outerOffset - wallThicknessOffset, outerYPos, segmentCenter], [-Math.PI / 2, Math.PI / 2, 0], 'YXZ');
        // Inner side (facing +X, corridor)
        createCoveLighting([-OUTER_WALL_BOUNDARY + outerOffset + wallThicknessOffset, outerYPos, segmentCenter], [Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
    });

    // Inner Cove Lighting (30x30)
    const innerInnerYPos = WALL_HEIGHT - 0.1;
    const INNER_WALL_BOUNDARY_LIGHT = 15;

    innerSegmentCenters.forEach(segmentCenter => {
        if (segmentCenter === SEGMENT_TO_SKIP) return; // Skip the center segment for the walkway

        // North Inner Wall (Z = -15)
        // Outer side (facing -Z, corridor)
        createCoveLighting([segmentCenter, innerInnerYPos, -INNER_WALL_BOUNDARY_LIGHT + outerOffset - wallThicknessOffset], [Math.PI / 2, 0, 0]);
        // Inner side (facing +Z, inner room)
        createCoveLighting([segmentCenter, innerInnerYPos, -INNER_WALL_BOUNDARY_LIGHT + outerOffset + wallThicknessOffset], [-Math.PI / 2, Math.PI, 0]);

        // South Inner Wall (Z = 15)
        // Outer side (facing +Z, corridor)
        createCoveLighting([segmentCenter, innerInnerYPos, INNER_WALL_BOUNDARY_LIGHT - outerOffset + wallThicknessOffset], [-Math.PI / 2, 0, 0]);
        // Inner side (facing -Z, inner room)
        createCoveLighting([segmentCenter, innerInnerYPos, INNER_WALL_BOUNDARY_LIGHT - outerOffset - wallThicknessOffset], [Math.PI / 2, Math.PI, 0]);
        
        // East Inner Wall (X = 15)
        // Outer side (facing +X, corridor)
        createCoveLighting([INNER_WALL_BOUNDARY_LIGHT - outerOffset + wallThicknessOffset, innerInnerYPos, segmentCenter], [-Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
        // Inner side (facing -X, inner room)
        createCoveLighting([INNER_WALL_BOUNDARY_LIGHT - outerOffset - wallThicknessOffset, innerInnerYPos, segmentCenter], [Math.PI / 2, Math.PI / 2, 0], 'YXZ');

        // West Inner Wall (X = -15)
        // Outer side (facing -X, corridor)
        createCoveLighting([-INNER_WALL_BOUNDARY_LIGHT + outerOffset - wallThicknessOffset, innerInnerYPos, segmentCenter], [-Math.PI / 2, Math.PI / 2, 0], 'YXZ');
        // Inner side (facing +X, inner room)
        createCoveLighting([-INNER_WALL_BOUNDARY_LIGHT + outerOffset + wallThicknessOffset, innerInnerYPos, segmentCenter], [Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
    });
    
    // Inner Inner Cove Lighting (10x10)
    const INNER_INNER_INNER_WALL_BOUNDARY_LIGHT = 5;

    innerInnerSegmentCenters.forEach(segmentCenter => {
        // North Inner Inner Inner Wall (Z = -5)
        // Outer side (facing -Z, corridor)
        createCoveLighting([segmentCenter, innerInnerYPos, -INNER_INNER_INNER_WALL_BOUNDARY_LIGHT + outerOffset - wallThicknessOffset], [Math.PI / 2, 0, 0]);
        // Inner side (facing +Z, inner room)
        createCoveLighting([segmentCenter, innerInnerYPos, -INNER_INNER_INNER_WALL_BOUNDARY_LIGHT + outerOffset + wallThicknessOffset], [-Math.PI / 2, Math.PI, 0]);

        // South Inner Inner Inner Wall (Z = 5)
        // Outer side (facing +Z, corridor)
        createCoveLighting([segmentCenter, innerInnerYPos, INNER_INNER_INNER_WALL_BOUNDARY_LIGHT - outerOffset + wallThicknessOffset], [-Math.PI / 2, 0, 0]);
        // Inner side (facing -Z, inner room)
        createCoveLighting([segmentCenter, innerInnerYPos, INNER_INNER_INNER_WALL_BOUNDARY_LIGHT - outerOffset - wallThicknessOffset], [Math.PI / 2, Math.PI, 0]);
        
        // East Inner Inner Inner Wall (X = 5)
        // Outer side (facing +X, corridor)
        createCoveLighting([INNER_INNER_INNER_WALL_BOUNDARY_LIGHT - outerOffset + wallThicknessOffset, innerInnerYPos, segmentCenter], [-Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
        // Inner side (facing -X, inner room)
        createCoveLighting([INNER_INNER_INNER_WALL_BOUNDARY_LIGHT - outerOffset - wallThicknessOffset, innerInnerYPos, segmentCenter], [Math.PI / 2, Math.PI / 2, 0], 'YXZ');

        // West Inner Inner Inner Wall (X = -5)
        // Outer side (facing -X, corridor)
        createCoveLighting([-INNER_INNER_INNER_WALL_BOUNDARY_LIGHT + outerOffset - wallThicknessOffset, innerInnerYPos, segmentCenter], [-Math.PI / 2, Math.PI / 2, 0], 'YXZ');
        // Inner side (facing +X, inner room)
        createCoveLighting([-INNER_INNER_INNER_WALL_BOUNDARY_LIGHT + outerOffset + wallThicknessOffset, innerInnerYPos, segmentCenter], [Math.PI / 2, -Math.PI / 2, 0], 'YXZ');
    });
    // --- END COVE LIGHTING ---


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
    
    // Helper to create a unique placeholder material/texture combo
    const createUniquePlaceholderMaterial = (text: string, width: number, height: number, fontSize: number, color: string = 'white') => {
        const { texture } = createTextTexture(text, width, height, fontSize, color, { wordWrap: false });
        return new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, alphaTest: 0.01, depthWrite: false });
    };

    // Geometries defined once outside the loop
    const titleGeometry = new THREE.PlaneGeometry(TITLE_PANEL_WIDTH, TITLE_HEIGHT);
    const descriptionGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT);
    const attributesGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT);
    const wallTitleGeometry = new THREE.PlaneGeometry(8, 0.75); 

    // Dynamic Panel Configuration Generation (Panels now mounted on the 50x50 walls)
    const WALL_ROTATIONS: { [key: string]: [number, number, number] } = {
        'north-wall': [0, 0, 0],
        'south-wall': [0, Math.PI, 0],
        'east-wall': [0, -Math.PI / 2, 0],
        'west-wall': [0, Math.PI / 2, 0],
    };

    const WALL_AXIS_MAP: { [key: string]: { axis: 'x' | 'z', sign: 1 | -1 } } = {
        'north-wall': { axis: 'z', sign: -1 }, // Z = -OUTER_WALL_BOUNDARY (25)
        'south-wall': { axis: 'z', sign: 1 },  // Z = OUTER_WALL_BOUNDARY (25)
        'east-wall': { axis: 'x', sign: 1 },   // X = OUTER_WALL_BOUNDARY (25)
        'west-wall': { axis: 'x', sign: -1 },  // X = -OUTER_WALL_BOUNDARY (25)
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
                z = map.sign * OUTER_WALL_BOUNDARY; // Use 25
            } else { // map.axis === 'x'
                x = map.sign * OUTER_WALL_BOUNDARY; // Use 25
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
      const mesh = new THREE.Mesh(panelGeometry, panelMaterial.clone());
      mesh.position.set(config.position[0], config.position[1], config.position[2]);
      mesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      scene.add(mesh);
      
      const wallRotation = new THREE.Euler(config.rotation[0], config.rotation[1], config.rotation[2], 'XYZ');
      const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);
      const upVector = new THREE.Vector3(0, 1, 0).applyEuler(wallRotation);
      const forwardVector = new THREE.Vector3(0, 0, 1).applyEuler(wallRotation);
      
      // FIX: Initialize basePosition using indexed access
      const basePosition = new THREE.Vector3(config.position[0], config.position[1], config.position[2]);
      
      // --- START FIX: Use unique placeholder materials ---
      const titleMesh = new THREE.Mesh(titleGeometry, createUniquePlaceholderMaterial('Loading Title...', TITLE_PANEL_WIDTH, TITLE_HEIGHT, 120));
      titleMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const titleYOffset = -1 - (TITLE_HEIGHT / 2) - 0.1; // panel half-height (1) + title half-height + gap
      const titlePosition = basePosition.clone()
          .addScaledVector(upVector, titleYOffset)
          .addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      titleMesh.position.copy(titlePosition);
      scene.add(titleMesh);

      // Description Panel (Left side relative to the NFT panel)
      const textGroupPosition = basePosition.clone().addScaledVector(rightVector, -TEXT_PANEL_OFFSET_X);
      const descriptionMesh = new THREE.Mesh(descriptionGeometry, createUniquePlaceholderMaterial('Loading Description...', TEXT_PANEL_WIDTH, DESCRIPTION_PANEL_HEIGHT, 30, 'lightgray'));
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
      const attributesMesh = new THREE.Mesh(attributesGeometry, createUniquePlaceholderMaterial('Loading Attributes...', TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT, 40, 'lightgray'));
      attributesMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const attributesPosition = collectionInfoGroupPosition.clone().addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      attributesMesh.position.copy(attributesPosition);
      scene.add(attributesMesh);

      const wallTitleMesh = new THREE.Mesh(wallTitleGeometry, createUniquePlaceholderMaterial('Loading Collection...', 8, 0.75, 120));
      wallTitleMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      // FIX: Initialize wallTitlePosition using indexed access
      const wallTitlePosition = new THREE.Vector3(config.position[0], config.position[1], config.position[2]);
      wallTitlePosition.y = 3.2; // Position it above the main panel
      wallTitleMesh.position.copy(wallTitlePosition);
      scene.add(wallTitleMesh);
      // --- END FIX ---

      const panel: Panel = {
        mesh, wallName: config.wallName as keyof PanelConfig, metadataUrl: '', isVideo: false, prevArrow, nextArrow, titleMesh, descriptionMesh,
        attributesMesh, wallTitleMesh, currentDescription: '', descriptionScrollY: 0, descriptionTextHeight: 0, currentAttributes: [],
        videoElement: null, // Initialize video element as null
      };
      panelsRef.current.push(panel);
      
      // We skip initial placeholder load here, it will be handled by the sequential fetch below
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
        (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = null; // Explicitly nullify map
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

    const fetchAndRenderPanelsSequentially = async () => {
      await initializeGalleryConfig();
      
      // Process panels sequentially to avoid overwhelming the RPC provider
      for (const panel of panelsRef.current) {
        const source = getCurrentNftSource(panel.wallName);
        if (source) {
          await updatePanelContent(panel, source);
          // Introduce a small delay between fetches to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 100)); 
        }
      }
    };

    fetchAndRenderPanelsSequentially();

    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('wheel', onDocumentWheel);
      window.removeEventListener('resize', onWindowResize);
      mountRef.current?.removeChild(renderer.domElement);
      controls.dispose();
      
      // Cleanup individual video elements and Three.js resources
      panelsRef.current.forEach(panel => {
        if (panel.videoElement) {
          panel.videoElement.pause();
          panel.videoElement.removeAttribute('src');
        }
      });

      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
          else { if (obj.material.map) obj.material.map.dispose(); obj.material.dispose(); }
        }
      });
      renderer.dispose();
      
      delete (window as any).galleryControls;
      currentTargetedPanel = null; 
      currentTargetedArrow = null;
      currentTargetedDescriptionPanel = null;
    };
  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback]);

  return (
    <>
      <div ref={mountRef} className="w-full h-full" />
    </>
  );
};

export default NftGallery;