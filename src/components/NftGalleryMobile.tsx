"use client";

import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { RectAreaLightUniformsLib, GLTFLoader } from 'three-stdlib';
// ... other imports remain the same ...

    // Furniture loading: Replace with new sofa model
    const gltfLoader = new GLTFLoader();
    gltfLoader.load('/assets/models/sofa.glb', (gltf) => {
      let extractedSofa: THREE.Object3D | null = null;
      
      // Traverse to find the main sofa model
      gltf.scene.traverse((child) => {
        if ((child instanceof THREE.Mesh || child instanceof THREE.Group) && !extractedSofa) {
          // Use the main scene as the sofa model
          extractedSofa = child;
        }
      });
      
      if (extractedSofa) {
        const sofaModel = extractedSofa as THREE.Object3D;
        
        // Auto-scale the sofa to appropriate size (~4.5 meters wide)
        const box = new THREE.Box3().setFromObject(sofaModel);
        const size = new THREE.Vector3(); box.getSize(size);
        const maxDim = Math.max(size.x, size.z);
        const scale = 4.5 / maxDim;
        sofaModel.scale.set(scale, scale, scale);
        
        // Re-center Y position so it sits on floor
        const adjustedBox = new THREE.Box3().setFromObject(sofaModel);
        const bottomY = adjustedBox.min.y;

        // Position sofas around the teleportation button
        const sofaPositions = [
          { x: 0, z: 4.5 },
          { x: 0, z: -4.5 },
          { x: 4.5, z: 0 },
          { x: -4.5, z: 0 },
        ];

        sofaPositions.forEach(pos => {
          const sofa = sofaModel.clone();
          // Place on the first floor platform (sitting exactly on the surface)
          sofa.position.set(pos.x, PLATFORM_Y + WALL_THICKNESS / 2 - bottomY, pos.z);
          // Calculate rotation to face the center (0,0)
          sofa.rotation.y = Math.atan2(-pos.x, -pos.z);
          scene.add(sofa);
        });
      }
    });

    // ... rest of the file remains the same ...
};

export default NftGalleryMobile;