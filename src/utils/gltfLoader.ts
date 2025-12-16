import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';

const loader = new GLTFLoader();
const cache = new Map<string, THREE.Group>();

/**
 * Loads a GLTF model from a path, utilizing a cache.
 * Returns a clone of the loaded scene's first child (usually a Group).
 */
export async function loadGLTF(path: string): Promise<THREE.Group> {
  if (cache.has(path)) {
    const cachedModel = cache.get(path)!;
    // Return a clone to ensure multiple avatars don't share the same geometry/material instances
    return cachedModel.clone();
  }

  try {
    const gltf = await loader.loadAsync(path);
    
    if (gltf.scene.children.length === 0) {
        throw new Error(`GLTF model at ${path} has no children.`);
    }
    
    // Use the scene itself or the first child as the base model
    const model = gltf.scene;
    
    // Cache the original model (or a clean version of it)
    cache.set(path, model);
    
    return model.clone();

  } catch (error) {
    console.error(`Failed to load GLTF model: ${path}`, error);
    // Fallback: return a simple placeholder cube
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xff00ff });
    const mesh = new THREE.Mesh(geometry, material);
    const group = new THREE.Group();
    group.add(mesh);
    return group;
  }
}

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