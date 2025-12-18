import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RotateCw } from 'lucide-react';

const AVATAR_MODEL_URL = "/avatars/base_rig.glb";

const AvatarEditor: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clockRef = useRef(new THREE.Clock());

  const initThree = () => {
    if (!mountRef.current) return;

    // Cleanup previous instance
    if (rendererRef.current) {
      rendererRef.current.dispose();
      mountRef.current.removeChild(rendererRef.current.domElement);
    }

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 1.5, 3);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Load Avatar
    const loader = new GLTFLoader();
    loader.load(
      AVATAR_MODEL_URL,
      (gltf) => {
        const avatar = gltf.scene;
        scene.add(avatar);

        // Simple rotation for viewing
        avatar.rotation.y = Math.PI / 4; 

        // Setup animation mixer if animations exist
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(avatar);
          mixerRef.current = mixer;
          const action = mixer.clipAction(gltf.animations[0]);
          action.play();
        }

        setLoading(false);
        setError(null);
      },
      (xhr) => {
        // Progress tracking (optional)
        console.log((xhr.loaded / xhr.total) * 100 + '% loaded');
      },
      (err) => {
        console.error('Error loading GLB model:', err);
        setError("Failed to load avatar model. Ensure 'public/avatars/base_rig.glb' exists.");
        setLoading(false);
      }
    );

    // Animation Loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      const delta = clockRef.current.getDelta();
      mixerRef.current?.update(delta);

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
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (mountRef.current && rendererRef.current.domElement.parentElement === mountRef.current) {
            mountRef.current.removeChild(rendererRef.current.domElement);
        }
      }
      mixerRef.current = null;
    };
  };

  useEffect(() => {
    initThree();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8">
        {/* Left Panel: Controls */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Avatar Editor Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This panel will contain controls for swapping heads, bodies, and accessories.
            </p>
            <Button disabled>
              <RotateCw className="mr-2 h-4 w-4" /> Regenerate Head
            </Button>
          </CardContent>
        </Card>

        {/* Right Panel: 3D Viewer */}
        <Card className="lg:h-[calc(100vh-4rem)]">
          <CardHeader>
            <CardTitle>3D Avatar Preview</CardTitle>
          </CardHeader>
          <CardContent className="h-[60vh] lg:h-[calc(100%-6rem)] p-0">
            <div ref={mountRef} className="w-full h-full relative">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AvatarEditor;