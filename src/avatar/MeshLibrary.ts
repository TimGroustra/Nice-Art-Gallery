// MeshLibrary.ts
export type BodySpecies = "human" | "panda" | "creature";

export const MeshLibrary = {
  bodies: {
    human: "/meshes/body_human.glb",
    panda: "/meshes/body_panda.glb",
    creature: "/meshes/body_creature.glb"
  },

  hair: {
    short: "/meshes/hair_short.glb",
    medium: "/meshes/hair_medium.glb",
    long: "/meshes/hair_long.glb",
    bun: "/meshes/hair_bun.glb",
    spikes: "/meshes/hair_spikes.glb",
    bald: "/meshes/hair_bald.glb"
  },

  wearables: {
    tshirt: "/meshes/wearable_tshirt.glb",
    hoodie: "/meshes/wearable_hoodie.glb",
    watch: "/meshes/wearable_watch.glb",
    hat: "/meshes/wearable_hat.glb",
    glasses: "/meshes/wearable_glasses.glb",
    shoes: "/meshes/wearable_shoes.glb"
  },

  props: {
    sword: "/meshes/prop_sword.glb",
    jar: "/meshes/prop_jar.glb",
    ball: "/meshes/prop_ball.glb",
    gem: "/meshes/prop_gem.glb"
  },

  pets: {
    cat: "/meshes/pet_cat.glb",
    panda: "/meshes/pet_panda.glb"
  }
} as const;