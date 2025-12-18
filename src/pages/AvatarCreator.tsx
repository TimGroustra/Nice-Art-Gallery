import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Define body part scales with initial values
interface AvatarScales {
  torsoHeight: number;
  torsoWidth: number;
  armLength: number;
  armWidth: number;
  legLength: number;
  legWidth: number;
  headSize: number;
}

const initialScales: AvatarScales = {
  torsoHeight: 1,
  torsoWidth: 1,
  armLength: 1,
  armWidth: 1,
  legLength: 1,
  legWidth: 1,
  headSize: 1,
};

const AvatarCreator: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [scales, setScales] = useState<AvatarScales>(initialScales);

  // Refs for Three.js objects (isolated to this component)
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Avatar body parts (simple primitives)
  const torsoRef = useRef<THREE.Mesh | null>(null);
  const headRef = useRef<THREE.Mesh | null>(null);
  const leftArmRef = useRef<THREE.Mesh | null>(null);
  const rightArmRef = useRef<THREE.Mesh | null>(null);
  const leftLegRef = useRef<THREE.Mesh | null>(null);
  const rightLegRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup (isolated)
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x2a2a2a);

    // Camera
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    cameraRef.current = camera;
    camera.position.set(0, 1, 5);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current = renderer;
    renderer.setSize(window.innerWidth / 2, window.innerHeight / 2); // Smaller canvas for sidebar layout
    mountRef.current.appendChild(renderer.domElement);

    // Controls (Orbit for 360 rotation)
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 2;
    controls.maxDistance = 10;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Avatar materials
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4a90e2 }); // Blue skin-like color

    // Create initial avatar parts
    // Torso
    const torsoGeometry = new THREE.BoxGeometry(1, 2, 0.5);
    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
    torso.position.set(0, 0, 0);
    scene.add(torso);
    torsoRef.current = torso;

    // Head
    const headGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const head = new THREE.Mesh(headGeometry, bodyMaterial);
    head.position.set(0, 1.5, 0);
    scene.add(head);
    headRef.current = head;

    // Arms
    const armGeometry = new THREE.CylinderGeometry(0.2, 0.2, 1.5, 32);
    const leftArm = new THREE.Mesh(armGeometry, bodyMaterial);
    leftArm.position.set(-0.75, 0.5, 0);
    leftArm.rotation.z = Math.PI / 2;
    scene.add(leftArm);
    leftArmRef.current = leftArm;

    const rightArm = new THREE.Mesh(armGeometry, bodyMaterial);
    rightArm.position.set(0.75, 0.5, 0);
    rightArm.rotation.z = -Math.PI / 2;
    scene.add(rightArm);
    rightArmRef.current = rightArm;

    // Legs
    const legGeometry = new THREE.CylinderGeometry(0.3, 0.3, 2, 32);
    const leftLeg = new THREE.Mesh(legGeometry, bodyMaterial);
    leftLeg.position.set(-0.3, -1.5, 0);
    scene.add(leftLeg);
    leftLegRef.current = leftLeg;

    const rightLeg = new THREE.Mesh(legGeometry, bodyMaterial);
    rightLeg.position.set(0.3, -1.5, 0);
    scene.add(rightLeg);
    rightLegRef.current = rightLeg;

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / 2 / (window.innerHeight / 2);
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth / 2, window.innerHeight / 2);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Update avatar proportions when sliders change
  useEffect(() => {
    // Torso
    if (torsoRef.current) {
      torsoRef.current.scale.set(scales.torsoWidth, scales.torsoHeight, 1);
    }
    // Head
    if (headRef.current) {
      headRef.current.scale.set(scales.headSize, scales.headSize, scales.headSize);
      headRef.current.position.y = 1 + (scales.torsoHeight / 2) * scales.torsoHeight;
    }
    // Arms
    if (leftArmRef.current && rightArmRef.current) {
      leftArmRef.current.scale.set(scales.armWidth, scales.armLength, scales.armWidth);
      rightArmRef.current.scale.set(scales.armWidth, scales.armLength, scales.armWidth);
      leftArmRef.current.position.y = (scales.torsoHeight / 2) * scales.torsoHeight - scales.armLength / 2;
      rightArmRef.current.position.y = (scales.torsoHeight / 2) * scales.torsoHeight - scales.armLength / 2;
    }
    // Legs
    if (leftLegRef.current && rightLegRef.current) {
      leftLegRef.current.scale.set(scales.legWidth, scales.legLength, scales.legWidth);
      rightLegRef.current.scale.set(scales.legWidth, scales.legLength, scales.legWidth);
      leftLegRef.current.position.y = -(scales.torsoHeight / 2) * scales.torsoHeight - scales.legLength / 2;
      rightLegRef.current.position.y = -(scales.torsoHeight / 2) * scales.torsoHeight - scales.legLength / 2;
    }
  }, [scales]);

  const handleSliderChange = (key: keyof AvatarScales, value: number[]) => {
    setScales((prev) => ({ ...prev, [key]: value[0] }));
  };

  const resetSliders = () => {
    setScales(initialScales);
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 3D Viewer */}
        <Card>
          <CardHeader>
            <CardTitle>Avatar Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={mountRef} className="w-full h-[500px] border rounded-lg" />
          </CardContent>
        </Card>

        {/* Sliders */}
        <Card>
          <CardHeader>
            <CardTitle>Customize Body Proportions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="torsoHeight">Torso Height (0.5 - 2)</Label>
              <Slider
                id="torsoHeight"
                min={0.5}
                max={2}
                step={0.1}
                value={[scales.torsoHeight]}
                onValueChange={(value) => handleSliderChange('torsoHeight', value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="torsoWidth">Torso Width (0.5 - 2)</Label>
              <Slider
                id="torsoWidth"
                min={0.5}
                max={2}
                step={0.1}
                value={[scales.torsoWidth]}
                onValueChange={(value) => handleSliderChange('torsoWidth', value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="armLength">Arm Length (0.5 - 2)</Label>
              <Slider
                id="armLength"
                min={0.5}
                max={2}
                step={0.1}
                value={[scales.armLength]}
                onValueChange={(value) => handleSliderChange('armLength', value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="armWidth">Arm Width (0.5 - 2)</Label>
              <Slider
                id="armWidth"
                min={0.5}
                max={2}
                step={0.1}
                value={[scales.armWidth]}
                onValueChange={(value) => handleSliderChange('armWidth', value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="legLength">Leg Length (0.5 - 2)</Label>
              <Slider
                id="legLength"
                min={0.5}
                max={2}
                step={0.1}
                value={[scales.legLength]}
                onValueChange={(value) => handleSliderChange('legLength', value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="legWidth">Leg Width (0.5 - 2)</Label>
              <Slider
                id="legWidth"
                min={0.5}
                max={2}
                step={0.1}
                value={[scales.legWidth]}
                onValueChange={(value) => handleSliderChange('legWidth', value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="headSize">Head Size (0.5 - 2)</Label>
              <Slider
                id="headSize"
                min={0.5}
                max={2}
                step={0.1}
                value={[scales.headSize]}
                onValueChange={(value) => handleSliderChange('headSize', value)}
              />
            </div>

            <Button onClick={resetSliders} variant="outline" className="w-full">
              Reset to Default
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AvatarCreator;