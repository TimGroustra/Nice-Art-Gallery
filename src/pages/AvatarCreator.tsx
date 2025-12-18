import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import * as bodyPix from '@tensorflow-models/body-pix';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

// Categories for image application
type ImageCategory = 'body' | 'accessory' | null;

const AvatarCreator: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Image upload states
  const [selectedImage, setSelectedImage] = useState<string | null>(null); // URL of uploaded image
  const [selectedCategory, setSelectedCategory] = useState<ImageCategory>(null);
  const [appliedImages, setAppliedImages] = useState<{ [key in ImageCategory]?: string }>({}); // Store applied images per category
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Refs for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Avatar group (for body parts)
  const avatarGroupRef = useRef<THREE.Group | null>(null);

  // Accessory group
  const accessoryGroupRef = useRef<THREE.Group | null>(null);

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
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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

  // Process and apply image based on category
  const applyImage = async () => {
    if (!selectedImage || !selectedCategory) return;

    setAppliedImages((prev) => ({ ...prev, [selectedCategory]: selectedImage }));
    setIsProcessing(true);

    try {
      const img = new Image();
      img.src = selectedImage;
      await new Promise((resolve) => (img.onload = resolve));

      if (selectedCategory === 'body') {
        // Use BodyPix for pose estimation and part segmentation
        const net = await bodyPix.load();
        const pose = await net.estimatePose(img); // Get keypoints
        const parts = await net.segmentPersonParts(img, {
          flipHorizontal: false,
          internalResolution: 'medium',
          segmentationThreshold: 0.7,
        });

        if (!pose || pose.score < 0.5) {
          throw new Error('No person detected or low confidence.');
        }

        // Keypoints map (assuming standard 17 keypoints)
        const keypoints = pose.keypoints.reduce((map, kp) => {
          map[kp.part] = kp;
          return map;
        }, {} as { [part: string]: bodyPix.Keypoint });

        // Helper to get position, falling back to average if missing
        const getPos = (part: string) => {
          const kp = keypoints[part];
          return kp ? new THREE.Vector2(kp.position.x / img.width, kp.position.y / img.height) : new THREE.Vector2(0.5, 0.5);
        };

        // Calculate positions and lengths for body parts
        const headPos = getPos('nose');
        const neckPos = getPos('neck') || getPos('leftShoulder').clone().lerp(getPos('rightShoulder'), 0.5);
        const shoulderMid = getPos('leftShoulder').clone().lerp(getPos('rightShoulder'), 0.5);
        const hipMid = getPos('leftHip').clone().lerp(getPos('rightHip'), 0.5);

        const leftElbow = getPos('leftElbow');
        const leftWrist = getPos('leftWrist');
        const rightElbow = getPos('rightElbow');
        const rightWrist = getPos('rightWrist');

        const leftKnee = getPos('leftKnee');
        const leftAnkle = getPos('leftAnkle');
        const rightKnee = getPos('rightKnee');
        const rightAnkle = getPos('rightAnkle');

        // Calculate lengths (normalized)
        const torsoLength = shoulderMid.y - hipMid.y;
        const armLength = leftElbow.distanceTo(leftWrist) + getPos('leftShoulder').distanceTo(leftElbow);
        const legLength = leftKnee.distanceTo(leftAnkle) + getPos('leftHip').distanceTo(leftKnee);

        // Create body parts with cylinders and spheres
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
          return new THREE.Mesh(sphereGeo, material);
        };

        // Clear previous body
        if (avatarGroupRef.current) {
          while (avatarGroupRef.current.children.length > 0) {
            const child = avatarGroupRef.current.children[0];
            avatarGroupRef.current.remove(child);
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              (child.material as THREE.Material).dispose();
            }
          }
        }

        // Scale factor to make avatar life-sized (assume average height ~1.7m)
        const avatarScale = 1.7 / (headPos.y - rightAnkle.y); // From head to ankle normalized

        // Positions in 3D space (y downward in image, upward in 3D)
        const to3D = (pos: THREE.Vector2) => new THREE.Vector3(
          (pos.x - 0.5) * 2, // x: -1 to 1
          (1 - pos.y) * 2,  // y: invert and scale
          0
        ).multiplyScalar(avatarScale);

        // Create materials - for now, simple color; texture application can be added per part
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true });

        // Head
        const head3D = to3D(headPos);
        const head = createSphere(head3D, 0.2, bodyMaterial);
        avatarGroupRef.current?.add(head);

        // Torso
        const shoulder3D = to3D(shoulderMid);
        const hip3D = to3D(hipMid);
        const torso = createCylinder(shoulder3D, hip3D, 0.3, bodyMaterial);
        avatarGroupRef.current?.add(torso);

        // Left arm
        const leftShoulder3D = to3D(getPos('leftShoulder'));
        const leftElbow3D = to3D(leftElbow);
        const leftWrist3D = to3D(leftWrist);
        const upperLeftArm = createCylinder(leftShoulder3D, leftElbow3D, 0.1, bodyMaterial);
        const lowerLeftArm = createCylinder(leftElbow3D, leftWrist3D, 0.08, bodyMaterial);
        avatarGroupRef.current?.add(upperLeftArm, lowerLeftArm);

        // Right arm
        const rightShoulder3D = to3D(getPos('rightShoulder'));
        const rightElbow3D = to3D(rightElbow);
        const rightWrist3D = to3D(rightWrist);
        const upperRightArm = createCylinder(rightShoulder3D, rightElbow3D, 0.1, bodyMaterial);
        const lowerRightArm = createCylinder(rightElbow3D, rightWrist3D, 0.08, bodyMaterial);
        avatarGroupRef.current?.add(upperRightArm, lowerRightArm);

        // Left leg
        const leftHip3D = to3D(getPos('leftHip'));
        const leftKnee3D = to3D(leftKnee);
        const leftAnkle3D = to3D(leftAnkle);
        const upperLeftLeg = createCylinder(leftHip3D, leftKnee3D, 0.15, bodyMaterial);
        const lowerLeftLeg = createCylinder(leftKnee3D, leftAnkle3D, 0.12, bodyMaterial);
        avatarGroupRef.current?.add(upperLeftLeg, lowerLeftLeg);

        // Right leg
        const rightHip3D = to3D(getPos('rightHip'));
        const rightKnee3D = to3D(rightKnee);
        const rightAnkle3D = to3D(rightAnkle);
        const upperRightLeg = createCylinder(rightHip3D, rightKnee3D, 0.15, bodyMaterial);
        const lowerRightLeg = createCylinder(rightKnee3D, rightAnkle3D, 0.12, bodyMaterial);
        avatarGroupRef.current?.add(upperRightLeg, lowerRightLeg);

        // Apply overall texture or per-part textures (simplified: apply same texture to all)
        const loader = new THREE.TextureLoader();
        loader.load(selectedImage, (texture) => {
          avatarGroupRef.current?.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              (child.material as THREE.MeshStandardMaterial).map = texture;
              (child.material as THREE.MeshStandardMaterial).needsUpdate = true;
            }
          });
        });

      } else if (selectedCategory === 'accessory') {
        // Use Coco-SSD to detect objects
        const model = await cocoSsd.load();
        const predictions = await model.detect(img);

        if (predictions.length > 0) {
          const detectedClass = predictions[0].class; // Take top detection

          // Based on detected class, create and add 3D accessory
          let accessoryGeometry: THREE.BufferGeometry;
          let position: THREE.Vector3;
          let scale = 1;

          if (detectedClass === 'hat' || detectedClass === 'cap') {
            accessoryGeometry = new THREE.ConeGeometry(0.5, 0.8, 32);
            position = new THREE.Vector3(0, 1.2, 0); // Approximate top of body
            scale = 1;
          } else if (detectedClass === 'tie') {
            accessoryGeometry = new THREE.BoxGeometry(0.2, 0.8, 0.05);
            position = new THREE.Vector3(0, 0, 0.31); // Front
            scale = 1;
          } else if (detectedClass === 'backpack') {
            accessoryGeometry = new THREE.BoxGeometry(0.6, 0.8, 0.3);
            position = new THREE.Vector3(0, 0, -0.31); // Back
            scale = 1;
          } else {
            // Default accessory for unknown
            accessoryGeometry = new THREE.SphereGeometry(0.3, 32, 32);
            position = new THREE.Vector3(0, 1.2, 0);
            scale = 1;
          }

          const accessoryMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
          const accessory = new THREE.Mesh(accessoryGeometry, accessoryMaterial);
          accessory.position.copy(position);
          accessory.scale.set(scale, scale, scale);

          // Apply texture from uploaded image to accessory
          const loader = new THREE.TextureLoader();
          loader.load(selectedImage, (texture) => {
            accessoryMaterial.map = texture;
            accessoryMaterial.needsUpdate = true;
          });

          accessoryGroupRef.current?.add(accessory);
        } else {
          setUploadError('No accessory object detected in the image.');
        }
      }
    } catch (error) {
      console.error('Error processing image:', error);
      setUploadError('Failed to process image.');
    } finally {
      setIsProcessing(false);
      setSelectedImage(null);
      setSelectedCategory(null);
    }
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
              <Label>Upload NFT Image</Label>
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
                    <Label>Use for</Label>
                    <Select onValueChange={(value) => setSelectedCategory(value as ImageCategory)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="body">Body</SelectItem>
                        <SelectItem value="accessory">Accessory</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button onClick={applyImage} disabled={!selectedCategory || isProcessing}>
                    {isProcessing ? 'Processing...' : 'Apply to Avatar'}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AvatarCreator;