import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three-stdlib';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Loader2 } from 'lucide-react';

// Define the structure for the avatar parts we can swap
export interface AvatarPart {
  name: string;
  url: string;
  boneName: string; // The bone the part should be attached to (e.g., "Head", "Spine2")
}

// Define the handles exposed by this component
export interface AvatarViewerHandles {
  swapPart: (partType: 'head' | 'body' | 'accessory', newPart: AvatarPart) => void;
  setAnimation: (clipName: string) => void;
  rotateAvatar: (angle: number) => void;
}

const BASE_RIG_URL = "/avatars/base_rig.glb";

const AvatarViewer = forwardRef<AvatarViewerHandles, {}>((props, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const avatarRef = useRef<THREE.Group | null>(null);
  const clockRef = useRef(new THREE.Clock());
  const currentAnimationsRef = useRef<THREE.AnimationClip[]>([]);

  // --- Core Three.js Setup ---

  const initScene = useCallback(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // Cleanup previous instance
    if (rendererRef.current) {
      rendererRef.current.dispose();
      mountRef.current.removeChild(rendererRef.current.domElement);
    }

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 1.5, 3);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls (OrbitControls for easy viewing/rotation)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 1.0, 0); // Look at the center of the avatar
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);
    
    // Ground Plane
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8, metalness: 0.1 })
    );
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);

    // Animation Loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      const delta = clockRef.current.getDelta();
      mixerRef.current?.update(delta);
      controls.update();

      if (sceneRef.current && cameraRef.current && rendererRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    // Handle Resize
    const handleResize = () => {
      if (mountRef.current && cameraRef.current && rendererRef.current) {
        const newWidth = mountRef.current.clientWidth;
        const newHeight = mountRef.current.clientHeight;
        cameraRef.current.aspect = newWidth / newHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(newWidth, newHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (mountRef.current && rendererRef.current.domElement.parentElement === mountRef.current) {
            mountRef.current.removeChild(rendererRef.current.domElement);
        }
      }
      mixerRef.current = null;
      avatarRef.current = null;
    };
  }, []);

  // --- Model Loading and Swapping Logic ---

  const loadModel = useCallback(async (url: string): Promise<THREE.Group> => {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.load(url, (gltf) => {
        resolve(gltf.scene);
      }, undefined, reject);
    });
  }, []);

  const loadBaseRig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loader = new GLTFLoader();
      const gltf = await new Promise<GLTF>((resolve, reject) => {
        loader.load(BASE_RIG_URL, resolve, undefined, reject);
      });

      const avatar = gltf.scene;
      avatarRef.current = avatar;
      sceneRef.current?.add(avatar);

      // Setup animation mixer
      if (gltf.animations && gltf.animations.length > 0) {
        currentAnimationsRef.current = gltf.animations;
        const mixer = new THREE.AnimationMixer(avatar);
        mixerRef.current = mixer;
        // Play the first animation (e.g., the walk cycle)
        const action = mixer.clipAction(gltf.animations[0]);
        action.play();
      }

      setLoading(false);
    } catch (err) {
      console.warn('Error loading base rig GLB. Using placeholder cube.', err);
      
      // --- Placeholder Cube Fallback ---
      const cubeGeometry = new THREE.BoxGeometry(0.5, 1.5, 0.5);
      const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x00ffff });
      const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
      cube.position.y = 0.75; // Center the cube on the ground plane
      
      const placeholderGroup = new THREE.Group();
      placeholderGroup.add(cube);
      
      avatarRef.current = placeholderGroup;
      sceneRef.current?.add(placeholderGroup);
      
      setError("Failed to load base rig. Displaying placeholder.");
      setLoading(false);
    }
  }, []);

  const swapPart = useCallback(async (partType: 'head' | 'body' | 'accessory', newPart: AvatarPart) => {
    if (!avatarRef.current) {
      console.error("Avatar not loaded yet.");
      return;
    }
    
    // If we are using the placeholder cube, swapping parts is not possible.
    if (avatarRef.current.children.length === 1 && avatarRef.current.children[0].type === 'Mesh') {
        console.warn("Cannot swap parts on placeholder avatar.");
        return;
    }

    try {
      // 1. Load the new part mesh
      const newMesh = await loadModel(newPart.url);
      
      // 2. Find the target bone/parent in the base rig
      const targetBone = avatarRef.current.getObjectByName(newPart.boneName);

      if (!targetBone) {
        console.error(`Bone/Parent '${newPart.boneName}' not found in the rig.`);
        setError(`Failed to swap part: Target bone '${newPart.boneName}' missing.`);
        return;
      }

      // 3. Remove existing parts of the same type attached to this bone
      targetBone.children.forEach(child => {
        if (child.type === 'Mesh' || child.type === 'Group') {
            targetBone.remove(child);
        }
      });
      
      // 4. Attach the new mesh
      targetBone.add(newMesh);
      
      console.log(`Successfully swapped ${partType} with mesh from ${newPart.url}`);

    } catch (e) {
      console.error(`Failed to swap ${partType}:`, e);
      setError(`Failed to load or attach new ${partType} part.`);
    }
  }, [loadModel]);

  const setAnimation = useCallback((clipName: string) => {
    if (!mixerRef.current || currentAnimationsRef.current.length === 0) return;

    const clip = currentAnimationsRef.current.find(c => c.name === clipName);
    if (!clip) {
      console.warn(`Animation clip '${clipName}' not found.`);
      return;
    }

    // Stop all current actions
    mixerRef.current.stopAllAction();
    
    // Play the new action
    const action = mixerRef.current.clipAction(clip);
    action.reset().play();
  }, []);

  const rotateAvatar = useCallback((angle: number) => {
    if (avatarRef.current) {
      avatarRef.current.rotation.y += angle;
    }
  }, []);

  // Expose functions via ref
  useImperativeHandle(ref, () => ({
    swapPart,
    setAnimation,
    rotateAvatar,
  }));

  // Initial setup and loading
  useEffect(() => {
    const cleanup = initScene();
    loadBaseRig();
    return cleanup;
  }, [initScene, loadBaseRig]);

  return (
    <div className="w-full h-full relative">
      <div ref={mountRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-destructive/10 p-4 z-10">
          <p className="text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
});

export default AvatarViewer;