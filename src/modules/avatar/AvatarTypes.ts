export type AvatarProfile = {
  height: number;        // 0.9 – 1.1
  build: number;         // 0.8 – 1.2
  headSize: number;      // 0.9 – 1.1

  skinTone: string;      // hex
  accentColor: string;   // hex

  hairStyle: "none" | "short" | "bun";
  hairColor: string;

  hasBeard: boolean;
};