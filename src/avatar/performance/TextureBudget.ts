// performance/TextureBudget.ts
import * as THREE from "three";

/**
 * Enforces a texture budget, disabling animated textures if the limit is exceeded.
 */
export function enforceTextureBudget(
  avatar: THREE.Object3D,
  maxAnimated = 2
) {
  let animatedCount = 0;
  avatar.traverse(obj => {
    const mat = (obj as THREE.Mesh).material;
    if (!mat || !("map" in mat)) return;
    
    const map = (mat as THREE.MeshStandardMaterial).map;
    if (map instanceof THREE.VideoTexture) {
      animatedCount++;
      if (animatedCount > maxAnimated) {
        // Disable the map if budget exceeded
        (mat as THREE.MeshStandardMaterial).map = null;
        (mat as THREE.MeshStandardMaterial).color.setHex(0x808080); // Fallback color
        (mat as THREE.MeshStandardMaterial).needsUpdate = true;
        
        // Stop the video element to save resources
        if ((map.image as HTMLVideoElement).pause) {
          (map.image as HTMLVideoElement).pause();
        }
      }
    }
  });
}