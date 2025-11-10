import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

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
  };
}

interface NftGalleryProps {
  onPanelClick: (metadataUrl: string) => void;
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

// Sample metadata URLs
const initialSamplePanels = [
  "https://raw.githubusercontent.com/dyad-sh/dyad-assets/main/nft-gallery-samples/sample1.json",
  "https://raw.githubusercontent.com/dyad-sh/dyad-assets/main/nft-gallery-samples/sample2.json",
  "https://raw.githubusercontent.com/dyad-sh/dyad-assets/main/nft-gallery-samples/sample3.json",
  "https://raw.githubusercontent.com/dyad-sh/dyad-assets/main/nft-gallery-samples/sample4.json",
  "https://raw.githubusercontent.com/dyad-sh/dyad-assets/main/nft-gallery-samples/sample5.json",
  "https://raw.githubusercontent.com/dyad-sh/dyad-assets/main/nft-gallery-samples/sample6.json",
];

const NftGallery: React.FC<NftGalleryProps> = ({ onPanelClick }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const panelMeshesRef = useRef<PanelMesh[]>([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const clockRef = useRef(new THREE.Clock());
  const moveStateRef = useRef({ forward: 0, backward: 0, left: 0, right: 0 });
  const speed = 4.0;

  const [instructionsVisible, setInstructionsVisible] = useState(true);
  const [selectedPanel, setSelectedPanel] = useState<PanelMesh | null>(null);

  // --- Panel Logic ---

  const fetchAndApplyToMesh = useCallback(async (metadataUrl: string, mesh: PanelMesh) => {
    const url = normalizeUrl(metadataUrl);
    mesh.userData.metadataUrl = metadataUrl;
    mesh.userData.loaded = false;
    mesh.material = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x000000, side: THREE.DoubleSide });
    mesh.material.needsUpdate = true;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Metadata fetch failed ' + res.status);
      const json = await res.json();

      let imageUrl = json.image || json.image_url || json.imageURI || json.gif;
      imageUrl = normalizeUrl(imageUrl);
      if (!imageUrl) throw new Error('No image field in metadata');

      const loader = new THREE.TextureLoader();
      loader.crossOrigin = '';
      loader.load(imageUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          mesh.material.map = tex;
          mesh.material.needsUpdate = true;
          mesh.userData.loaded = true;
          mesh.userData.metadata = {
            title: json.name || '',
            description: json.description || '',
            image: imageUrl,
            source: metadataUrl
          };
        },
        (xhr) => {
          // console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        (err) => {
          console.warn('Texture load error for:', metadataUrl, err);
        }
      );

    } catch (err) {
      console.warn('fetchAndApplyToMesh error for:', metadataUrl, err);
    }
  }, []);

  const createPanel = useCallback((scene: THREE.Scene, position: THREE.Vector3, rotationY: number, metadataUrl: string) => {
    const w = 1.8, h = 1.2;
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x000000, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat) as PanelMesh;
    mesh.position.copy(position);
    mesh.rotation.y = rotationY;
    mesh.userData = { metadataUrl: metadataUrl, loaded: false };
    scene.add(mesh);
    panelMeshesRef.current.push(mesh);
    if (metadataUrl) fetchAndApplyToMesh(metadataUrl, mesh);
    return mesh;
  }, [fetchAndApplyToMesh]);

  const setupPanels = useCallback((scene: THREE.Scene, urls: string[]) => {
    // Clear existing
    panelMeshesRef.current.forEach(m => scene.remove(m));
    panelMeshesRef.current.length = 0;

    // Right wall panels (facing left)
    for (let i = 0; i < 3; i++) {
      const pos = new THREE.Vector3(7.89, 1.8, -2 + i * 2);
      const rot = Math.PI / 2; // face -x
      createPanel(scene, pos, rot, urls[i] || '');
    }
    // Left wall panels (facing right)
    for (let i = 0; i < 3; i++) {
      const pos = new THREE.Vector3(-7.89, 1.8, -2 + i * 2);
      const rot = -Math.PI / 2; // face +x
      createPanel(scene, pos, rot, urls[i + 3] || '');
    }
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

    // Floor
    const floorGeo = new THREE.CircleGeometry(8, 64);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.2, roughness: 0.6 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Walls
    const room = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x11111f, roughness: 0.7 });
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
    scene.add(room);

    // Lights
    const lights: THREE.PointLight[] = [];
    const lightColors = [0xff0066, 0x00ffd5, 0xffff00];
    for (let i = 0; i < 3; i++) {
      const pl = new THREE.PointLight(lightColors[i], 1.2, 15, 2);
      pl.position.set(Math.cos(i / 3 * Math.PI * 2) * 3, 2.5, Math.sin(i / 3 * Math.PI * 2) * 3);
      scene.add(pl);
      lights.push(pl);
    }
    const amb = new THREE.AmbientLight(0x404050, 0.6);
    scene.add(amb);

    // Setup initial panels
    setupPanels(scene, initialSamplePanels);

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

      raycasterRef.current.setFromCamera({ x: 0, y: 0 }, camera);
      const intersects = raycasterRef.current.intersectObjects(panelMeshesRef.current, false);

      if (intersects.length > 0) {
        const mesh = intersects[0].object as PanelMesh;
        const meta = mesh.userData.metadataUrl;
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

      // Update disco lights rotate
      for (let i = 0; i < lights.length; i++) {
        const a = performance.now() * 0.0004 * (i + 1);
        lights[i].position.x = Math.cos(a + i) * 3;
        lights[i].position.z = Math.sin(a + i) * 3;
      }

      // Movement
      if (controls.isLocked) {
        const direction = new THREE.Vector3();
        direction.z = moveStateRef.current.forward - moveStateRef.current.backward;
        direction.x = moveStateRef.current.right - moveStateRef.current.left;
        direction.normalize();

        controls.moveForward(direction.z * speed * delta);
        controls.moveRight(direction.x * speed * delta);

        // Raycast for highlighting/selection
        raycasterRef.current.setFromCamera({ x: 0, y: 0 }, camera);
        const intersects = raycasterRef.current.intersectObjects(panelMeshesRef.current, false);

        if (intersects.length > 0) {
          const mesh = intersects[0].object as PanelMesh;
          if (selectedPanel !== mesh) {
            if (selectedPanel) {
              (selectedPanel.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
            }
            (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x101010);
            setSelectedPanel(mesh);
          }
        } else {
          if (selectedPanel) {
            (selectedPanel.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
            setSelectedPanel(null);
          }
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // --- Cleanup ---
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onWindowResize);
      document.removeEventListener('click', onDocumentClick);
      mountRef.current?.removeChild(renderer.domElement);
      controls.dispose();
      renderer.dispose();
    };
  }, [onPanelClick, setupPanels, createPanel, fetchAndApplyToMesh, selectedPanel]);

  // Pass imperative functions up to the parent component
  useEffect(() => {
    (window as any).galleryControls = {
      getSelectedPanelUrl: () => selectedPanel?.userData.metadataUrl || '',
      lockControls: () => controlsRef.current?.lock(),
    };
  }, [selectedPanel]);


  return (
    <div ref={mountRef} className="fixed inset-0 z-0" />
  );
};

export default NftGallery;