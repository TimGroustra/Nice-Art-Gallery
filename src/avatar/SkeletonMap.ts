// SkeletonMap.ts
export const SkeletonBones = [
  "Hips",
  "Spine",
  "Chest",
  "Neck",
  "Head",

  "LeftShoulder",
  "LeftArm",
  "LeftForeArm",
  "LeftHand",
  "LeftWrist",

  "RightShoulder",
  "RightArm",
  "RightForeArm",
  "RightHand",
  "RightWrist",

  "LeftLeg",
  "LeftFoot",
  "RightLeg",
  "RightFoot"
] as const;

export type SkeletonBone = typeof SkeletonBones[number];