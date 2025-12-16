// editor/editorTypes.ts
export type NFTUse =
  | "tshirt"
  | "hoodie"
  | "watch"
  | "hat"
  | "glasses"
  | "sword"
  | "jar"
  | "ball"
  | "pet"
  | "floating"
  | "palette"
  | "aura";

export interface OwnedNFT {
  chainId: number;
  contract: string;
  tokenId: string;
  image: string;
}