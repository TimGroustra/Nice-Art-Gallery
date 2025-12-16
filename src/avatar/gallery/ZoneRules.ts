// gallery/ZoneRules.ts
export const ZoneRules = {
  quiet: {
    pets: false,
    props: false,
    effects: false
  },
  social: {
    pets: true,
    props: true,
    effects: true
  }
} as const;

export type GalleryZone = keyof typeof ZoneRules;