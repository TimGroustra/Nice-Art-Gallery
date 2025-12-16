// AvatarAssembler.ts
import * as THREE from "three";
import { AvatarState, NFTRef } from "./AvatarState";
import { MeshLibrary, BodySpecies } from "./MeshLibrary";
import { resolveNFT } from "./NFTResolver";
import { loadGLTF } from "./AssetLoader";
import { validateSkeleton } from "./AssetValidator";
import { applyBodyMorphs } from "./MorphSystem";
import { attachWearable } from "./WearableSystem";
import { spawnProp } from "./PropSystem";
import { createAura } from "./EffectSystem";
import { AttachmentSlot } from "./AttachmentMap";

/**
 * Builds a complete Three.js avatar model based on the provided state.
 */
export async function assembleAvatar(state: AvatarState): Promise<THREE.Group> {
  const group = new THREE.Group();
  
  // --- 1. Determine Base Body and Seed ---
  const speciesKey: BodySpecies = (state.morphs.species ? "human" : "human") as BodySpecies; // Default to human
  const bodyPath = MeshLibrary.bodies[speciesKey];
  
  if (!bodyPath) {
      console.error(`Body mesh not found for species: ${speciesKey}`);
      return group;
  }
  
  const body = await loadGLTF(bodyPath);
  
  // Validate the loaded body skeleton
  try {
      validateSkeleton(body);
  } catch (e) {
      console.error("Avatar validation failed:", e);
      // Continue with potentially broken model for dev safety
  }
  
  group.add(body);
  
  // --- 2. Apply Morphs (Seed-driven variations) ---
  let primarySeed = 0;
  if (state.morphs.bodySeed) {
      const { seed } = await resolveNFT(state.morphs.bodySeed);
      primarySeed = seed;
      applyBodyMorphs(body, primarySeed);
  }
  
  // --- 3. Apply Wearables ---
  const wearablePromises: Promise<THREE.Object3D>[] = [];
  
  for (const [slot, nft] of Object.entries(state.wearables)) {
      if (!nft) continue;
      
      const resolved = await resolveNFT(nft);
      const meshKey = (MeshLibrary.wearables as any)[slot];
      
      if (meshKey) {
          // We need to map the slot name (e.g., 'torso') to the AttachmentMap key (e.g., 'torso')
          // Since the keys are mostly the same, we cast for simplicity, but this is where complex mapping would occur.
          const attachmentSlot = slot as AttachmentSlot; 
          
          wearablePromises.push(
              attachWearable(body, attachmentSlot, meshKey, resolved.imageUrl)
          );
      } else {
          console.warn(`Wearable mesh not found for slot: ${slot}`);
      }
  }
  await Promise.all(wearablePromises);
  
  // --- 4. Apply Props ---
  const propPromises: Promise<THREE.Object3D>[] = [];
  
  for (const [slot, nft] of Object.entries(state.props)) {
      if (!nft) continue;
      
      const resolved = await resolveNFT(nft);
      const meshKey = (MeshLibrary.props as any)[slot];
      
      if (meshKey) {
          // Props attached to the body's bone structure (e.g., handheld) are handled by WearableSystem.
          // Props attached to 'world' (e.g., floating) are spawned relative to the group.
          if (slot === 'floating') {
              propPromises.push(spawnProp(meshKey, resolved.imageUrl, group));
          } else {
              // For handheld props, we attach them to the bone via WearableSystem logic
              const attachmentSlot = slot as AttachmentSlot;
              propPromises.push(
                  attachWearable(body, attachmentSlot, meshKey, resolved.imageUrl)
              );
          }
      } else {
          console.warn(`Prop mesh not found for slot: ${slot}`);
      }
  }
  await Promise.all(propPromises);
  
  // --- 5. Handle Companions (Pets) ---
  if (state.companions.pet) {
      try {
          const resolved = await resolveNFT(state.companions.pet);
          const petMesh = await loadGLTF(MeshLibrary.pets.cat); // Default pet mesh
          
          // Apply texture to pet mesh (e.g., nameplate)
          petMesh.traverse(async (child) => {
              if (child instanceof THREE.Mesh && child.material) {
                  (child.material as THREE.Material).clone();
                  const media = await resolveNFTMedia(resolved.imageUrl);
                  if (media.type === "texture") {
                      ((child.material as THREE.MeshStandardMaterial).map = media.texture);
                  }
              }
          });
          
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

  // --- 6. Apply Effects ---
  if (state.effects.aura) {
      const aura = createAura(primarySeed);
      group.add(aura);
  }

  return group;
}