// AvatarBuilder.ts
import { assembleAvatar } from "./AvatarAssembler";
import { AvatarState } from "./AvatarState";

/**
 * Public API function to build the avatar model from the persisted state.
 */
export async function buildAvatar(
  avatarState: AvatarState
) {
  return await assembleAvatar(avatarState);
}