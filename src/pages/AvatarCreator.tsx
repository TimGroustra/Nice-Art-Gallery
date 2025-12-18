import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

  // Avatar oval mesh
  const ovalRef = useRef<THREE.Mesh | null>(null);

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

    // Initial transparent oval egg shape
    const ovalGeometry = new THREE.SphereGeometry(1, 32, 32); // Base sphere, will scale to oval
    const ovalMaterial = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0, // Start fully transparent
      side: THREE.DoubleSide,
    });
    const oval = new THREE.Mesh(ovalGeometry, ovalMaterial);
    oval.position.set(0, 0, 0);
    scene.add(oval);
    ovalRef.current = oval;

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
        // Use BodyPix to segment person and compute proportions
        const net = await bodyPix.load();
        const segmentation = await net.segmentPerson(img, {
          flipHorizontal: false,
          internalResolution: 'medium',
          segmentationThreshold: 0.7,
        });

        // Compute bounding box from segmentation to estimate proportions
        let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const idx = (y * img.width + x) * 4; // Assuming RGBA
            if (segmentation.data[idx / 4] !== -1) { // Person pixel
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
          }
        }

        const detectedWidth = (maxX - minX) / img.width;
        const detectedHeight = (maxY - minY) / img.height;

        // Create masked texture (person only, background transparent)
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');

        // Draw image
        ctx.drawImage(img, 0, 0);

        // Apply mask: set non-person pixels to transparent
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < segmentation.data.length; i++) {
          if (segmentation.data[i] === -1) { // Background
            imageData.data[i * 4 + 3] = 0; // Set alpha to 0
          }
        }
        ctx.putImageData(imageData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        // Remove previous oval if exists
        if (ovalRef.current && sceneRef.current) {
          sceneRef.current.remove(ovalRef.current);
          ovalRef.current.geometry.dispose();
          (ovalRef.current.material as THREE.Material).dispose();
        }

        // Create new oval mesh scaled by detected proportions
        const aspectRatio = detectedWidth / detectedHeight || 1;
        const ovalGeometry = new THREE.SphereGeometry(1, 32, 32);
        const ovalMaterial = new THREE.MeshStandardMaterial({
          map: texture,
          transparent: true,
          side: THREE.DoubleSide,
          alphaTest: 0.1, // Avoid artifacts
        });
        const oval = new THREE.Mesh(ovalGeometry, ovalMaterial);
        oval.scale.set(aspectRatio, 1, aspectRatio); // Stretch to oval based on proportions
        oval.position.set(0, 0, 0);
        sceneRef.current?.add(oval);
        ovalRef.current = oval;

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
            position = new THREE.Vector3(0, 1.2, 0); // Approximate top of oval
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