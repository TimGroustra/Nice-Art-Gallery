// AvatarAssembler.ts
import * as THREE from "three";
import { AvatarProfile, NFTRef, StyledNFTRef } from "./AvatarState";
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
 * Helper to get mesh path from MeshLibrary using a styleKey and category.
 */
function getMeshPath(category: keyof typeof MeshLibrary, styleKey: string): string | undefined {
    const categoryMap = MeshLibrary[category] as Record<string, string>;
    return categoryMap[styleKey];
}

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
  group.add(body);
  
  const isFallback = !!body.userData.isFallback;

  if (!isFallback) {
      // Validate the loaded body skeleton
      try {
          validateSkeleton(body);
      } catch (e) {
          console.error("Avatar validation failed:", e);
      }
  }
  
  // --- 2. Apply Morphs (Seed-driven variations) ---
  let primarySeed = 0;
  if (state.bodySeed) {
      const { seed } = await resolveNFT(state.bodySeed);
      primarySeed = seed;
      if (!isFallback) {
          applyBodyMorphs(body, primarySeed);
      }
  }
  
  if (isFallback) {
      console.warn("Skipping morphs, wearables, props, and effects due to failed base body load.");
      return group;
  }
  
  // --- 3. Apply Hair/Face (Morphs/Wearables) ---
  if (state.hair?.source) {
      const resolved = await resolveNFT(state.hair.source);
      const hairPath = getMeshPath('hair', state.hair.style || 'short');
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
  
  for (const [slot, styledNft] of Object.entries(state.wearables)) {
      if (!styledNft) continue;
      
      const resolved = await resolveNFT(styledNft);
      const meshKey = getMeshPath('wearables', styledNft.styleKey);
      
      if (meshKey) {
          const attachmentSlot = wearableSlots[slot as keyof AvatarProfile['wearables']];
          wearablePromises.push(
              attachWearable(body, attachmentSlot, meshKey, resolved.imageUrl)
          );
      } else {
          console.warn(`Wearable mesh not found for slot: ${slot} with styleKey: ${styledNft.styleKey}`);
      }
  }
  await Promise.all(wearablePromises);
  
  // --- 5. Apply Props ---
  
  // Handheld props
  const propPromises: Promise<THREE.Object3D>[] = [];
  
  if (state.props.handRight) {
      const styledNft = state.props.handRight;
      const resolved = await resolveNFT(styledNft);
      const meshKey = getMeshPath('props', styledNft.styleKey);
      
      if (meshKey) {
          const wearable = await attachWearable(body, 'hand.right', meshKey, resolved.imageUrl);
          wearable.userData.type = "prop";
          propPromises.push(Promise.resolve(wearable));
      }
  }
  
  if (state.props.handLeft) {
      const styledNft = state.props.handLeft;
      const resolved = await resolveNFT(styledNft);
      const meshKey = getMeshPath('props', styledNft.styleKey);
      
      if (meshKey) {
          const wearable = await attachWearable(body, 'hand.left', meshKey, resolved.imageUrl);
          wearable.userData.type = "prop";
          propPromises.push(Promise.resolve(wearable));
      }
  }
  
  // Floating props
  if (state.props.floating && state.props.floating.length > 0) {
      for (const styledNft of state.props.floating) {
          const resolved = await resolveNFT(styledNft);
          const meshKey = getMeshPath('props', styledNft.styleKey);
          
          if (meshKey) {
              const prop = await spawnProp(meshKey, resolved.imageUrl, group);
              prop.userData.type = "prop";
              // Simple offset for floating items
              prop.position.set(0, 1.5, 1.5); 
              propPromises.push(Promise.resolve(prop));
          }
      }
  }
  await Promise.all(propPromises);
  
  // --- 6. Handle Companions (Pets) ---
  if (state.pet) {
      try {
          const styledNft = state.pet;
          const resolved = await resolveNFT(styledNft);
          const petPath = getMeshPath('pets', styledNft.styleKey);
          
          if (petPath) {
              const petMesh = await loadGLTF(petPath);
              
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
          }
          
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