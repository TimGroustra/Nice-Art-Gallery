import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { AvatarProfile } from '@/avatar/AvatarState';
import { buildAvatar } from '@/avatar/AvatarBuilder';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface AvatarPreviewProps {
  profile: AvatarProfile;
}

const AvatarPreview: React.FC<AvatarPreviewProps> = ({ profile }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Three.js references initialized once
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const avatarGroupRef = useRef<THREE.Group | null>(null);
  const animationFrameRef = useRef<number>();

  /** INIT — runs ONCE to set up the scene, camera, renderer, and controls. */
  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x1a1a1a);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 100);
    camera.position.set(0, 1.6, 3);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.target.set(0, 1.0, 0); // Look at the center of the avatar
    
    // 5. Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // 6. Animation Loop
    const animate = () => {
      controls.update();
      if (avatarGroupRef.current) {
        // Simple idle rotation for preview
        avatarGroupRef.current.rotation.y += 0.003;
      }
      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    // 7. Resize Handler
    const onResize = () => {
      const newWidth = mountRef.current?.clientWidth || width;
      const newHeight = mountRef.current?.clientHeight || height;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', onResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', onResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      controls.dispose();
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []); // Empty dependency array: runs ONCE

  /** AVATAR UPDATE — runs ONLY when profile changes */
  useEffect(() => {
    if (!sceneRef.current) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    
    console.log("Avatar rebuilt triggered by profile change.");

    (async () => {
      // Cleanup previous avatar
      if (avatarGroupRef.current) {
        sceneRef.current!.remove(avatarGroupRef.current);
        // Dispose logic (simplified, full disposal is complex but necessary in production)
        avatarGroupRef.current.traverse((obj) => {
          if ((obj as any).geometry) (obj as any).geometry.dispose();
          if ((obj as any).material) {
            const mat = (obj as any).material;
            if (Array.isArray(mat)) mat.forEach(m => m.dispose());
            else (mat as THREE.Material).dispose();
          }
        });
        avatarGroupRef.current = null;
      }

      try {
        const newAvatar = await buildAvatar(profile);
        if (cancelled) return;

        avatarGroupRef.current = newAvatar;
        sceneRef.current!.add(newAvatar);
        
        // Center the avatar
        newAvatar.position.y = 0; 
        
      } catch (e) {
        console.error("Error building avatar:", e);
        setError("Failed to render avatar model.");
      } finally {
        if (!cancelled) {
            setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile]); // Dependency array: runs when profile changes

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Avatar Preview</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 relative">
        <div ref={mountRef} className="w-full h-full min-h-[400px] relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-900/50 text-white p-4 z-10">
              {error}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AvatarPreview;