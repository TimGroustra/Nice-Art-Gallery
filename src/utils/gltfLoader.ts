import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';

// NOTE: The primary GLTF loading logic is now handled by src/avatar/AssetLoader.ts
// This file retains only the utility function for finding objects/bones.

/**
 * Helper function to find a specific bone or object by name in a model hierarchy.
 */
export function findObjectByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
    let result: THREE.Object3D | null = null;
    root.traverse((child) => {
        if (child.name === name) {
            result = child;
        }
    });
    return result;
}