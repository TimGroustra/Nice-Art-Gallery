// RuntimeConfig.ts
export const RuntimeLimits = {
  maxWearables: 8,
  maxProps: 5,
  maxPets: 1,
  maxFloating: 3,
  maxAnimatedTextures: 4,

  maxTextureSize: 2048,
  maxDrawCallsPerAvatar: 60
};

export const ZoneRules = {
  quietZones: {
    disablePets: true,
    disableParticles: true,
    disableProps: true
  }
};