// performance/UpdateScheduler.ts
import * as THREE from "three";

const UPDATE_INTERVAL = 0.2; // 5 times per second

/**
 * Schedules non-critical avatar updates (like pet AI or idle animations).
 */
export function scheduleAvatarUpdates(
  avatar: THREE.Object3D,
  delta: number
) {
  (avatar as any).userData._timer = ((avatar as any).userData._timer || 0) + delta;
  if ((avatar as any).userData._timer > UPDATE_INTERVAL) {
    (avatar as any).userData._timer = 0;
    
    // Example: Update pet position (if PetSystem was fully implemented)
    // const petInstance = (avatar as any).userData.petInstance;
    // if (petInstance) {
    //   updatePet(petInstance, avatar.position, UPDATE_INTERVAL);
    // }
  }
}