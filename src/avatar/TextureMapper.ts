// TextureMapper.ts
import * as THREE from "three";

/**
 * Loads an image URL and applies it as a map texture to a MeshStandardMaterial.
 * @param material The material to update.
 * @param imageUrl The URL of the image to use as a texture.
 */
export async function applyNFTTexture(
  material: THREE.Material,
  imageUrl: string
): Promise<void> {
  if (!(material instanceof THREE.MeshStandardMaterial)) {
    console.warn("Material is not MeshStandardMaterial, skipping texture application.");
    return;
  }
  
  try {
    const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
    texture.flipY = false; // GLTF standard often requires flipY=false
    material.map = texture;
    material.needsUpdate = true;
  } catch (error) {
    console.error("Failed to load or apply NFT texture:", imageUrl, error);
    // Fallback to a default color if texture fails
    material.color.setHex(0x808080);
    material.map = null;
    material.needsUpdate = true;
  }
}