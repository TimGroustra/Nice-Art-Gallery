// gallery/ZoneManager.ts
import * as THREE from "three";
import { ZoneRules, GalleryZone } from "./ZoneRules";

/**
 * Applies visibility rules based on the current gallery zone.
 */
export function applyZoneRules(
  avatar: THREE.Object3D,
  zone: GalleryZone
) {
  const rules = ZoneRules[zone];

  avatar.traverse(obj => {
    // We assume the avatar assembler tags the root of pets, props, and effects
    if (obj.userData.type === "pet") obj.visible = rules.pets;
    if (obj.userData.type === "prop") obj.visible = rules.props;
    if (obj.userData.type === "effect") obj.visible = rules.effects;
  });
}