// multiplayer/AvatarReplicator.ts
import * as THREE from "three";
import { buildAvatar } from "../AvatarBuilder";
import { AvatarProfile } from "../AvatarState";

const avatarCache = new Map<string, THREE.Object3D>();
const avatarHashCache = new Map<string, string>();

/**
 * Retrieves or creates a remote avatar model. Only rebuilds if the avatarHash has changed.
 */
export async function getOrCreateRemoteAvatar(
  wallet: string,
  avatarState: AvatarProfile,
  avatarHash: string
): Promise<THREE.Object3D> {
  // 1. Check if avatar exists and hash matches
  if (avatarCache.has(wallet) && avatarHashCache.get(wallet) === avatarHash) {
    return avatarCache.get(wallet)!;
  }

  // 2. If hash changed or avatar doesn't exist, build/rebuild
  const newAvatar = await buildAvatar(avatarState);
  
  // Cleanup old avatar if present
  if (avatarCache.has(wallet)) {
      const oldAvatar = avatarCache.get(wallet)!;
      oldAvatar.parent?.remove(oldAvatar);
      // Note: Full disposal of old geometry/materials should happen here in a real app, 
      // but for simplicity, we rely on the garbage collector for now.
  }

  avatarCache.set(wallet, newAvatar);
  avatarHashCache.set(wallet, avatarHash);
  
  return newAvatar;
}

/**
 * Removes a remote avatar from the cache and scene.
 */
export function removeRemoteAvatar(wallet: string) {
    if (avatarCache.has(wallet)) {
        const avatar = avatarCache.get(wallet)!;
        avatar.parent?.remove(avatar);
        avatarCache.delete(wallet);
        avatarHashCache.delete(wallet);
    }
}