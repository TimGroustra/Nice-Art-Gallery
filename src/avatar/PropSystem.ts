// PropSystem.ts
import * as THREE from "three";
import { loadGLTF } from "./AssetLoader";
import { resolveNFTMedia } from "./NFTMediaResolver";

export async function spawnProp(
  meshPath: string,
  nftImage: string,
  parent: THREE.Object3D
): Promise<THREE.Object3D> {
  const prop = await loadGLTF(meshPath);
  
  prop.traverse(async obj => {
    if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).material) {
      // Clone material to ensure unique texture application
      (obj as THREE.Mesh).material = ((obj as THREE.Mesh).material as THREE.Material).clone();
      
      const media = await resolveNFTMedia(nftImage);
      if (media.type === "texture" || media.type === "video") {
        (((obj as THREE.Mesh).material as THREE.MeshStandardMaterial).map = media.texture);
        (((obj as THREE.Mesh).material as THREE.MeshStandardMaterial).needsUpdate = true);
      }
    }
  });
  
  parent.add(prop);
  return prop;
}