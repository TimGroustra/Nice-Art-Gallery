// AvatarState.ts
export interface NFTRef {
  chainId: number;
  contract: string;
  tokenId: string;
}

// Define a structure for items that require both an NFT source and a mesh style
export interface StyledNFTRef extends NFTRef {
  styleKey: string; // e.g., 'tshirt', 'sword', 'cat'
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
    head?: StyledNFTRef;
    torso?: StyledNFTRef;
    wristLeft?: StyledNFTRef;
    wristRight?: StyledNFTRef;
    feet?: StyledNFTRef;
  };
  props: {
    handLeft?: StyledNFTRef;
    handRight?: StyledNFTRef;
    floating?: StyledNFTRef[];
  };
  pet?: StyledNFTRef;
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