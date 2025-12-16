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
  const avatarGroupRef = useRef<THREE.Group | null>(null);
  const animationFrameRef = useRef<number>();
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  const renderAvatar = async (newProfile: AvatarProfile) => {
    setLoading(true);
    setError(null);
    
    // Cleanup previous avatar
    if (avatarGroupRef.current) {
      avatarGroupRef.current.traverse((obj) => {
        if ((obj as any).geometry) (obj as any).geometry.dispose();
        if ((obj as any).material) {
          const mat = (obj as any).material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else (mat as THREE.Material).dispose();
        }
      });
      avatarGroupRef.current.parent?.remove(avatarGroupRef.current);
      avatarGroupRef.current = null;
    }

    try {
      const newAvatar = await buildAvatar(newProfile);
      avatarGroupRef.current = newAvatar;
      
      const scene = sceneRef.current;
      if (scene) {
        scene.add(newAvatar);
        // Center the avatar
        newAvatar.position.y = 0; 
      }
      
    } catch (e) {
      console.error("Error building avatar:", e);
      setError("Failed to render avatar model.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    renderAvatar(profile);
  }, [profile]);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x1a1a1a);

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 100);
    camera.position.set(0, 1.6, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.target.set(0, 1.0, 0); // Look at the center of the avatar
    
    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    const onResize = () => {
      const newWidth = mountRef.current?.clientWidth || width;
      const newHeight = mountRef.current?.clientHeight || height;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', onResize);
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', onResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      controls.dispose();
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

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