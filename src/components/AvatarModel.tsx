import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import { AvatarState } from '@/hooks/use-avatar-config';

interface AvatarModelProps {
  state: AvatarState;
  isWalking: boolean;
  scene: THREE.Scene;
  camera: THREE.Camera;
}

const AvatarModel: React.FC<AvatarModelProps> = ({ state, isWalking, scene, camera }) => {
  const groupRef = useRef<THREE.Group>(new THREE.Group());
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<{ [key: string]: THREE.AnimationAction }>({});
  const currentActionRef = useRef<string | null>(null);

  useEffect(() => {
    const group = groupRef.current;
    scene.add(group);

    // Clear existing children
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    }

    if (!state.enabled) return;

    const loader = new GLTFLoader();

    const setupModel = (model: THREE.Group, animations: THREE.AnimationClip[]) => {
      group.add(model);
      const mixer = new THREE.AnimationMixer(model);
      mixerRef.current = mixer;

      animations.forEach((clip) => {
        const name = clip.name.toLowerCase();
        actionsRef.current[name] = mixer.clipAction(clip);
      });

      // Default state
      const initial = isWalking ? 'walk' : 'idle';
      if (actionsRef.current[initial]) {
        actionsRef.current[initial].play();
        currentActionRef.current = initial;
      } else if (animations.length > 0) {
        const first = animations[0].name.toLowerCase();
        actionsRef.current[first].play();
        currentActionRef.current = first;
      }
    };

    if (state.type === 'silhouette') {
      loader.load('/models/mannequin.glb', (gltf) => {
        const model = gltf.scene;
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = new THREE.MeshStandardMaterial({ 
              color: 0x444444, 
              roughness: 0.8,
              metalness: 0.2
            });
          }
        });
        
        const loadExternalAnims = async () => {
          try {
            const [idleGltf, walkGltf] = await Promise.all([
              loader.loadAsync('/models/idle.glb'),
              loader.loadAsync('/models/walk.glb')
            ]);
            
            const clips = [...gltf.animations];
            if (idleGltf.animations[0]) {
              idleGltf.animations[0].name = 'idle';
              clips.push(idleGltf.animations[0]);
            }
            if (walkGltf.animations[0]) {
              walkGltf.animations[0].name = 'walk';
              clips.push(walkGltf.animations[0]);
            }
            
            setupModel(model, clips);
          } catch (e) {
            console.error("Failed to load animations", e);
            setupModel(model, gltf.animations);
          }
        };

        loadExternalAnims();
      });
    } else if (state.type === 'rpm' && state.url) {
      loader.load(state.url, (gltf) => {
        setupModel(gltf.scene, gltf.animations);
      });
    }

    return () => {
      scene.remove(group);
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
      }
      actionsRef.current = {};
      currentActionRef.current = null;
    };
  }, [state, scene]);

  useEffect(() => {
    let lastTime = performance.now();
    let frameId: number;

    const update = () => {
      const time = performance.now();
      const delta = (time - lastTime) / 1000;
      lastTime = time;

      if (state.enabled && groupRef.current) {
        groupRef.current.position.copy(camera.position).add(new THREE.Vector3(0, -1.6, 0));
        const camEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        groupRef.current.rotation.y = camEuler.y + Math.PI; 

        if (mixerRef.current) {
          mixerRef.current.update(delta);
          
          const desired = isWalking ? 'walk' : 'idle';
          if (currentActionRef.current !== desired) {
            const current = actionsRef.current[currentActionRef.current || ''];
            const next = actionsRef.current[desired] || (isWalking ? actionsRef.current['run'] : null);
            
            if (next) {
              if (current) current.fadeOut(0.2);
              next.reset().fadeIn(0.2).play();
              currentActionRef.current = desired;
            }
          }
        }
      }

      frameId = requestAnimationFrame(update);
    };

    update();
    return () => cancelAnimationFrame(frameId);
  }, [state, isWalking, camera]);

  return null;
};

export default AvatarModel;