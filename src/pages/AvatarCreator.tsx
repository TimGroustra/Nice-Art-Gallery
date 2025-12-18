import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import * as bodyPix from '@tensorflow-models/body-pix';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

// --- Minimal types to satisfy the compiler when direct imports fail ---
interface Keypoint {
  score: number;
  part: string;
  position: { x: number; y: number };
}

interface Pose {
  score: number;
  keypoints: Keypoint[];
}
// --------------------------------------------------------------------

// --- Types and Constants ---

type ImageCategory = 'body' | 'accessory' | null;
type PartKey = 'face' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';

interface SegmentedPart {
  name: string;
  key: PartKey;
  imageUrl: string; // URL of the segmented image
}

const PART_MAPPINGS: Record<PartKey, { name: string; ids: number[] }> = {
  face: { name: 'Face', ids: [0, 1] }, // left_face, right_face
  torso: { name: 'Torso', ids: [6, 7, 8, 9] }, // left_chest, right_chest, left_hip, right_hip
  leftArm: { name: 'Left Arm', ids: [2, 3] }, // left_upper_arm, left_lower_arm
  rightArm: { name: 'Right Arm', ids: [4, 5] }, // right_upper_arm, right_lower_arm
  leftLeg: { name: 'Left Leg', ids: [10, 11] }, // left_upper_leg, left_lower_leg
  rightLeg: { name: 'Right Leg', ids: [12, 13] }, // right_upper_leg, right_lower_leg
};

// --- 3D Helpers ---

const createCylinder = (start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material) => {
  const height = start.distanceTo(end);
  const cylinderGeo = new THREE.CylinderGeometry(radius, radius, height, 32);
  const cylinder = new THREE.Mesh(cylinderGeo, material);
  cylinder.position.lerpVectors(start, end, 0.5);
  cylinder.lookAt(end);
  return cylinder;
};

const createSphere = (position: THREE.Vector3, radius: number, material: THREE.Material) => {
  const sphereGeo = new THREE.SphereGeometry(radius, 32, 32);
  const sphere = new THREE.Mesh(sphereGeo, material);
  sphere.position.copy(position);
  return sphere;
};

// --- Segmentation Utility ---

function extractSegmentedPart(img: HTMLImageElement, segmentation: bodyPix.PartSegmentation, targetPartIds: number[]): string {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imageData = ctx.createImageData(img.width, img.height);
  const data = imageData.data;
  const segmentationData = segmentation.data;

  // Draw the original image onto a temporary canvas
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = img.width;
  tempCanvas.height = img.height;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return '';
  tempCtx.drawImage(img, 0, 0);
  const originalData = tempCtx.getImageData(0, 0, img.width, img.height).data;

  // Filter pixels based on segmentation map
  for (let i = 0; i < segmentationData.length; i++) {
    const partId = segmentationData[i];
    const pixelIndex = i * 4;

    if (partId !== -1 && targetPartIds.includes(partId)) {
      // Copy pixel data
      data[pixelIndex] = originalData[pixelIndex];     // R
      data[pixelIndex + 1] = originalData[pixelIndex + 1]; // G
      data[pixelIndex + 2] = originalData[pixelIndex + 2]; // B
      data[pixelIndex + 3] = 255; // A (fully opaque)
    } else {
      // Make pixel transparent
      data[pixelIndex + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

// --- Component ---

const AvatarCreator: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ImageCategory>(null);
  const [segmentedParts, setSegmentedParts] = useState<SegmentedPart[]>([]);
  const [appliedPartKey, setAppliedPartKey] = useState<PartKey | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const avatarGroupRef = useRef<THREE.Group | null>(null);
  const accessoryGroupRef = useRef<THREE.Group | null>(null);
  const bodyMeshMapRef = useRef<Partial<Record<PartKey, THREE.Mesh[]>>>({});

  // Function to initialize the 3D avatar structure based on pose
  const initializeAvatar = useCallback((img: HTMLImageElement, pose: Pose) => {
    if (!avatarGroupRef.current) return;

    // Clear previous body
    while (avatarGroupRef.current.children.length > 0) {
      const child = avatarGroupRef.current.children[0];
      avatarGroupRef.current.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    bodyMeshMapRef.current = {};

    // Keypoints map
    const keypoints = pose.keypoints.reduce((map, kp) => {
      map[kp.part] = kp;
      return map;
    }, {} as { [part: string]: Keypoint });

    // Helper to get position, falling back to average if missing
    const getPos = (part: string, fallback?: THREE.Vector2) => {
      const kp = keypoints[part];
      return kp ? new THREE.Vector2(kp.position.x / img.width, kp.position.y / img.height) : fallback ?? new THREE.Vector2(0.5, 0.5);
    };

    // Calculate normalized positions
    const headPos = getPos('nose');
    const leftShoulderPos = getPos('leftShoulder');
    const rightShoulderPos = getPos('rightShoulder');
    const leftHipPos = getPos('leftHip');
    const rightHipPos = getPos('rightHip');
    const leftElbowPos = getPos('leftElbow');
    const leftWristPos = getPos('leftWrist');
    const rightElbowPos = getPos('rightElbow');
    const rightWristPos = getPos('rightWrist');
    const leftKneePos = getPos('leftKnee');
    const leftAnklePos = getPos('leftAnkle');
    const rightKneePos = getPos('rightKnee');
    const rightAnklePos = getPos('rightAnkle');

    const shoulderMidPos = leftShoulderPos.clone().lerp(rightShoulderPos, 0.5);
    const hipMidPos = leftHipPos.clone().lerp(rightHipPos, 0.5);

    // Scale factor to make avatar life-sized (assume average height ~1.7m)
    const heightNormalized = Math.abs(headPos.y - leftAnklePos.y);
    const avatarScale = heightNormalized > 0.1 ? 1.7 / heightNormalized : 1.7;

    // Positions in 3D space (y downward in image, upward in 3D)
    const to3D = (pos: THREE.Vector2) => new THREE.Vector3(
      (pos.x - 0.5) * 2, // x: -1 to 1
      (1 - pos.y) * 2,  // y: invert and scale
      0
    ).multiplyScalar(avatarScale);

    // 3D Coordinates
    const head3D = to3D(headPos);
    const leftShoulder3D = to3D(leftShoulderPos);
    const rightShoulder3D = to3D(rightShoulderPos);
    const leftHip3D = to3D(leftHipPos);
    const rightHip3D = to3D(rightHipPos);
    const shoulderMid3D = to3D(shoulderMidPos);
    const hipMid3D = to3D(hipMidPos);
    const leftElbow3D = to3D(leftElbowPos);
    const leftWrist3D = to3D(leftWristPos);
    const rightElbow3D = to3D(rightElbowPos);
    const rightWrist3D = to3D(rightWristPos);
    const leftKnee3D = to3D(leftKneePos);
    const leftAnkle3D = to3D(leftAnklePos);
    const rightKnee3D = to3D(rightKneePos);
    const rightAnkle3D = to3D(rightAnklePos);

    // Base material (placeholder, will be replaced by segmented textures)
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 1.0 });

    // --- Face/Head ---
    const head = createSphere(head3D, 0.2 * avatarScale, baseMaterial.clone());
    avatarGroupRef.current?.add(head);
    bodyMeshMapRef.current.face = [head];

    // --- Torso ---
    const torso = createCylinder(shoulderMid3D, hipMid3D, 0.3 * avatarScale, baseMaterial.clone());
    avatarGroupRef.current?.add(torso);
    bodyMeshMapRef.current.torso = [torso];

    // --- Left Arm ---
    const upperLeftArm = createCylinder(leftShoulder3D, leftElbow3D, 0.1 * avatarScale, baseMaterial.clone());
    const lowerLeftArm = createCylinder(leftElbow3D, leftWrist3D, 0.08 * avatarScale, baseMaterial.clone());
    avatarGroupRef.current?.add(upperLeftArm, lowerLeftArm);
    bodyMeshMapRef.current.leftArm = [upperLeftArm, lowerLeftArm];

    // --- Right Arm ---
    const upperRightArm = createCylinder(rightShoulder3D, rightElbow3D, 0.1 * avatarScale, baseMaterial.clone());
    const lowerRightArm = createCylinder(rightElbow3D, rightWrist3D, 0.08 * avatarScale, baseMaterial.clone());
    avatarGroupRef.current?.add(upperRightArm, lowerRightArm);
    bodyMeshMapRef.current.rightArm = [upperRightArm, lowerRightArm];

    // --- Left Leg ---
    const upperLeftLeg = createCylinder(leftHip3D, leftKnee3D, 0.15 * avatarScale, baseMaterial.clone());
    const lowerLeftLeg = createCylinder(leftKnee3D, leftAnkle3D, 0.12 * avatarScale, baseMaterial.clone());
    avatarGroupRef.current?.add(upperLeftLeg, lowerLeftLeg);
    bodyMeshMapRef.current.leftLeg = [upperLeftLeg, lowerLeftLeg];

    // --- Right Leg ---
    const upperRightLeg = createCylinder(rightHip3D, rightKnee3D, 0.15 * avatarScale, baseMaterial.clone());
    const lowerRightLeg = createCylinder(rightKnee3D, rightAnkle3D, 0.12 * avatarScale, baseMaterial.clone());
    avatarGroupRef.current?.add(upperRightLeg, lowerRightLeg);
    bodyMeshMapRef.current.rightLeg = [upperRightLeg, lowerRightLeg];

    // Center the avatar at the origin (0, 0, 0)
    const centerOffset = new THREE.Vector3(0, -hipMid3D.y, 0);
    avatarGroupRef.current.position.copy(centerOffset);

  }, []);

  // Refactored image processing logic
  const processImage = useCallback(async (img: HTMLImageElement) => {
    setIsProcessing(true);
    setUploadError(null);
    setSegmentedParts([]);
    setAppliedPartKey(null);

    try {
      const net = await bodyPix.load({
        architecture: 'MobileNetV1',
        outputStride: 16,
        multiplier: 0.75,
        quantBytes: 2,
      });
      
      // 1. Get segmentation (which includes pose)
      const rawParts = await net.segmentPersonParts(img, {
        flipHorizontal: false,
        internalResolution: 'medium',
        segmentationThreshold: 0.7,
      });
      
      // Ensure we handle the result as a single PartSegmentation object
      const parts = Array.isArray(rawParts) ? rawParts[0] : rawParts;
      
      // Cast to bodyPix.PartSegmentation to access the pose property
      const partSegmentation = parts as bodyPix.PartSegmentation;
      
      const pose = partSegmentation.pose; // Extract pose from segmentation result

      if (!pose || pose.score < 0.5) {
        throw new Error('No person detected or low confidence. Please use an image with a clear, full-body view.');
      }

      // 2. Initialize 3D avatar based on pose
      initializeAvatar(img, pose as Pose); // Cast pose to local Pose type

      // 3. Extract segmented parts for preview
      const extractedParts: SegmentedPart[] = [];
      for (const key in PART_MAPPINGS) {
        const partConfig = PART_MAPPINGS[key as PartKey];
        // Pass the correctly typed segmentation object
        const imageUrl = extractSegmentedPart(img, partSegmentation, partConfig.ids);
        extractedParts.push({
          name: partConfig.name,
          key: key as PartKey,
          imageUrl,
        });
      }
      setSegmentedParts(extractedParts);
      
      toast.success("Image processed! Select parts below to apply textures.");

    } catch (error) {
      console.error('Error processing image:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to process image.');
    } finally {
      setIsProcessing(false);
    }
  }, [initializeAvatar]);

  // Handle applying a segmented part texture to the 3D model
  const handleApplyPart = useCallback((partKey: PartKey) => {
    const part = segmentedParts.find(p => p.key === partKey);
    if (!part) return;

    const meshes = bodyMeshMapRef.current[partKey];
    if (!meshes || meshes.length === 0) {
        setUploadError(`Could not find 3D meshes for ${part.name}.`);
        return;
    }
    
    // Dispose old textures
    meshes.forEach(mesh => {
        if (mesh.material instanceof THREE.MeshStandardMaterial && mesh.material.map) {
            mesh.material.map.dispose();
            mesh.material.map = null;
        }
    });

    // Load and apply new texture
    const loader = new THREE.TextureLoader();
    loader.load(part.imageUrl, (texture) => {
        meshes.forEach(mesh => {
            if (mesh.material instanceof THREE.MeshStandardMaterial) {
                mesh.material.map = texture;
                mesh.material.needsUpdate = true;
                mesh.material.transparent = true;
            }
        });
        setAppliedPartKey(partKey);
        toast.success(`${part.name} texture applied successfully.`);
    }, undefined, (error) => {
        console.error("Failed to load texture for part:", error);
        setUploadError(`Failed to load texture for ${part.name}.`);
    });
  }, [segmentedParts]);
  
  // Handle accessory application (simplified, using Coco-SSD)
  const handleApplyAccessory = async () => {
    if (!selectedImage) return;
    
    setIsProcessing(true);
    
    try {
        const img = new Image();
        img.src = selectedImage;
        await new Promise((resolve) => (img.onload = resolve));
        
        // Clear previous accessories
        if (accessoryGroupRef.current) {
            while (accessoryGroupRef.current.children.length > 0) {
                const child = accessoryGroupRef.current.children[0];
                accessoryGroupRef.current.remove(child);
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    (child.material as THREE.Material).dispose();
                }
            }
        }

        const model = await cocoSsd.load();
        const predictions = await model.detect(img);

        if (predictions.length > 0) {
            const topPrediction = predictions[0];
            const detectedClass = topPrediction.class; 
            
            let accessoryGeometry: THREE.BufferGeometry;
            let position = new THREE.Vector3(0, 1.2, 0);
            let scale = 1;

            if (detectedClass === 'hat' || detectedClass === 'cap') {
                accessoryGeometry = new THREE.ConeGeometry(0.5, 0.8, 32);
                position.set(0, 1.2, 0); 
            } else if (detectedClass === 'backpack') {
                accessoryGeometry = new THREE.BoxGeometry(0.6, 0.8, 0.3);
                position.set(0, 0.8, -0.31); 
            } else {
                accessoryGeometry = new THREE.SphereGeometry(0.3, 32, 32);
                position.set(0, 1.2, 0);
            }

            const accessoryMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
            const accessory = new THREE.Mesh(accessoryGeometry, accessoryMaterial);
            accessory.position.copy(position);
            accessory.scale.set(scale, scale, scale);

            const loader = new THREE.TextureLoader();
            loader.load(selectedImage, (texture) => {
                accessoryMaterial.map = texture;
                accessoryMaterial.needsUpdate = true;
            });

            accessoryGroupRef.current?.add(accessory);
            toast.success(`Accessory (${detectedClass}) applied successfully.`);
        } else {
            setUploadError('No recognizable accessory object detected in the image.');
        }
    } catch (error) {
        console.error('Error processing accessory image:', error);
        setUploadError('Failed to process accessory image.');
    } finally {
        setIsProcessing(false);
        setSelectedImage(null);
        setSelectedCategory(null);
    }
  };

  // Three.js initialization useEffect
  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x2a2a2a);

    // Camera
    const camera = new THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
    cameraRef.current = camera;
    camera.position.set(0, 1, 5);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererRef.current = renderer;
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 2;
    controls.maxDistance = 10;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    const pointLight = new THREE.PointLight(0xffffff, 0.8);
    pointLight.position.set(-5, 5, 5);
    scene.add(pointLight);

    // Avatar group for body parts
    const avatarGroup = new THREE.Group();
    scene.add(avatarGroup);
    avatarGroupRef.current = avatarGroup;

    // Accessory group
    const accessoryGroup = new THREE.Group();
    scene.add(accessoryGroup);
    accessoryGroupRef.current = accessoryGroup;

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
      if (!mountRef.current || !cameraRef.current || !rendererRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);
    
    // Initial resize call to set correct size
    handleResize();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Handle image upload change
  const handleImageUploadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setUploadError('Please upload a valid image file.');
        return;
      }
      const imageUrl = URL.createObjectURL(file);
      setSelectedImage(imageUrl);
      setUploadError(null);
      setSegmentedParts([]);
      setSelectedCategory(null);
      setAppliedPartKey(null);
      
      // Clear 3D model when new image is uploaded
      if (avatarGroupRef.current) {
          while (avatarGroupRef.current.children.length > 0) {
              avatarGroupRef.current.remove(avatarGroupRef.current.children[0]);
          }
      }
      if (accessoryGroupRef.current) {
          while (accessoryGroupRef.current.children.length > 0) {
              accessoryGroupRef.current.remove(accessoryGroupRef.current.children[0]);
          }
      }
    }
  };
  
  // Handle category selection change
  const handleCategoryChange = (value: string) => {
      const category = value as ImageCategory;
      setSelectedCategory(category);
      
      if (category === 'body' && selectedImage) {
          const img = new Image();
          img.src = selectedImage;
          img.onload = () => processImage(img);
          img.onerror = () => setUploadError('Failed to load image for processing.');
      } else if (category === 'accessory' && selectedImage) {
          // Clear body segmentation results if switching to accessory mode
          setSegmentedParts([]);
      }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 3D Viewer */}
        <Card className="lg:sticky lg:top-8 lg:h-[calc(100vh-4rem)]">
          <CardHeader>
            <CardTitle>Avatar Preview (Use mouse to rotate)</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={mountRef} className="w-full aspect-square max-h-[60vh] border rounded-lg bg-gray-800 relative overflow-hidden">
                {/* Three.js canvas will be appended here */}
            </div>
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
              <Label htmlFor="image-upload">Upload NFT Image</Label>
              <Input id="image-upload" type="file" accept="image/*" onChange={handleImageUploadChange} />
              
              {selectedImage && (
                <div className="space-y-4 pt-2">
                    <Label>Select Target</Label>
                    <Select value={selectedCategory || ''} onValueChange={handleCategoryChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Body or Accessory" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="body">Body Parts (Segmentation)</SelectItem>
                        <SelectItem value="accessory">Accessory (Object Detection)</SelectItem>
                      </SelectContent>
                    </Select>
                </div>
              )}
            </div>
            
            {uploadError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Processing Error</AlertTitle>
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            )}
            
            {isProcessing && (
              <div className="flex items-center space-x-2 text-primary justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Analyzing image and generating avatar structure...</span>
              </div>
            )}

            {/* Segmented Parts Display (Body Mode) */}
            {selectedCategory === 'body' && segmentedParts.length > 0 && !isProcessing && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-lg font-semibold">Segmented Parts Ready</h3>
                <p className="text-sm text-muted-foreground">Select a part to apply its texture to the 3D model.</p>
                
                <div className="grid grid-cols-3 gap-4">
                  {segmentedParts.map((part) => (
                    <div 
                      key={part.key} 
                      className={`p-2 border rounded-lg cursor-pointer transition-all ${
                        appliedPartKey === part.key 
                          ? 'border-green-500 ring-2 ring-green-500 bg-green-500/10' 
                          : 'border-border hover:bg-muted/50'
                      }`}
                      onClick={() => handleApplyPart(part.key)}
                    >
                      <div className="relative w-full aspect-square bg-gray-700 rounded-md overflow-hidden flex items-center justify-center">
                        <img 
                          src={part.imageUrl} 
                          alt={part.name} 
                          className="w-full h-full object-contain"
                        />
                        {appliedPartKey === part.key && (
                            <CheckCircle className="absolute top-1 right-1 h-4 w-4 text-green-500 bg-background rounded-full" />
                        )}
                      </div>
                      <p className="text-center text-sm font-medium mt-2">{part.name}</p>
                    </div>
                  ))}
                </div>
                
                <Button 
                    onClick={() => {
                        const img = new Image();
                        img.src = selectedImage!;
                        img.onload = () => processImage(img);
                    }}
                    variant="outline"
                    className="w-full"
                    disabled={isProcessing}
                >
                    Retry Segmentation
                </Button>
              </div>
            )}
            
            {/* Accessory Application (Accessory Mode) */}
            {selectedCategory === 'accessory' && selectedImage && !isProcessing && (
                <div className="space-y-4 border-t pt-4">
                    <h3 className="text-lg font-semibold">Accessory Detection</h3>
                    <p className="text-sm text-muted-foreground">
                        The system will attempt to detect a single accessory object in the image and apply its texture to a placeholder 3D shape.
                    </p>
                    <Button onClick={handleApplyAccessory} disabled={isProcessing} className="w-full">
                        {isProcessing ? 'Detecting...' : 'Detect and Apply Accessory'}
                    </Button>
                </div>
            )}
            
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AvatarCreator;