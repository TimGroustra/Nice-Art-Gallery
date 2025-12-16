// MorphSystem.ts
import * as THREE from "three";
import { seededRange } from "./SeedVariations";

export function applyBodyMorphs(
  body: THREE.Object3D,
  seed: number
) {
  const height = seededRange(seed, 0.95, 1.05, 1);
  const build = seededRange(seed, 0.9, 1.1, 2);
  body.scale.set(build, height, build);
}

export function applyFaceExpression(
  head: THREE.Object3D,
  seed: number
) {
  // Simple rotation variation for expression
  head.rotation.y += seededRange(seed, -0.05, 0.05, 3);
}

export function applyHairVariation(
  hair: THREE.Object3D,
  seed: number
) {
  hair.scale.multiplyScalar(seededRange(seed, 0.9, 1.1, 4));
}