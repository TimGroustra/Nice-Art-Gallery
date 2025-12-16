// WearableSystem.ts
import * as THREE from "three";
import { loadGLTF } from "./AssetLoader";
import { AttachmentMap, AttachmentSlot } from "./AttachmentMap";
import { resolveNFTMedia } from "./NFTMediaResolver";
import { findObjectByName } from "@/utils/gltfLoader";

/**
 * Finds the target bone or object for attachment within the body hierarchy.
 */
function findAttachmentTarget(
  body: THREE.Object3D,
  slot: AttachmentSlot
): THREE.Object3D | null {
  const boneName = AttachmentMap[slot];
  if (boneName === "world") return body.parent; // Return parent group for world attachments

  return findObjectByName(body, boneName);
}

/**
 * Attaches a wearable mesh to a specific bone in the body model.
 */
export async function attachWearable(
  body: THREE.Object3D,
  slot: AttachmentSlot,
  meshPath: string,
  nftImage: string
) {
  const wearable = await loadGLTF(meshPath);
  const target = findAttachmentTarget(body, slot);

  if (target) {
    // Reset position/rotation relative to the bone/target
    wearable.position.set(0, 0, 0);
    wearable.rotation.set(0, 0, 0);
    target.add(wearable);
  } else {
    console.warn(`Attachment target not found for slot: ${slot}. Attaching to root.`);
    body.add(wearable);
  }

  wearable.traverse(async obj => {
    if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).material) {
      // Clone material to ensure unique texture application
      (obj as THREE.Mesh).material = ((obj as THREE.Mesh).material as THREE.Material).clone();
      
      const media = await resolveNFTMedia(nftImage);
      if (media.type === "texture" || media.type === "video") {
        ((obj as THREE.Mesh).material as THREE.MeshStandardMaterial).map = media.texture;
        ((obj as THREE.Mesh).material as THREE.MeshStandardMaterial).needsUpdate = true;
      }
    }
  });

  return wearable;
}