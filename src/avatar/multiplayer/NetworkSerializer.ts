// multiplayer/NetworkSerializer.ts
import { keccak256, toUtf8Bytes } from "ethers";
import { AvatarProfile } from "../AvatarState";

export function hashAvatarState(state: AvatarProfile): string {
  // We only hash the parts that affect the visual output
  const serializableState = {
    species: state.species,
    bodySeed: state.bodySeed,
    paletteSeed: state.paletteSeed,
    hair: state.hair,
    face: state.face,
    wearables: state.wearables,
    props: state.props,
    pet: state.pet,
    aura: state.aura,
  };
  return keccak256(toUtf8Bytes(JSON.stringify(serializableState)));
}