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
  const silhouetteRefs = useRef<{ leftLeg: THREE.Mesh; rightLeg: THREE.Mesh; leftArm: THREE.Mesh; rightArm: THREE.Mesh } | null>(null);

  useEffect(() => {
    const group = groupRef.current;
    scene.add(group);

    // Clear existing children
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    if (!state.enabled) return;

    if (state.type === 'silhouette') {
      // Create a simple grey mannequin
      const mat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });
      
      // Body
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.25), mat);
      torso.position.y = 1.15;
      group.add(torso);

      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), mat);
      head.position.y = 1.65;
      group.add(head);

      // Arms
      const armGeo = new THREE.BoxGeometry(0.12, 0.6, 0.12);
      const leftArm = new THREE.Mesh(armGeo, mat);
      leftArm.position.set(-0.35, 1.2, 0);
      group.add(leftArm);

      const rightArm = new THREE.Mesh(armGeo, mat);
      rightArm.position.set(0.35, 1.2, 0);
      group.add(rightArm);

      // Legs
      const legGeo = new THREE.BoxGeometry(0.15, 0.8, 0.15);
      const leftLeg = new THREE.Mesh(legGeo, mat);
      leftLeg.position.set(-0.15, 0.4, 0);
      group.add(leftLeg);

      const rightLeg = new THREE.Mesh(legGeo, mat);
      rightLeg.position.set(0.15, 0.4, 0);
      group.add(rightLeg);

      silhouetteRefs.current = { leftLeg, rightLeg, leftArm, rightArm };
    } else if (state.type === 'rpm' && state.url) {
      const loader = new GLTFLoader();
      loader.load(state.url, (gltf) => {
        const model = gltf.scene;
        model.scale.set(1, 1, 1);
        group.add(model);

        mixerRef.current = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => {
          actionsRef.current[clip.name.toLowerCase()] = mixerRef.current!.clipAction(clip);
        });

        // Default to idle if available
        if (actionsRef.current['idle']) actionsRef.current['idle'].play();
      });
    }

    return () => {
      scene.remove(group);
      if (mixerRef.current) mixerRef.current.stopAllAction();
    };
  }, [state, scene]);

  // Animation and positioning loop
  useEffect(() => {
    let lastTime = performance.now();
    let frameId: number;

    const update = () => {
      const time = performance.now();
      const delta = (time - lastTime) / 1000;
      lastTime = time;

      if (state.enabled && groupRef.current) {
        // Position avatar relative to camera
        // We place it slightly behind the camera for a "light third person" or 
        // just invisible to player but visible in mirrors/to others
        const offset = new THREE.Vector3(0, -1.6, 0.5); // Adjusted to match ground
        offset.applyQuaternion(camera.quaternion);
        
        // Lock Y orientation to camera but keep feet on ground
        groupRef.current.position.copy(camera.position).add(new THREE.Vector3(0, -1.6, 0));
        
        // Rotation: Look where the camera looks, but only around Y axis
        const camEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        groupRef.current.rotation.y = camEuler.y + Math.PI; // Face same way as camera

        // Animate Silhouette
        if (state.type === 'silhouette' && silhouetteRefs.current) {
          const { leftLeg, rightLeg, leftArm, rightArm } = silhouetteRefs.current;
          if (isWalking) {
            const swing = Math.sin(time * 0.01) * 0.4;
            leftLeg.rotation.x = swing;
            rightLeg.rotation.x = -swing;
            leftArm.rotation.x = -swing;
            rightArm.rotation.x = swing;
          } else {
            leftLeg.rotation.x = THREE.MathUtils.lerp(leftLeg.rotation.x, 0, 0.1);
            rightLeg.rotation.x = THREE.MathUtils.lerp(rightLeg.rotation.x, 0, 0.1);
            leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, 0, 0.1);
            rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, 0, 0.1);
          }
        }

        // Animate GLB
        if (mixerRef.current) {
          mixerRef.current.update(delta);
          const walkAction = actionsRef.current['walk'] || actionsRef.current['run'];
          const idleAction = actionsRef.current['idle'];

          if (isWalking && walkAction) {
            if (idleAction) idleAction.fadeOut(0.2);
            walkAction.reset().fadeIn(0.2).play();
          } else if (idleAction) {
            if (walkAction) walkAction.fadeOut(0.2);
            idleAction.reset().fadeIn(0.2).play();
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