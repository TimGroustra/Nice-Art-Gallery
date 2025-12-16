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
    if ((obj as any).userData?.type === "pet") (obj as any).visible = rules.pets;
    if ((obj as any).userData?.type === "prop") (obj as any).visible = rules.props;
    if ((obj as any).userData?.type === "effect") (obj as any).visible = rules.effects;
  });
}