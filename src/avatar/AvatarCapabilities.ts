// AvatarCapabilities.ts
export const AvatarCapabilities = {
  body: {
    height: true,
    build: true,
    species: ["human", "panda", "creature"]
  },
  face: {
    expression: 1
  },
  hair: {
    style: 1
  },
  wearables: {
    head: 1,
    face: 1,
    torso: 1,
    wrist: 2,
    waist: 1,
    feet: 1
  },
  props: {
    handheld: 2,
    floating: 3
  },
  companions: {
    pet: 1
  },
  effects: {
    aura: 1,
    trail: 1
  }
} as const;