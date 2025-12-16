// AttachmentSystem.ts
import { AvatarState } from "./AvatarState";
import { AvatarCapabilities } from "./AvatarCapabilities";

/**
 * Checks if a specific slot within a category can accept another NFT attachment.
 * This is primarily used for multi-slot categories like 'props' or 'wearables'.
 */
export function canAttach(
  avatar: AvatarState,
  category: keyof typeof AvatarCapabilities,
  slot: string
): boolean {
  const categoryCaps = (AvatarCapabilities as any)[category];
  if (!categoryCaps) return false;

  // Check if the slot is defined in capabilities
  const max = categoryCaps[slot];
  if (max === undefined) {
    // If the slot is not explicitly defined, assume it's a single slot (max 1)
    return !(avatar as any)[category]?.[slot];
  }

  // If max is a number (e.g., wrist: 2, floating: 3)
  if (typeof max === 'number') {
    const currentCount = Object.values(
      (avatar as any)[category] || {}
    ).filter(Boolean).length;
    
    return currentCount < max;
  }
  
  // For non-numeric capabilities (like species array), this function is less relevant, 
  // but we return true if the slot exists.
  return true;
}