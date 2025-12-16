// multiplayer/NetworkSerializer.ts
import { keccak256, toUtf8Bytes } from "ethers";
import { AvatarState } from "../AvatarState";

export function hashAvatarState(state: AvatarState): string {
  // We only hash the parts that affect the visual output
  const serializableState = {
    morphs: state.morphs,
    wearables: state.wearables,
    props: state.props,
    companions: state.companions,
    effects: state.effects,
  };
  return keccak256(toUtf8Bytes(JSON.stringify(serializableState)));
}