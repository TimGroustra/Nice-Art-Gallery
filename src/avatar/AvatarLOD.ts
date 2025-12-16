// AvatarLOD.ts
import * as THREE from "three";

export function applyLOD(
  avatar: THREE.Object3D,
  distance: number
) {
  // Simple visibility toggle based on distance
  const visible = distance < 30;
  avatar.traverse(obj => {
    if ((obj as THREE.Mesh).isMesh) {
      (obj as THREE.Mesh).visible = visible;
    }
  });
}