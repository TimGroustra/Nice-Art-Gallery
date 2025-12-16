// EffectSystem.ts
import * as THREE from "three";
import { seededRange } from "./SeedVariations";

export function createAura(
  seed: number,
  color = 0x88ccff
): THREE.Points {
  const count = Math.floor(seededRange(seed, 50, 120, 8));
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Position particles around the origin (center of the avatar)
    positions[i * 3 + 0] = (Math.random() - 0.5) * 2;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2 + 1.0; // Lift slightly off the ground
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2;
  }

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );

  const material = new THREE.PointsMaterial({
    color,
    size: 0.03,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });

  return new THREE.Points(geometry, material);
}