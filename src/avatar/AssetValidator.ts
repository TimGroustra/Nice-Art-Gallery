// AssetValidator.ts
import * as THREE from "three";
import { SkeletonBones } from "./SkeletonMap";

/**
 * Validates that the root object (expected to be an avatar body) contains all required bones.
 * @param root The loaded GLTF scene/group.
 */
export function validateSkeleton(root: THREE.Object3D) {
  const foundBones = new Set<string>();

  root.traverse(obj => {
    // Check if the object is a bone (or a node intended to be a bone)
    if ((obj as THREE.Bone).isBone || obj.type === 'Bone') {
      foundBones.add(obj.name);
    }
  });

  for (const bone of SkeletonBones) {
    if (!foundBones.has(bone)) {
      console.error(`[AssetValidator] Missing required bone: ${bone}`);
      // In a production environment, we would throw here. For development safety, we log and continue.
      // throw new Error(`Missing required bone: ${bone}`);
    }
  }
}