// PetSystem.ts
import * as THREE from "three";

export interface PetInstance {
  model: THREE.Group;
  followDistance: number;
  // Add velocity/state for more complex movement if needed later
}

/**
 * Updates the pet's position to follow the owner's position using linear interpolation (lerp).
 */
export function updatePet(
  pet: PetInstance,
  ownerPosition: THREE.Vector3,
  delta: number
) {
  // Calculate a target position slightly offset from the owner
  const targetPosition = ownerPosition.clone().add(new THREE.Vector3(1.5, 0, 1.5));
  
  // Smoothly move the pet towards the target position
  pet.model.position.lerp(
    targetPosition,
    delta * 2.0 // Lerp factor (speed)
  );
  
  // Simple rotation to face the owner (optional)
  pet.model.lookAt(ownerPosition);
}