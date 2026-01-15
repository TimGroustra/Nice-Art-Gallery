import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';

export interface AssetConfig {
  id?: string;
  model_url: string;
  position_x: number;
  position_y: number;
  position_z: number;
  rotation_y: number;
  target_width: number;
  floor_level: 'ground' | 'first';
}

const loader = new GLTFLoader();

/**
 * Loads a GLB asset, extracts the primary model, normalizes its scale, 
 * centers its pivot point at the bottom, and returns a group ready for placement.
 */
export async function importGalleryAsset(config: AssetConfig): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    loader.load(
      config.model_url,
      (gltf) => {
        let extractedModel: THREE.Object3D | null = null;

        // 1. Extraction: Look for meshes or groups that aren't the whole scene
        gltf.scene.traverse((child) => {
          if (!extractedModel && (child instanceof THREE.Mesh || child instanceof THREE.Group)) {
            const box = new THREE.Box3().setFromObject(child);
            const size = new THREE.Vector3();
            box.getSize(size);
            // Ignore tiny details or massive environmental planes
            if (size.x > 0.1 && size.x < 20) {
              extractedModel = child;
            }
          }
        });

        const model = (extractedModel || gltf.scene).clone();
        
        // 2. Normalization: Scale based on target width
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.z);
        const scale = config.target_width / (maxDim || 1);
        model.scale.set(scale, scale, scale);

        // 3. Centering: Adjust Y so bottom sits at 0 relative to the container group
        const adjustedBox = new THREE.Box3().setFromObject(model);
        const bottomY = adjustedBox.min.y;
        
        const container = new THREE.Group();
        model.position.y -= bottomY;
        container.add(model);

        // 4. Placement: Apply world transform
        container.position.set(config.position_x, config.position_y, config.position_z);
        container.rotation.y = config.rotation_y;
        
        resolve(container);
      },
      undefined,
      (error) => reject(error)
    );
  });
}