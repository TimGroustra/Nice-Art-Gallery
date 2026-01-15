import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';

export interface AssetConfig {
  id?: string;
  model_url: string;
  name_filter?: string; // Optional keyword to find specific parts (e.g., 'sofa')
  position_x: number;
  position_y: number;
  position_z: number;
  rotation_y: number;
  target_width: number;
  floor_level: 'ground' | 'first';
}

const loader = new GLTFLoader();

/**
 * Loads a GLB asset, extracts the primary model using name filtering or volume heuristics,
 * normalizes its scale, and centers its pivot point at the bottom.
 */
export async function importGalleryAsset(config: AssetConfig): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    loader.load(
      config.model_url,
      (gltf) => {
        let extractedModel: THREE.Object3D | null = null;
        const filter = config.name_filter?.toLowerCase();

        // 1. Extraction Strategy A: Name filtering (most reliable)
        if (filter) {
          gltf.scene.traverse((child) => {
            if (!extractedModel && child.name.toLowerCase().includes(filter) && (child instanceof THREE.Mesh || child instanceof THREE.Group)) {
              extractedModel = child;
            }
          });
        }

        // 2. Extraction Strategy B: Heuristic-based selection
        if (!extractedModel) {
          let candidates: { node: THREE.Object3D, volume: number }[] = [];
          
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const box = new THREE.Box3().setFromObject(child);
              const size = new THREE.Vector3();
              box.getSize(size);
              const volume = size.x * size.y * size.z;
              
              // Filter out tiny details or massive environmental planes (like room bounds)
              if (size.x > 0.05 && size.x < 15 && size.z < 15) {
                candidates.push({ node: child, volume });
              }
            }
          });

          // Sort by volume descending - usually the main prop is the largest non-environmental mesh
          candidates.sort((a, b) => b.volume - a.volume);
          if (candidates.length > 0) {
            extractedModel = candidates[0].node;
          }
        }

        const model = (extractedModel || gltf.scene).clone();
        
        // 3. Normalization: Scale based on target width
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.z);
        const scale = config.target_width / (maxDim || 1);
        model.scale.set(scale, scale, scale);

        // 4. Centering: Adjust Y so bottom sits at 0 relative to the container group
        const adjustedBox = new THREE.Box3().setFromObject(model);
        const bottomY = adjustedBox.min.y;
        const centerX = (adjustedBox.max.x + adjustedBox.min.x) / 2;
        const centerZ = (adjustedBox.max.z + adjustedBox.min.z) / 2;
        
        const container = new THREE.Group();
        // Shift model so its bottom-center is at (0,0,0) of the container
        model.position.x -= centerX;
        model.position.y -= bottomY;
        model.position.z -= centerZ;
        container.add(model);

        // 5. Placement: Apply world transform from config
        container.position.set(config.position_x, config.position_y, config.position_z);
        container.rotation.y = config.rotation_y;
        
        resolve(container);
      },
      undefined,
      (error) => reject(error)
    );
  });
}