import * as THREE from "three";
import { AvatarProfile } from "./AvatarTypes";
import { generateAvatar } from "./AvatarGenerator";

export class AvatarController {
  private avatar: THREE.Object3D | null = null;

  /**
   * Updates the avatar mesh in the scene based on the new profile.
   * This removes the old mesh and adds a new one.
   */
  update(scene: THREE.Scene, profile: AvatarProfile) {
    if (this.avatar) {
      scene.remove(this.avatar);
      // Dispose of geometry and materials of the old avatar
      this.avatar.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      this.avatar = null;
    }

    this.avatar = generateAvatar(profile);
    // The generator handles positioning the avatar to stand at y=0
    this.avatar.position.set(0, 0, 0); 

    scene.add(this.avatar);
  }

  /**
   * Removes the avatar from the scene and disposes of resources.
   */
  clear(scene: THREE.Scene) {
    if (this.avatar) {
      scene.remove(this.avatar);
      this.avatar.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      this.avatar = null;
    }
  }
}