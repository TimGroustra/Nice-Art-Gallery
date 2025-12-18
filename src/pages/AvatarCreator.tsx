import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import * as bodyPix from '@tensorflow-models/body-pix';
import '@tensorflow/tfjs';

// Define body part scales with initial values and wider ranges for adaptability
interface AvatarScales {
  overallHeight: number; // New: scales entire avatar height
  torsoHeight: number;
  torsoWidth: number;
  armLength: number;
  armWidth: number;
  legLength: number;
  legWidth: number;
  headSize: number;
  shoulderWidth: number; // New: controls shoulder spread
  hipWidth: number; // New: controls hip spread
}

const initialScales: AvatarScales = {
  overallHeight: 1,
  torsoHeight: 1,
  torsoWidth: 1,
  armLength: 1,
  armWidth: 1,
  legLength: 1,
  legWidth: 1,
  headSize: 1,
  shoulderWidth: 1,
  hipWidth: 1,
};

// Categories for image application
type UseAsCategory = 'skin' | 'accessory';
type ApplyToCategory = 'full-avatar' | 'head-only' | 'torso-only';

const AvatarCreator: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [scales, setScales] = useState<AvatarScales>(initialScales);

  // Image upload states
  const [selectedImage, setSelectedImage] = useState<string | null>(null); // URL of uploaded image
  const [useAsCategory, setUseAsCategory] = useState<UseAsCategory | null>(null);
  const [applyToCategory, setApplyToCategory] = useState<ApplyToCategory | null>(null);
  const [appliedImages, setAppliedImages] = useState<{ [key: string]: string }>({}); // Store applied images per category combo
  const [referenceImage, setReferenceImage] = useState<string | null>(null); // For body-shape reference display (unused now)
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Refs for Three.js objects (isolated to this component)
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Avatar body parts
  const torsoRef = useRef<THREE.Mesh | null>(null);
  const headRef = useRef<THREE.Mesh | null>(null);
  const leftShoulderRef = useRef<THREE.Mesh | null>(null);
  const rightShoulderRef = useRef<THREE.Mesh | null>(null);
  const leftHipRef = useRef<THREE.Mesh | null>(null);
  const rightHipRef = useRef<THREE.Mesh | null>(null);
  const leftUpperArmRef = useRef<THREE.Mesh | null>(null);
  const rightUpperArmRef = useRef<THREE.Mesh | null>(null);
  const leftLowerArmRef = useRef<THREE.Mesh | null>(null);
  const rightLowerArmRef = useRef<THREE.Mesh | null>(null);
  const leftHandRef = useRef<THREE.Mesh | null>(null);
  const rightHandRef = useRef<THREE.Mesh | null>(null);
  const leftUpperLegRef = useRef<THREE.Mesh | null>(null);
  const rightUpperLegRef = useRef<THREE.Mesh | null>(null);
  const leftLowerLegRef = useRef<THREE.Mesh | null>(null);
  const rightLowerLegRef = useRef<THREE.Mesh | null>(null);
  const leftFootRef = useRef<THREE.Mesh | null>(null);
  const rightFootRef = useRef<THREE.Mesh | null>(null);

  // Accessory refs (e.g., hat as example accessory)
  const accessoryRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
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
    renderer.setSize(window.innerWidth / 2, window.innerHeight / 2);
    mountRef.current.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 2;
    controls.maxDistance = 10;

    // Lighting (enhanced for better shading)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    const pointLight = new THREE.PointLight(0xffffff, 0.8);
    pointLight.position.set(-5, 5, 5);
    scene.add(pointLight);

    // Materials (skin with subtle texture)
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffdbac, // Skin tone
      roughness: 0.5,
      metalness: 0.1,
    });

    // Torso (cylinder for more organic shape)
    const torsoGeometry = new THREE.CylinderGeometry(0.4, 0.3, 2, 32);
    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
    torso.position.set(0, 0, 0);
    scene.add(torso);
    torsoRef.current = torso;

    // Head (sphere with neck)
    const headGeometry = new THREE.SphereGeometry(0.4, 32, 32);
    const head = new THREE.Mesh(headGeometry, bodyMaterial);
    head.position.set(0, 1.2, 0);
    scene.add(head);
    headRef.current = head;

    // Shoulders
    const shoulderGeometry = new THREE.SphereGeometry(0.25, 32, 32);
    const leftShoulder = new THREE.Mesh(shoulderGeometry, bodyMaterial);
    scene.add(leftShoulder);
    leftShoulderRef.current = leftShoulder;

    const rightShoulder = new THREE.Mesh(shoulderGeometry, bodyMaterial);
    scene.add(rightShoulder);
    rightShoulderRef.current = rightShoulder;

    // Hips
    const hipGeometry = new THREE.SphereGeometry(0.25, 32, 32);
    const leftHip = new THREE.Mesh(hipGeometry, bodyMaterial);
    scene.add(leftHip);
    leftHipRef.current = leftHip;

    const rightHip = new THREE.Mesh(hipGeometry, bodyMaterial);
    scene.add(rightHip);
    rightHipRef.current = rightHip;

    // Upper Arms (tapered cylinders)
    const upperArmGeometry = new THREE.CylinderGeometry(0.15, 0.1, 0.8, 32);
    const leftUpperArm = new THREE.Mesh(upperArmGeometry, bodyMaterial);
    scene.add(leftUpperArm);
    leftUpperArmRef.current = leftUpperArm;

    const rightUpperArm = new THREE.Mesh(upperArmGeometry, bodyMaterial);
    scene.add(rightUpperArm);
    rightUpperArmRef.current = rightUpperArm;

    // Lower Arms
    const lowerArmGeometry = new THREE.CylinderGeometry(0.1, 0.08, 0.7, 32);
    const leftLowerArm = new THREE.Mesh(lowerArmGeometry, bodyMaterial);
    scene.add(leftLowerArm);
    leftLowerArmRef.current = leftLowerArm;

    const rightLowerArm = new THREE.Mesh(lowerArmGeometry, bodyMaterial);
    scene.add(rightLowerArm);
    rightLowerArmRef.current = rightLowerArm;

    // Hands (simple boxes)
    const handGeometry = new THREE.BoxGeometry(0.2, 0.3, 0.1);
    const leftHand = new THREE.Mesh(handGeometry, bodyMaterial);
    scene.add(leftHand);
    leftHandRef.current = leftHand;

    const rightHand = new THREE.Mesh(handGeometry, bodyMaterial);
    scene.add(rightHand);
    rightHandRef.current = rightHand;

    // Upper Legs (tapered)
    const upperLegGeometry = new THREE.CylinderGeometry(0.2, 0.15, 1, 32);
    const leftUpperLeg = new THREE.Mesh(upperLegGeometry, bodyMaterial);
    scene.add(leftUpperLeg);
    leftUpperLegRef.current = leftUpperLeg;

    const rightUpperLeg = new THREE.Mesh(upperLegGeometry, bodyMaterial);
    scene.add(rightUpperLeg);
    rightUpperLegRef.current = rightUpperLeg;

    // Lower Legs
    const lowerLegGeometry = new THREE.CylinderGeometry(0.15, 0.12, 0.9, 32);
    const leftLowerLeg = new THREE.Mesh(lowerLegGeometry, bodyMaterial);
    scene.add(leftLowerLeg);
    leftLowerLegRef.current = leftLowerLeg;

    const rightLowerLeg = new THREE.Mesh(lowerLegGeometry, bodyMaterial);
    scene.add(rightLowerLeg);
    rightLowerLegRef.current = rightLowerLeg;

    // Feet
    const footGeometry = new THREE.BoxGeometry(0.25, 0.15, 0.4);
    const leftFoot = new THREE.Mesh(footGeometry, bodyMaterial);
    scene.add(leftFoot);
    leftFootRef.current = leftFoot;

    const rightFoot = new THREE.Mesh(footGeometry, bodyMaterial);
    scene.add(rightFoot);
    rightFootRef.current = rightFoot;

    // Accessory (example: simple hat plane - will apply texture later)
    const accessoryGeometry = new THREE.ConeGeometry(0.5, 0.8, 32); // Cone for hat
    const accessory = new THREE.Mesh(accessoryGeometry, bodyMaterial);
    scene.add(accessory);
    accessoryRef.current = accessory;

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

  // Update avatar proportions and connections when sliders change
  useEffect(() => {
    const effectiveOverallHeight = scales.overallHeight;

    // Torso
    if (torsoRef.current) {
      torsoRef.current.scale.set(scales.torsoWidth, scales.torsoHeight * effectiveOverallHeight, 1);
    }

    const torsoHeight = 2 * scales.torsoHeight * effectiveOverallHeight;
    const torsoHalfHeight = torsoHeight / 2;
    const torsoHalfWidth = 0.4 * scales.torsoWidth; // Base radius 0.4

    // Head
    if (headRef.current) {
      headRef.current.scale.set(scales.headSize, scales.headSize, scales.headSize);
      headRef.current.position.y = torsoHalfHeight + (0.4 * scales.headSize);
    }

    // Shoulders
    const shoulderY = torsoHalfHeight - 0.1;
    const shoulderXOffset = torsoHalfWidth + (0.25 * scales.shoulderWidth);
    if (leftShoulderRef.current) {
      leftShoulderRef.current.position.set(-shoulderXOffset, shoulderY, 0);
    }
    if (rightShoulderRef.current) {
      rightShoulderRef.current.position.set(shoulderXOffset, shoulderY, 0);
    }

    // Hips
    const hipY = -torsoHalfHeight + 0.1;
    const hipXOffset = torsoHalfWidth * 0.8 * scales.hipWidth;
    if (leftHipRef.current) {
      leftHipRef.current.position.set(-hipXOffset, hipY, 0);
    }
    if (rightHipRef.current) {
      rightHipRef.current.position.set(hipXOffset, hipY, 0);
    }

    // Upper Arms
    const upperArmLength = 0.8 * scales.armLength * effectiveOverallHeight;
    const upperArmY = shoulderY - (upperArmLength / 2);
    if (leftUpperArmRef.current) {
      leftUpperArmRef.current.scale.set(scales.armWidth, scales.armLength * effectiveOverallHeight, scales.armWidth);
      leftUpperArmRef.current.position.set(-shoulderXOffset, upperArmY, 0);
    }
    if (rightUpperArmRef.current) {
      rightUpperArmRef.current.scale.set(scales.armWidth, scales.armLength * effectiveOverallHeight, scales.armWidth);
      rightUpperArmRef.current.position.set(shoulderXOffset, upperArmY, 0);
    }

    // Lower Arms
    const lowerArmLength = 0.7 * scales.armLength * effectiveOverallHeight;
    const lowerArmY = upperArmY - (upperArmLength / 2) - (lowerArmLength / 2);
    if (leftLowerArmRef.current) {
      leftLowerArmRef.current.scale.set(scales.armWidth * 0.9, scales.armLength * effectiveOverallHeight * 0.9, scales.armWidth * 0.9);
      leftLowerArmRef.current.position.set(-shoulderXOffset, lowerArmY, 0);
    }
    if (rightLowerArmRef.current) {
      rightLowerArmRef.current.scale.set(scales.armWidth * 0.9, scales.armLength * effectiveOverallHeight * 0.9, scales.armWidth * 0.9);
      rightLowerArmRef.current.position.set(shoulderXOffset, lowerArmY, 0);
    }

    // Hands
    const handY = lowerArmY - (lowerArmLength / 2) - 0.15;
    if (leftHandRef.current) {
      leftHandRef.current.position.set(-shoulderXOffset, handY, 0);
    }
    if (rightHandRef.current) {
      rightHandRef.current.position.set(shoulderXOffset, handY, 0);
    }

    // Upper Legs
    const upperLegLength = scales.legLength * effectiveOverallHeight;
    const upperLegY = hipY - (upperLegLength / 2);
    if (leftUpperLegRef.current) {
      leftUpperLegRef.current.scale.set(scales.legWidth, scales.legLength * effectiveOverallHeight, scales.legWidth);
      leftUpperLegRef.current.position.set(-hipXOffset, upperLegY, 0);
    }
    if (rightUpperLegRef.current) {
      rightUpperLegRef.current.scale.set(scales.legWidth, scales.legLength * effectiveOverallHeight, scales.legWidth);
      rightUpperLegRef.current.position.set(hipXOffset, upperLegY, 0);
    }

    // Lower Legs
    const lowerLegLength = 0.9 * scales.legLength * effectiveOverallHeight;
    const lowerLegY = upperLegY - (upperLegLength / 2) - (lowerLegLength / 2);
    if (leftLowerLegRef.current) {
      leftLowerLegRef.current.scale.set(scales.legWidth * 0.8, scales.legLength * effectiveOverallHeight * 0.9, scales.legWidth * 0.8);
      leftLowerLegRef.current.position.set(-hipXOffset, lowerLegY, 0);
    }
    if (rightLowerLegRef.current) {
      rightLowerLegRef.current.scale.set(scales.legWidth * 0.8, scales.legLength * effectiveOverallHeight * 0.9, scales.legWidth * 0.8);
      rightLowerLegRef.current.position.set(hipXOffset, lowerLegY, 0);
    }

    // Feet
    const footY = lowerLegY - (lowerLegLength / 2) - 0.075;
    if (leftFootRef.current) {
      leftFootRef.current.position.set(-hipXOffset, footY, 0.15); // Slight forward offset for foot
    }
    if (rightFootRef.current) {
      rightFootRef.current.position.set(hipXOffset, footY, 0.15);
    }

    // Accessory (position on head)
    if (accessoryRef.current && headRef.current) {
      accessoryRef.current.position.set(0, headRef.current.position.y + (0.4 * scales.headSize) + 0.4, 0);
    }
  }, [scales]);

  // Handle image upload
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setUploadError('Please upload a valid image file.');
        return;
      }
      const imageUrl = URL.createObjectURL(file);
      setSelectedImage(imageUrl);
      setUploadError(null);
    }
  };

  // Apply image based on categories
  const applyImage = async () => {
    if (!selectedImage || !useAsCategory || !applyToCategory) return;

    const key = `${useAsCategory}-${applyToCategory}`;
    setAppliedImages((prev) => ({ ...prev, [key]: selectedImage }));

    const loader = new THREE.TextureLoader();

    if (useAsCategory === 'accessory') {
      // Apply accessory texture
      loader.load(selectedImage, (texture) => {
        if (accessoryRef.current) {
          (accessoryRef.current.material as THREE.MeshStandardMaterial).map = texture;
          (accessoryRef.current.material as THREE.MeshStandardMaterial).needsUpdate = true;
        }
      });
    } else if (useAsCategory === 'skin') {
      if (applyToCategory === 'head-only') {
        loader.load(selectedImage, (texture) => {
          if (headRef.current) {
            (headRef.current.material as THREE.MeshStandardMaterial).map = texture;
            (headRef.current.material as THREE.MeshStandardMaterial).needsUpdate = true;
          }
        });
      } else if (applyToCategory === 'torso-only') {
        loader.load(selectedImage, (texture) => {
          if (torsoRef.current) {
            (torsoRef.current.material as THREE.MeshStandardMaterial).map = texture;
            (torsoRef.current.material as THREE.MeshStandardMaterial).needsUpdate = true;
          }
        });
      } else if (applyToCategory === 'full-avatar') {
        // Full body: Use BodyPix for detection and mapping
        setIsProcessing(true);
        try {
          const net = await bodyPix.load();
          const img = new Image();
          img.src = selectedImage;
          await new Promise((resolve) => (img.onload = resolve));

          const segmentation = await net.segmentPersonParts(img, {
            flipHorizontal: false,
            internalResolution: 'medium',
            segmentationThreshold: 0.7,
          });

          // Body part mapping (BodyPix part IDs: e.g., 0: left_face, 1: right_face, 2: left_upper_arm_front, etc.)
          const partRefs: { [part: string]: React.RefObject<THREE.Mesh> } = {
            torso: torsoRef,
            head: headRef,
            left_upper_arm: leftUpperArmRef,
            right_upper_arm: rightUpperArmRef,
            left_lower_arm: leftLowerArmRef,
            right_lower_arm: rightLowerArmRef,
            left_hand: leftHandRef,
            right_hand: rightHandRef,
            left_upper_leg: leftUpperLegRef,
            right_upper_leg: rightUpperLegRef,
            left_lower_leg: leftLowerLegRef,
            right_lower_leg: rightLowerLegRef,
            left_foot: leftFootRef,
            right_foot: rightFootRef,
          };

          // Default color for autocompletion
          const defaultColor = new THREE.Color(0xffdbac); // Skin tone

          // For each part, extract masked texture or autocomplete
          for (const [partName, ref] of Object.entries(partRefs)) {
            if (!ref.current) continue;

            // Simple mapping from partName to BodyPix part IDs (this is approximate; adjust as needed)
            const partIdMap: { [key: string]: number[] } = {
              head: [0, 1], // left_face, right_face
              torso: [18, 19], // torso_front, torso_back
              left_upper_arm: [2, 3], // left_upper_arm_front, left_upper_arm_back
              right_upper_arm: [4, 5],
              left_lower_arm: [6, 7],
              right_lower_arm: [8, 9],
              left_hand: [10],
              right_hand: [11],
              left_upper_leg: [12, 13],
              right_upper_leg: [14, 15],
              left_lower_leg: [16, 17],
              right_lower_leg: [20, 21],
              left_foot: [22],
              right_foot: [23],
            };

            const partIds = partIdMap[partName] || [];

            if (partIds.length === 0) continue;

            // Create canvas for part texture
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;

            // Autocomplete: fill with default color
            ctx.fillStyle = '#' + defaultColor.getHexString();
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw detected parts if present
            let hasPart = false;
            for (let y = 0; y < segmentation.height; y++) {
              for (let x = 0; x < segmentation.width; x++) {
                const i = y * segmentation.width + x;
                if (partIds.includes(segmentation.data[i])) {
                  hasPart = true;
                  // Sample from original image (assuming segmentation aligns with img)
                  // Note: BodyPix output size may differ; resize if needed
                }
              }
            }

            if (hasPart) {
              // Draw original image
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

              // Mask to part (create mask canvas)
              const maskCanvas = document.createElement('canvas');
              maskCanvas.width = segmentation.width;
              maskCanvas.height = segmentation.height;
              const maskCtx = maskCanvas.getContext('2d');
              if (!maskCtx) continue;

              const imageData = maskCtx.createImageData(segmentation.width, segmentation.height);
              for (let i = 0; i < segmentation.data.length; i++) {
                imageData.data[i * 4 + 3] = partIds.includes(segmentation.data[i]) ? 255 : 0;
              }
              maskCtx.putImageData(imageData, 0, 0);

              // Scale mask to image size and apply
              ctx.globalCompositeOperation = 'source-in';
              ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
            } // If no part detected, canvas already has default color

            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;

            (ref.current.material as THREE.MeshStandardMaterial).map = texture;
            (ref.current.material as THREE.MeshStandardMaterial).needsUpdate = true;
          }
        } catch (error) {
          console.error('Error processing full body skin:', error);
          setUploadError('Failed to process image for full body mapping.');
        } finally {
          setIsProcessing(false);
        }
      }
    }

    // Reset for next upload
    setSelectedImage(null);
    setUseAsCategory(null);
    setApplyToCategory(null);
  };

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

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Customize Avatar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Image Upload Section */}
            <div className="space-y-4">
              <Label>Upload Image</Label>
              <Input type="file" accept="image/*" onChange={handleImageUpload} />
              {uploadError && (
                <Alert variant="destructive">
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              )}
              {selectedImage && (
                <div className="space-y-4">
                  <img src={selectedImage} alt="Uploaded" className="w-32 h-32 object-cover rounded" />
                  
                  <div>
                    <Label>Use as</Label>
                    <Select onValueChange={(value) => setUseAsCategory(value as UseAsCategory)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select use" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skin">Skin</SelectItem>
                        <SelectItem value="accessory">Accessory</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>Apply to</Label>
                    <Select onValueChange={(value) => setApplyToCategory(value as ApplyToCategory)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select area" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full-avatar">Full Avatar</SelectItem>
                        <SelectItem value="head-only">Head Only</SelectItem>
                        <SelectItem value="torso-only">Torso Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button onClick={applyImage} disabled={!useAsCategory || !applyToCategory || isProcessing}>
                    {isProcessing ? 'Processing...' : 'Apply Image'}
                  </Button>
                </div>
              )}
            </div>

            {/* Sliders */}
            <div className="space-y-2">
              <Label htmlFor="overallHeight">Overall Height (0.5 - 2)</Label>
              <Slider
                id="overallHeight"
                min={0.5}
                max={2}
                step={0.1}
                value={[scales.overallHeight]}
                onValueChange={(value) => handleSliderChange('overallHeight', value)}
              />
            </div>
            {/* ... (other sliders remain the same) */}
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