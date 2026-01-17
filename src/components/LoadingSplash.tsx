"use client";

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface LoadingSplashProps {
  progress: number;
  message?: string;
}

const DiamondVisual = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = 150;
    const height = 150;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 3.5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // Diamond (Octahedron)
    const diamondGeo = new THREE.OctahedronGeometry(1, 0);
    const diamondMat = new THREE.MeshBasicMaterial({ 
      color: 0x00ccff, 
      transparent: true, 
      opacity: 0.3,
      wireframe: true
    });
    const diamond = new THREE.Mesh(diamondGeo, diamondMat);
    scene.add(diamond);

    // Inner Core
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    scene.add(core);

    // Electrons
    const createElectron = (radius: number, color: number, rotationOffset: number) => {
      const group = new THREE.Group();
      const electron = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 12, 12),
        new THREE.MeshBasicMaterial({ color })
      );
      electron.position.x = radius;
      group.add(electron);
      group.rotation.z = rotationOffset;
      scene.add(group);
      return group;
    };

    const e1 = createElectron(1.8, 0x00ffff, Math.PI / 4);
    const e2 = createElectron(2.2, 0xff00ff, -Math.PI / 3);

    let animationId: number;
    const animate = () => {
      const time = performance.now() * 0.001;
      
      diamond.rotation.y += 0.01;
      diamond.position.y = Math.sin(time * 2) * 0.1;
      
      e1.rotation.y += 0.03;
      e2.rotation.y -= 0.02;
      
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="w-[150px] h-[150px]" />;
};

const LoadingSplash: React.FC<LoadingSplashProps> = ({ progress, message = "Initializing Gallery..." }) => {
  return (
    <div className="fixed inset-0 z-[2000] bg-[#050505] flex flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-4 flex items-center justify-center">
        <div className="absolute w-48 h-48 bg-cyan-500/5 blur-[80px] rounded-full animate-pulse" />
        <div className="relative z-10 opacity-60">
          <DiamondVisual />
        </div>
      </div>
      
      <div className="max-w-xs w-full space-y-4">
        <h2 className="text-2xl font-black text-white/40 tracking-tighter uppercase italic">Nice Art Gallery</h2>
        <div className="space-y-2">
          <Progress 
            value={progress} 
            className="h-1 bg-white/5 [&>div]:bg-white/30" 
          />
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-white/30">
            <span>{message}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-10 flex items-center gap-2 text-white/30 text-xs font-medium">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading Assets & Textures</span>
      </div>
    </div>
  );
};

export default LoadingSplash;