// AvatarBuilder.ts
import { assembleAvatar } from "./AvatarAssembler";
import { AvatarProfile } from "./AvatarState";

/**
 * Public API function to build the avatar model from the persisted state.
 */
export async function buildAvatar(
  avatarState: AvatarProfile
) {
  return await assembleAvatar(avatarState);
}