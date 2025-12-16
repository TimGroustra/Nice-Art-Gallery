// multiplayer/AvatarNetworkState.ts
export interface NetworkAvatarState {
  wallet: string;
  avatarHash: string;
  position: [number, number, number];
  rotation: number;
}