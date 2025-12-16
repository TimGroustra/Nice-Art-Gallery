// AvatarRenderer.ts
import * as THREE from "three";
import { AvatarState, NFTRef } from "./AvatarState";
import { MeshLibrary } from "./MeshLibrary";
import { resolveNFT } from "./NFTResolver";
import { applyNFTTexture } from "./TextureMapper";
import { loadGLTF, findObjectByName } from "@/utils/gltfLoader";
import { seededRandom } from "./SeedUtils";

// --- Bone/Attachment Mapping (Simplified for skeleton) ---
// In a real system, these names must match the GLTF armature bones.
const ATTACHMENT_POINTS: Record<string, string> = {
  head: "Head",
  face: "Head",
  torso: "Spine",
  wrist: "LeftHand", // Assuming one wrist slot maps to LeftHand for simplicity
  waist: "Hips",
  feet: "LeftFoot",
  handheld: "RightHand",
  floating: "Head", // Floating props attach to head bone but are offset
  pet: "Root", // Pets are added to the root group, not attached to a bone
};

/**
 * Attaches a wearable mesh to a specific bone in the body model.
 */
function attachToBone(
  body: THREE.Group,
  wearable: THREE.Group,
  slot: string
) {
  const boneName = ATTACHMENT_POINTS[slot];
  if (!boneName) {
    console.warn(`No attachment point defined for slot: ${slot}`);
    body.add(wearable); // Fallback: add to root
    return;
  }

  const bone = findObjectByName(body, boneName);
  
  if (bone) {
    bone.add(wearable);
    // Reset position/rotation relative to the bone
    wearable.position.set(0, 0, 0);
    wearable.rotation.set(0, 0, 0);
    
    // Apply specific offsets for certain slots if necessary (e.g., floating props)
    if (slot === 'floating') {
        wearable.position.y += 1.5;
    }
    
  } else {
    console.warn(`Bone '${boneName}' not found in body model. Attaching to root.`);
    body.add(wearable);
  }
}

/**
 * Builds a complete Three.js avatar model based on the provided state.
 */
export async function buildAvatar(state: AvatarState): Promise<THREE.Group> {
  const group = new THREE.Group();
  
  // 1. Load body (Morphs)
  const speciesKey = state.morphs.species ? "human" : "human"; // Simplified species selection for now
  const bodyPath = (MeshLibrary.body as any)[speciesKey];
  
  if (!bodyPath) {
      console.error(`Body mesh not found for species: ${speciesKey}`);
      return group;
  }
  
  const body = await loadGLTF(bodyPath);
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
      
      const meshKey = (MeshLibrary as any)[category][slot];
      if (!meshKey) {
          console.warn(`Mesh not found for ${category}/${slot}`);
          continue;
      }
      
      const itemMesh = await loadGLTF(meshKey);
      
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
          const petMesh = await loadGLTF(MeshLibrary.pets.cat); 
          
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