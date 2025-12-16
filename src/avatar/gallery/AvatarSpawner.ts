// gallery/AvatarSpawner.ts
import * as THREE from "three";
import { getOrCreateRemoteAvatar } from "../multiplayer/AvatarReplicator";
import { AvatarState } from "../AvatarState";

/**
 * Spawns or updates a remote avatar in the Three.js scene.
 */
export async function spawnAvatarInGallery(
  scene: THREE.Scene,
  wallet: string,
  avatarState: AvatarState,
  avatarHash: string,
  position: THREE.Vector3,
  rotation: number
) {
  const avatar = await getOrCreateRemoteAvatar(wallet, avatarState, avatarHash);
  
  // Ensure avatar is in the scene
  if (!avatar.parent) {
      scene.add(avatar);
  }
  
  // Update position and rotation
  avatar.position.copy(position);
  avatar.rotation.y = rotation;
  
  return avatar;
}