// AssetLoader.ts
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";

// Using three-stdlib for GLTFLoader
const gltfLoader = new GLTFLoader();
const gltfCache = new Map<string, THREE.Group>();

/**
 * Loads a GLTF model from a path, utilizing a cache.
 * Returns a clone of the loaded scene's first child (usually a Group).
 */
export async function loadGLTF(path: string): Promise<THREE.Group> {
  if (gltfCache.has(path)) {
    const cachedModel = gltfCache.get(path)!;
    // Return a clone to ensure multiple avatars don't share the same geometry/material instances
    return cachedModel.clone();
  }

  try {
    const gltf = await gltfLoader.loadAsync(path);
    const scene = gltf.scene;
    scene.traverse(obj => {
      (obj as any).frustumCulled = true;
    });
    
    // Cache the original model
    gltfCache.set(path, scene);
    return scene.clone();
  } catch (error) {
    console.error(`[GLTF Loader] Failed to load GLTF model: ${path}`, error);
    
    // Fallback: return a simple placeholder cube
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xff00ff });
    const mesh = new THREE.Mesh(geometry, material);
    const group = new THREE.Group();
    group.add(mesh);
    
    // Tag the fallback group so we can skip skeleton validation
    (group as any).userData.isFallback = true;
    return group;
  }
}