// AttachmentMap.ts
import { SkeletonBone } from "./SkeletonMap";

export type AttachmentSlot = 
  | "head" 
  | "hair" 
  | "torso" 
  | "face" 
  | "wrist.left" 
  | "wrist.right" 
  | "hand.left" 
  | "hand.right" 
  | "feet" 
  | "floating" 
  | "pet";

export const AttachmentMap: Record<AttachmentSlot, SkeletonBone | "world"> = {
  head: "Head",
  hair: "Head",
  face: "Head",
  torso: "Spine",
  "wrist.left": "LeftWrist",
  "wrist.right": "RightWrist",
  "hand.left": "RightHand", // Assuming handheld props use RightHand by default
  "hand.right": "RightHand",
  feet: "LeftFoot",
  floating: "world",
  pet: "world"
};