// AvatarState.ts
export interface NFTRef {
  chainId: number;
  contract: string;
  tokenId: string;
}

export interface AvatarState {
  morphs: {
    species?: NFTRef;
    bodySeed?: NFTRef;
    hair?: NFTRef;
    face?: NFTRef;
    palette?: NFTRef;
  };

  wearables: Record<string, NFTRef | null>;
  props: Record<string, NFTRef | null>;
  companions: {
    pet?: NFTRef;
  };

  effects: Record<string, NFTRef | null>;
}

// Initial state for a new user
export const INITIAL_AVATAR_STATE: AvatarState = {
  morphs: {},
  wearables: {
    head: null,
    face: null,
    torso: null,
    wrist: null,
    waist: null,
    feet: null,
  },
  props: {
    handheld: null,
    floating: null,
  },
  companions: {
    pet: null,
  },
  effects: {
    aura: null,
    trail: null,
  },
};