import { AvatarProfile } from "./AvatarTypes";
import { createAvatarMesh } from "./AvatarMeshFactory";
import * as THREE from "three";

export function generateAvatar(profile: AvatarProfile): THREE.Group {
  return createAvatarMesh(profile);
}