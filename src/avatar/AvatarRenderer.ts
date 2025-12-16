// AvatarRenderer.ts
import * as THREE from "three";
import { AvatarState, NFTRef } from "./AvatarState";
import { MeshLibrary, BodySpecies } from "./MeshLibrary";
import { resolveNFT } from "./NFTResolver";
import { applyNFTTexture } from "./TextureMapper";
import { loadGLTF, findObjectByName } from "@/utils/gltfLoader"; // Keeping old loader for now, will replace with new AssetLoader
import { seededRandom } from "./SeedUtils";
import { AttachmentMap, AttachmentSlot } from "./AttachmentMap";
import { validateSkeleton } from "./AssetValidator";
import { loadGLTF as loadGLTFAsset } from "./AssetLoader"; // Use the new AssetLoader

// --- Helper to map AvatarState slots to AttachmentMap keys ---
const SLOT_TO_ATTACHMENT_MAP: Record<string, AttachmentSlot> = {
    head: 'head',
    face: 'face',
    torso: 'torso',
    wrist: 'wrist.left', // Simplified mapping for now
    waist: 'torso', // Mapping waist to torso bone for simplicity
    feet: 'feet',
    handheld: 'hand.right',
    floating: 'floating',
    pet: 'pet',
};


/**
 * Attaches a wearable mesh to a specific bone in the body model or the world group.
 */
function attachToBone(
  body: THREE.Group,
  wearable: THREE.Group,
  slot: string
) {
  const attachmentSlot = SLOT_TO_ATTACHMENT_MAP[slot];
  if (!attachmentSlot) {
    console.warn(`No attachment slot mapping defined for slot: ${slot}`);
    body.add(wearable); // Fallback: add to root
    return;
  }
  
  const boneNameOrWorld = AttachmentMap[attachmentSlot];

  if (boneNameOrWorld === "world") {
      // Attach to the root group (which is the parent of the body)
      body.parent?.add(wearable);
      // Position relative to the body's root position (0, 0, 0)
      wearable.position.set(0, 0, 0);
      return;
  }

  const bone = findObjectByName(body, boneNameOrWorld);
  
  if (bone) {
    bone.add(wearable);
    // Reset position/rotation relative to the bone
    wearable.position.set(0, 0, 0);
    wearable.rotation.set(0, 0, 0);
    
    // Apply specific offsets for certain slots if necessary (e.g., floating props)
    if (attachmentSlot === 'floating') {
        wearable.position.y += 1.5;
    }
    
  } else {
    console.warn(`Bone '${boneNameOrWorld}' not found in body model. Attaching to root.`);
    body.add(wearable);
  }
}

/**
 * Builds a complete Three.js avatar model based on the provided state.
 */
export async function buildAvatar(state: AvatarState): Promise<THREE.Group> {
  const group = new THREE.Group();
  
  // 1. Load body (Morphs)
  const speciesKey: BodySpecies = (state.morphs.species ? "human" : "human") as BodySpecies; // Simplified species selection for now
  const bodyPath = MeshLibrary.bodies[speciesKey];
  
  if (!bodyPath) {
      console.error(`Body mesh not found for species: ${speciesKey}`);
      return group;
  }
  
  const body = await loadGLTFAsset(bodyPath);
  
  // Validate the loaded body skeleton
  try {
      validateSkeleton(body);
  } catch (e) {
      console.error("Avatar validation failed:", e);
      // Optionally return a placeholder or throw
  }
  
  group.add(body);
  
  // 2. Apply Wearables and Props
  const itemsToLoad: { slot: string, nft: NFTRef, category: 'wearables' | 'props' }[] = [];
  
  Object.entries(state.wearables).forEach(([slot, nft]) => {
      if (nft) itemsToLoad.push({ slot, nft, category: 'wearables' });
  });
  Object.entries(state.props).forEach(([slot, nft]) => {
      if (nft) itemsToLoad.push({ slot, nft, category: 'props' });
  });
  
  for (const item of itemsToLoad) {
    const { slot, nft, category } = item;
    
    try {
      const resolved = await resolveNFT(nft);
      
      // Use the slot name to look up the mesh in the appropriate category
      const meshKey = (MeshLibrary as any)[category][slot];
      if (!meshKey) {
          console.warn(`Mesh not found for ${category}/${slot}`);
          continue;
      }
      
      const itemMesh = await loadGLTFAsset(meshKey);
      
      // Find the primary mesh part to apply texture to (assuming the first mesh child)
      itemMesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
              // Clone material to ensure unique texture application
              child.material = (child.material as THREE.Material).clone();
              applyNFTTexture(child.material, resolved.imageUrl);
          }
      });
      
      attachToBone(body, itemMesh, slot);
      
    } catch (e) {
      console.error(`Failed to render item ${category}/${slot}:`, e);
    }
  }
  
  // 3. Handle Companions (Pets)
  if (state.companions.pet) {
      try {
          const resolved = await resolveNFT(state.companions.pet);
          // For simplicity, we assume all pets use the 'cat' mesh for now
          const petMesh = await loadGLTFAsset(MeshLibrary.pets.cat); 
          
          petMesh.traverse((child) => {
              if (child instanceof THREE.Mesh && child.material) {
                  child.material = (child.material as THREE.Material).clone();
                  // Apply NFT texture to the pet's surface (e.g., a nameplate or body decal)
                  applyNFTTexture(child.material, resolved.imageUrl);
              }
          });
          
          // Add pet to the root group, not attached to a bone
          group.add(petMesh);
          
          // Store pet instance data for external update loop (PetSystem)
          (group.userData as any).petInstance = {
              model: petMesh,
              followDistance: 2.0,
          };
          
      } catch (e) {
          console.error("Failed to render pet:", e);
      }
  }

  // 4. Apply Morphs/Effects (Simplified: just height based on bodySeed)
  if (state.morphs.bodySeed) {
      const { seed } = await resolveNFT(state.morphs.bodySeed);
      const heightFactor = 0.8 + seededRandom(seed, 10) * 0.4; // 0.8 to 1.2
      body.scale.y = heightFactor;
  }

  return group;
}