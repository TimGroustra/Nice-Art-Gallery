import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import { AvatarState } from '@/hooks/use-avatar-config';
import { Loader2 } from 'lucide-react';

interface AvatarPreviewProps {
  state: AvatarState;
}

const AvatarPreview: React.FC<AvatarPreviewProps> = ({ state }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const rotationRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastMouseXRef = useRef(0);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // slate-900

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.2, 3.5);
    camera.lookAt(0, 1, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);

    const spotLight = new THREE.SpotLight(0xffffff, 0.5);
    spotLight.position.set(-5, 5, 5);
    scene.add(spotLight);

    // Pedestal
    const pedestalGeo = new THREE.CylinderGeometry(0.8, 1, 0.1, 32);
    const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = -0.05;
    scene.add(pedestal);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    let mixer: THREE.AnimationMixer | null = null;
    let clock = new THREE.Clock();

    const loadModel = async () => {
      if (!state.enabled) return;
      setLoading(true);
      
      const loader = new GLTFLoader();
      const modelUrl = state.type === 'silhouette' ? '/models/mannequin.glb' : state.url;

      if (!modelUrl) {
        setLoading(false);
        return;
      }

      try {
        const gltf = await loader.loadAsync(modelUrl);
        const model = gltf.scene;
        
        // Normalize model height and position
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = 1.8 / size.y;
        model.scale.setScalar(scale);
        model.position.y = 0;

        if (state.type === 'silhouette') {
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.material = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
            }
          });
        }

        modelGroup.add(model);

        // Try to load idle animation
        try {
          const animGltf = await loader.loadAsync('/models/idle.glb');
          if (animGltf.animations[0]) {
            mixer = new THREE.AnimationMixer(model);
            const action = mixer.clipAction(animGltf.animations[0]);
            action.play();
          }
        } catch (e) {
          if (gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            mixer.clipAction(gltf.animations[0]).play();
          }
        }
      } catch (err) {
        console.error("Failed to load preview model:", err);
      } finally {
        setLoading(false);
      }
    };

    loadModel();

    // Interaction handlers
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      lastMouseXRef.current = e.clientX;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - lastMouseXRef.current;
      rotationRef.current += deltaX * 0.01;
      lastMouseXRef.current = e.clientX;
    };
    const onMouseUp = () => { isDraggingRef.current = false; };

    mountRef.current.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    let frameId: number;
    const animate = () => {
      const delta = clock.getDelta();
      if (mixer) mixer.update(delta);
      
      modelGroup.rotation.y = rotationRef.current;
      
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      mountRef.current?.removeEventListener('mousedown', onMouseDown);
      mountRef.current?.removeChild(renderer.domElement);
      renderer.dispose();
      modelGroup.clear();
      scene.clear();
    };
  }, [state.enabled, state.type, state.url]);

  return (
    <div ref={mountRef} className="w-full h-full relative cursor-grab active:cursor-grabbing rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shadow-inner">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm z-10">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-2" />
          <span className="text-xs text-slate-400 font-medium">Loading 3D Model...</span>
        </div>
      )}
      {!state.enabled && !loading && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm italic p-8 text-center">
          Avatar is disabled. Enable it to see your character.
        </div>
      )}
      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center pointer-events-none">
        <div className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
          <span className="text-[10px] text-white/70 uppercase font-bold tracking-widest">3D Preview</span>
        </div>
        <div className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
          <span className="text-[10px] text-white/70">Drag to Rotate</span>
        </div>
      </div>
    </div>
  );
};

export default AvatarPreview;