import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface TeleportPadProps {
  position: [number, number, number];
  targetPosition: [number, number, number];
  onTeleport: (target: [number, number, number]) => void;
  scene: THREE.Scene;
}

const TeleportPad: React.FC<TeleportPadProps> = ({ 
  position, 
  targetPosition, 
  onTeleport,
  scene
}) => {
  const padRef = useRef<THREE.Mesh | null>(null);
  const glowRef = useRef<THREE.Mesh | null>(null);
  const animationRef = useRef<number>(0);
  const isActiveRef = useRef(false);

  useEffect(() => {
    // Create square teleport pad base (2x2 units)
    const geometry = new THREE.BoxGeometry(2, 0.2, 2);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x1a3f7c, // Dark blue base
      emissive: 0x0066cc,
      emissiveIntensity: 0.3,
      metalness: 0.7,
      roughness: 0.3
    });
    
    const pad = new THREE.Mesh(geometry, material);
    pad.position.set(...position);
    scene.add(pad);
    padRef.current = pad;

    // Create glowing effect around the pad
    const glowGeometry = new THREE.BoxGeometry(2.2, 0.1, 2.2);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x00aaff, // Bright blue glow
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.set(...position);
    glow.position.y += 0.1; // Slightly above the pad
    scene.add(glow);
    glowRef.current = glow;

    // Animation function for pulsing glow
    const animate = () => {
      if (glowRef.current) {
        // Pulsing effect for the glow
        const pulse = Math.sin(Date.now() * 0.005) * 0.3 + 0.7;
        glowRef.current.scale.set(pulse, 1, pulse);
        
        // Color pulsing effect
        const intensity = Math.sin(Date.now() * 0.003) * 0.2 + 0.8;
        (glowRef.current.material as THREE.MeshBasicMaterial).opacity = intensity * 0.6;
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();

    // Handle teleport interaction
    const handleTeleport = () => {
      if (!isActiveRef.current) {
        isActiveRef.current = true;
        
        // Visual feedback for activation
        if (padRef.current) {
          (padRef.current.material as THREE.MeshStandardMaterial).emissive.set(0x00ffff);
        }
        
        if (glowRef.current) {
          (glowRef.current.material as THREE.MeshBasicMaterial).color.set(0xffffff);
        }
        
        // Teleport after delay
        setTimeout(() => {
          onTeleport(targetPosition);
          
          // Reset visual feedback
          if (padRef.current) {
            (padRef.current.material as THREE.MeshStandardMaterial).emissive.set(0x0066cc);
          }
          
          if (glowRef.current) {
            (glowRef.current.material as THREE.MeshBasicMaterial).color.set(0x00aaff);
          }
          
          isActiveRef.current = false;
        }, 800);
      }
    };

    // Add click event listener to the pad
    const handlePadClick = (event: MouseEvent) => {
      if (event.target === pad) {
        handleTeleport();
      }
    };
    
    pad.addEventListener('click', handlePadClick as EventListener);

    return () => {
      cancelAnimationFrame(animationRef.current);
      
      if (padRef.current) {
        padRef.current.removeEventListener('click', handlePadClick as EventListener);
        scene.remove(padRef.current);
        padRef.current.geometry.dispose();
        if (Array.isArray(padRef.current.material)) {
          padRef.current.material.forEach(m => m.dispose());
        } else {
          (padRef.current.material as THREE.Material).dispose();
        }
      }
      
      if (glowRef.current) {
        scene.remove(glowRef.current);
        glowRef.current.geometry.dispose();
        (glowRef.current.material as THREE.Material).dispose();
      }
    };
  }, [position, targetPosition, onTeleport, scene]);

  return null; // This component doesn't render anything to the DOM
};

export default TeleportPad;