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
  prevArrow: THREE.Mesh;
  nextArrow: THREE.Mesh;
  titleMesh: THREE.Mesh;
  descriptionMesh: THREE.Mesh;
  title: string; // Store title for modal
  description: string; // Store full description for modal
}

interface NftGalleryProps {
  setInstructionsVisible: (visible: boolean) => void;
  onPanelClick: (title: string, description: string) => void;
}

// Global state for UI interaction
let currentTargetedPanel: Panel | null = null;
let currentTargetedArrow: THREE.Mesh | null = null;

// Helper function to create a text texture using Canvas
const createTextTexture = (text: string, width: number, height: number, fontSize: number, color: string = 'white'): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return new THREE.CanvasTexture(document.createElement('canvas'));

    const resolution = 512;
    canvas.width = resolution * (width / height);
    canvas.height = resolution;

    context.clearRect(0, 0, canvas.width, canvas.height);

    const actualFontSize = fontSize;
    context.font = `bold ${actualFontSize}px Arial`;
    context.fillStyle = color;
    context.textAlign = 'left';
    context.textBaseline = 'top';

    const padding = 20;
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
            context.fillText(line, padding, y);
            line = words[n] + ' ';
            y += lineHeight;
            if (y > canvas.height - padding) break;
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


const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible, onPanelClick }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isLocked, setIsLocked] = useState(false); 

  const manageVideoPlayback = useCallback((shouldPlay: boolean) => {
    if (videoRef.current) {
      if (shouldPlay) {
        if ((window as any).galleryControls?.isLocked?.()) {
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
      
      panel.title = metadata.title;
      panel.description = metadata.description;

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

      if (panel.titleMesh.material instanceof THREE.MeshBasicMaterial && panel.titleMesh.material.map) {
        panel.titleMesh.material.map.dispose();
      }
      const titleTexture = createTextTexture(metadata.title, 1.5, 0.5, 80, 'white');
      (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTexture;
      panel.titleMesh.visible = true;

      if (panel.descriptionMesh.material instanceof THREE.MeshBasicMaterial && panel.descriptionMesh.material.map) {
        panel.descriptionMesh.material.map.dispose();
      }
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
      panel.title = 'Error';
      panel.description = 'Failed to load NFT details.';
      
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

    const roomSize = 10;
    const wallHeight = 4;
    const panelYPosition = 1.8; 
    const boundary = roomSize / 2 - 0.5; 

    const floorGeometry = new THREE.PlaneGeometry(roomSize, roomSize);
    const floorMaterial = new THREE.MeshPhongMaterial({ color: 0x006400, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);

    const ceilingGeometry = new THREE.PlaneGeometry(roomSize, roomSize);
    const ceilingMaterial = new THREE.MeshPhongMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
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
    
    const amb = new THREE.AmbientLight(0x404050, 0.8); 
    scene.add(amb);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, wallHeight, 0);
    scene.add(hemiLight);

    const panelGeometry = new THREE.PlaneGeometry(2, 2);
    const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
    
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15);
    arrowShape.lineTo(0.3, 0);
    arrowShape.lineTo(0, -0.15);
    arrowShape.lineTo(0, 0.15);
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const ARROW_COLOR_DEFAULT = 0xcccccc;
    const ARROW_COLOR_HOVER = 0x00ff00;
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: ARROW_COLOR_DEFAULT, side: THREE.DoubleSide });
    
    const ARROW_DEPTH_OFFSET = 0.02; 
    const ARROW_PANEL_OFFSET = 1.5;
    const TEXT_DEPTH_OFFSET = 0.03;

    const TEXT_PANEL_WIDTH = 1.5;
    const TITLE_HEIGHT = 0.5;
    const DESCRIPTION_HEIGHT = 1.5;
    const TEXT_BLOCK_OFFSET_X = 3;
    
    const placeholderTexture = createTextTexture('Loading...', TEXT_PANEL_WIDTH, TITLE_HEIGHT + DESCRIPTION_HEIGHT, 30, 'white');
    const placeholderMaterial = new THREE.MeshBasicMaterial({ 
        map: placeholderTexture, 
        transparent: true, 
        side: THREE.DoubleSide,
        alphaTest: 0.01,
        depthWrite: false
    });
    const titleGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, TITLE_HEIGHT);
    const descriptionGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, DESCRIPTION_HEIGHT);

    const panelConfigs: { wallName: keyof PanelConfig, position: [number, number, number], rotation: [number, number, number] }[] = [
      { wallName: 'north-wall', position: [0, panelYPosition, -roomSize / 2 + ARROW_DEPTH_OFFSET], rotation: [0, 0, 0] },
      { wallName: 'south-wall', position: [0, panelYPosition, roomSize / 2 - ARROW_DEPTH_OFFSET], rotation: [0, Math.PI, 0] },
      { wallName: 'east-wall', position: [roomSize / 2 - ARROW_DEPTH_OFFSET, panelYPosition, 0], rotation: [0, -Math.PI / 2, 0] },
      { wallName: 'west-wall', position: [-roomSize / 2 + ARROW_DEPTH_OFFSET, panelYPosition, 0], rotation: [0, Math.PI / 2, 0] },
    ];

    panelConfigs.forEach(config => {
      const mesh = new THREE.Mesh(panelGeometry, panelMaterial.clone());
      mesh.position.set(config.position[0], config.position[1], config.position[2]);
      mesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      scene.add(mesh);
      
      const arrowY = config.position[1];
      
      const wallRotation = new THREE.Euler().set(config.rotation[0], config.rotation[1], config.rotation[2], 'XYZ');
      const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);
      const upVector = new THREE.Vector3(0, 1, 0).applyEuler(wallRotation);
      const forwardVector = new THREE.Vector3(0, 0, 1).applyEuler(wallRotation);
      
      const basePosition = new THREE.Vector3(config.position[0], panelYPosition, config.position[2]);
      
      const textGroupPosition = basePosition.clone();
      textGroupPosition.addScaledVector(rightVector, -TEXT_BLOCK_OFFSET_X); 
      
      const titleMesh = new THREE.Mesh(titleGeometry, placeholderMaterial.clone());
      titleMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      
      const titlePosition = textGroupPosition.clone();
      titlePosition.addScaledVector(upVector, (DESCRIPTION_HEIGHT / 2) - (TITLE_HEIGHT / 2)); 
      titlePosition.addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      titleMesh.position.copy(titlePosition);
      scene.add(titleMesh);

      const descriptionMesh = new THREE.Mesh(descriptionGeometry, placeholderMaterial.clone());
      descriptionMesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      
      const descriptionPosition = textGroupPosition.clone();
      descriptionPosition.addScaledVector(upVector, -(TITLE_HEIGHT / 2)); 
      descriptionPosition.addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
      descriptionMesh.position.copy(descriptionPosition);
      scene.add(descriptionMesh);
      
      const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      prevArrow.rotation.set(config.rotation[0], config.rotation[1] + Math.PI, config.rotation[2]);
      const prevPosition = new THREE.Vector3(config.position[0], arrowY, config.position[2]);
      prevPosition.addScaledVector(rightVector, -ARROW_PANEL_OFFSET);
      prevArrow.position.copy(prevPosition);
      scene.add(prevArrow);
      
      const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      nextArrow.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      const nextPosition = new THREE.Vector3(config.position[0], arrowY, config.position[2]);
      nextPosition.addScaledVector(rightVector, ARROW_PANEL_OFFSET);
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
        title: '',
        description: '',
      };
      panelsRef.current.push(panel);
      
      const source = getCurrentNftSource(config.wallName);
      if (source) {
        updatePanelContent(panel, source);
      }
    });

    let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const speed = 20.0;

    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
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
    const interactiveMeshes = panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow]);

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
      } else if (currentTargetedPanel) {
        controls.unlock();
        onPanelClick(currentTargetedPanel.title, currentTargetedPanel.description);
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown, false);

    let prevTime = performance.now();
    
    const animate = () => {
      requestAnimationFrame(animate);
      const time = performance.now();
      const delta = (time - prevTime) / 1000;

      lights.forEach((light, index) => {
        const angle = time * 0.0005 + index * (Math.PI * 2 / NUM_DISCO_LIGHTS);
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
        
        panelsRef.current.forEach(panel => {
          if (panel.prevArrow.material instanceof THREE.MeshBasicMaterial) panel.prevArrow.material.color.setHex(ARROW_COLOR_DEFAULT);
          if (panel.nextArrow.material instanceof THREE.MeshBasicMaterial) panel.nextArrow.material.color.setHex(ARROW_COLOR_DEFAULT);
        });
        
        currentTargetedPanel = null;
        currentTargetedArrow = null;

        if (intersects.length > 0 && intersects[0].distance < 5) {
          const intersectedMesh = intersects[0].object as THREE.Mesh;
          const panel = panelsRef.current.find(p => p.mesh === intersectedMesh || p.prevArrow === intersectedMesh || p.nextArrow === intersectedMesh);
          if (panel) {
            if (intersectedMesh === panel.mesh) {
              currentTargetedPanel = panel;
            } else if (intersectedMesh === panel.prevArrow || intersectedMesh === panel.nextArrow) {
              currentTargetedArrow = intersectedMesh;
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
      document.removeEventListener('mousedown', onDocumentMouseDown, false);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onWindowResize);
      mountRef.current?.removeChild(renderer.domElement);
      controls.dispose();
      
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
  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback, onPanelClick]);

  return (
    <>
      <video ref={videoRef} style={{ display: 'none' }} playsInline autoPlay muted />
      <div ref={mountRef} className="w-full h-full" />
    </>
  );
};

export default NftGallery;