// AvatarState.ts
export interface NFTRef {
  chainId: number;
  contract: string;
  tokenId: string;
}

export interface AvatarProfile {
  species: "human" | "panda" | "creature";

  bodySeed?: NFTRef;
  paletteSeed?: NFTRef;

  hair?: {
    style: "short" | "medium" | "long" | "bun" | "spikes" | "bald";
    source?: NFTRef;
  };

  face?: {
    expression: "neutral" | "smile" | "smirk" | "serious" | "playful";
    source?: NFTRef;
  };

  wearables: {
    head?: NFTRef;
    torso?: NFTRef;
    wristLeft?: NFTRef;
    wristRight?: NFTRef;
    feet?: NFTRef;
  };

  props: {
    handLeft?: NFTRef;
    handRight?: NFTRef;
    floating?: NFTRef[];
  };

  pet?: NFTRef;
  aura?: NFTRef;
}

// Initial state for a new user
export const INITIAL_AVATAR_PROFILE: AvatarProfile = {
  species: "human",
  wearables: {},
  props: {
    floating: [],
  },
};