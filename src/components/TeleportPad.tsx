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
  const beamRef = useRef<THREE.Mesh | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);
  const animationRef = useRef<number>(0);
  const isActiveRef = useRef(false);

  useEffect(() => {
    // Create teleport pad base
    const geometry = new THREE.CylinderGeometry(1, 1, 0.2, 32);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x4a0080,
      emissive: 0x9932cc,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.2
    });
    
    const pad = new THREE.Mesh(geometry, material);
    pad.position.set(...position);
    scene.add(pad);
    padRef.current = pad;

    // Create teleport beam
    const beamGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0, 32);
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x9932cc,
      transparent: true,
      opacity: 0.7
    });
    
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.set(...position);
    beam.position.y += 2; // Start above the pad
    beam.scale.y = 0; // Initially hidden
    scene.add(beam);
    beamRef.current = beam;

    // Create particle system for teleport effect
    const particleCount = 100;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 2;
      positions[i3 + 1] = Math.random() * 4;
      positions[i3 + 2] = (Math.random() - 0.5) * 2;
      
      colors[i3] = 0.6; // R
      colors[i3 + 1] = 0.2; // G
      colors[i3 + 2] = 0.8; // B
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.8
    });
    
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.position.set(...position);
    particles.visible = false;
    scene.add(particles);
    particlesRef.current = particles;

    // Animation function
    const animate = () => {
      if (padRef.current) {
        // Pulsing effect for the pad
        const pulse = Math.sin(Date.now() * 0.005) * 0.1 + 1;
        padRef.current.scale.set(pulse, 1, pulse);
        
        // Rotate the pad slowly
        padRef.current.rotation.y += 0.01;
      }
      
      if (beamRef.current && isActiveRef.current) {
        // Animate beam
        const pulse = Math.sin(Date.now() * 0.01) * 0.2 + 1;
        beamRef.current.scale.x = pulse;
        beamRef.current.scale.z = pulse;
      }
      
      if (particlesRef.current && particlesRef.current.visible) {
        // Animate particles
        const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < positions.length; i += 3) {
          positions[i + 1] += 0.05; // Move particles upward
          if (positions[i + 1] > 4) {
            positions[i + 1] = 0; // Reset particle to bottom
          }
        }
        particlesRef.current.geometry.attributes.position.needsUpdate = true;
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();

    // Handle click interaction
    const handleClick = () => {
      if (!isActiveRef.current) {
        isActiveRef.current = true;
        
        // Show beam and particles
        if (beamRef.current) {
          beamRef.current.visible = true;
          beamRef.current.scale.y = 10;
        }
        
        if (particlesRef.current) {
          particlesRef.current.visible = true;
        }
        
        // Teleport after delay
        setTimeout(() => {
          onTeleport(targetPosition);
          
          // Hide effects
          if (beamRef.current) {
            beamRef.current.visible = false;
            beamRef.current.scale.y = 0;
          }
          
          if (particlesRef.current) {
            particlesRef.current.visible = false;
          }
          
          isActiveRef.current = false;
        }, 1500);
      }
    };

    // Add click event listener to the pad
    const handlePadClick = (event: MouseEvent) => {
      if (event.target === pad) {
        handleClick();
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
      
      if (beamRef.current) {
        scene.remove(beamRef.current);
        beamRef.current.geometry.dispose();
        (beamRef.current.material as THREE.Material).dispose();
      }
      
      if (particlesRef.current) {
        scene.remove(particlesRef.current);
        particlesRef.current.geometry.dispose();
        (particlesRef.current.material as THREE.Material).dispose();
      }
    };
  }, [position, targetPosition, onTeleport, scene]);

  return null; // This component doesn't render anything to the DOM
};

export default TeleportPad;