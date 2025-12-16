// performance/AvatarCuller.ts
import * as THREE from "three";

const CULL_DISTANCE = 35;

/**
 * Toggles avatar visibility based on distance from the camera.
 */
export function cullAvatar(
  avatar: THREE.Object3D,
  cameraPos: THREE.Vector3
) {
  const distance = avatar.position.distanceTo(cameraPos);
  const visible = distance < CULL_DISTANCE;
  avatar.traverse(obj => {
    if ((obj as THREE.Mesh).isMesh) {
      (obj as THREE.Mesh).visible = visible;
    }
  });
}