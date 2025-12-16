// AvatarAssembler.ts
import * as THREE from "three";
import { AvatarProfile, NFTRef } from "./AvatarState";
import { MeshLibrary, BodySpecies } from "./MeshLibrary";
import { resolveNFT } from "./NFTResolver";
import { loadGLTF } from "./AssetLoader";
import { validateSkeleton } from "./AssetValidator";
import { applyBodyMorphs } from "./MorphSystem";
import { attachWearable } from "./WearableSystem";
import { spawnProp } from "./PropSystem";
import { createAura } from "./EffectSystem";
import { AttachmentSlot } from "./AttachmentMap";
import { resolveNFTMedia } from "./NFTMediaResolver";
import { applyFaceExpression, applyHairVariation } from "./MorphSystem";

/**
 * Builds a complete Three.js avatar model based on the provided state.
 */
export async function assembleAvatar(state: AvatarProfile): Promise<THREE.Group> {
  const group = new THREE.Group();
  
  // --- 1. Determine Base Body and Seed ---
  const speciesKey: BodySpecies = state.species || "human";
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
  }
  
  group.add(body);
  
  // --- 2. Apply Morphs (Seed-driven variations) ---
  let primarySeed = 0;
  if (state.bodySeed) {
      const { seed } = await resolveNFT(state.bodySeed);
      primarySeed = seed;
      applyBodyMorphs(body, primarySeed);
  }
  
  // --- 3. Apply Hair/Face (Morphs/Wearables) ---
  if (state.hair?.source) {
      const resolved = await resolveNFT(state.hair.source);
      const hairPath = (MeshLibrary.hair as any)[state.hair.style || 'short'];
      if (hairPath) {
          const hairMesh = await attachWearable(body, 'hair', hairPath, resolved.imageUrl);
          applyHairVariation(hairMesh, resolved.seed);
      }
  }
  if (state.face?.source) {
      const resolved = await resolveNFT(state.face.source);
      // Assuming face NFT is used to drive expression/texture
      applyFaceExpression(body, resolved.seed);
      // Note: Actual face texture application is complex and omitted here, but the seed is applied.
  }
  
  // --- 4. Apply Wearables ---
  const wearablePromises: Promise<THREE.Object3D>[] = [];
  
  // Map AvatarProfile wearable slots to AttachmentMap slots
  const wearableSlots: { [key in keyof AvatarProfile['wearables']]: AttachmentSlot } = {
      head: 'head',
      torso: 'torso',
      wristLeft: 'wrist.left',
      wristRight: 'wrist.right',
      feet: 'feet',
  };
  
  for (const [slot, nft] of Object.entries(state.wearables)) {
      if (!nft) continue;
      
      const resolved = await resolveNFT(nft);
      // We need a mesh path based on the slot type. Since the user's MeshLibrary is generic, 
      // we'll use a placeholder mapping based on the slot name for now.
      let meshKey: string | undefined;
      if (slot === 'torso') meshKey = MeshLibrary.wearables.tshirt;
      if (slot === 'head') meshKey = MeshLibrary.wearables.hat;
      if (slot === 'wristLeft' || slot === 'wristRight') meshKey = MeshLibrary.wearables.watch;
      if (slot === 'feet') meshKey = MeshLibrary.wearables.shoes;
      
      if (meshKey) {
          const attachmentSlot = wearableSlots[slot as keyof AvatarProfile['wearables']];
          wearablePromises.push(
              attachWearable(body, attachmentSlot, meshKey, resolved.imageUrl)
          );
      } else {
          console.warn(`Wearable mesh not found for slot: ${slot}`);
      }
  }
  await Promise.all(wearablePromises);
  
  // --- 5. Apply Props ---
  
  // Handheld props
  const propPromises: Promise<THREE.Object3D>[] = [];
  
  if (state.props.handRight) {
      const resolved = await resolveNFT(state.props.handRight);
      // Assuming handRight prop is a sword
      const wearable = await attachWearable(body, 'hand.right', MeshLibrary.props.sword, resolved.imageUrl);
      wearable.userData.type = "prop";
      propPromises.push(Promise.resolve(wearable));
  }
  
  if (state.props.handLeft) {
      const resolved = await resolveNFT(state.props.handLeft);
      // Assuming handLeft prop is a jar
      const wearable = await attachWearable(body, 'hand.left', MeshLibrary.props.jar, resolved.imageUrl);
      wearable.userData.type = "prop";
      propPromises.push(Promise.resolve(wearable));
  }
  
  // Floating props
  if (state.props.floating && state.props.floating.length > 0) {
      for (const nft of state.props.floating) {
          const resolved = await resolveNFT(nft);
          const prop = await spawnProp(MeshLibrary.props.gem, resolved.imageUrl, group);
          prop.userData.type = "prop";
          // Simple offset for floating items
          prop.position.set(0, 1.5, 1.5); 
          propPromises.push(Promise.resolve(prop));
      }
  }
  await Promise.all(propPromises);
  
  // --- 6. Handle Companions (Pets) ---
  if (state.pet) {
      try {
          const resolved = await resolveNFT(state.pet);
          const petMesh = await loadGLTF(MeshLibrary.pets.cat); // Default pet mesh
          
          // Apply texture to pet mesh
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
          petMesh.userData.type = "pet"; // Tag for ZoneManager
          
          // Store pet instance data for external update loop (PetSystem)
          (group.userData as any).petInstance = {
              model: petMesh,
              followDistance: 2.0,
          };
          
      } catch (e) {
          console.error("Failed to render pet:", e);
      }
  }

  // --- 7. Apply Effects ---
  if (state.aura) {
      const aura = createAura(primarySeed);
      group.add(aura);
      aura.userData.type = "effect"; // Tag for ZoneManager
  }

  return group;
}