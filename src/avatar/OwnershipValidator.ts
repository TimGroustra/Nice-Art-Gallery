// persistence/OwnershipValidator.ts
import { NFTRef, AvatarProfile } from "./AvatarState";

/**
 * Placeholder for actual ownership check (needs blockchain integration).
 */
async function ownsNFT(walletAddress: string, nft: NFTRef): Promise<boolean> {
  // For now, assume ownership is true if an NFT is referenced.
  // This needs to be replaced with actual blockchain check later.
  return true;
}

/**
 * Validates the current avatar state against the user's wallet ownership.
 * Removes any items the user no longer owns.
 */
export async function validateOwnership(
  avatarProfile: AvatarProfile,
  wallet: string
): Promise<AvatarProfile> {
  const newState = JSON.parse(JSON.stringify(avatarProfile)) as AvatarProfile;
  let changed = false;

  const checkNFTRef = async (nftRef: NFTRef | undefined): Promise<NFTRef | undefined> => {
    if (nftRef) {
      const owned = await ownsNFT(wallet, nftRef);
      if (!owned) {
        changed = true;
        return undefined;
      }
    }
    return nftRef;
  };

  // Check morphs/seeds
  newState.bodySeed = await checkNFTRef(newState.bodySeed);
  newState.paletteSeed = await checkNFTRef(newState.paletteSeed);

  if (newState.hair?.source) {
    newState.hair.source = await checkNFTRef(newState.hair.source);
    if (!newState.hair.source) newState.hair.style = "bald";
  }

  if (newState.face?.source) {
    newState.face.source = await checkNFTRef(newState.face.source);
    if (!newState.face.source) newState.face.expression = "neutral";
  }

  // Check wearables
  for (const slot in newState.wearables) {
    const key = slot as keyof typeof newState.wearables;
    newState.wearables[key] = await checkNFTRef(newState.wearables[key]);
  }

  // Check props
  for (const slot in newState.props) {
    const key = slot as keyof typeof newState.props;
    if (key === 'floating' && newState.props.floating) {
      const checkedFloating = await Promise.all(newState.props.floating.map(checkNFTRef));
      newState.props.floating = checkedFloating.filter((n): n is NFTRef => !!n);
      if (newState.props.floating.length !== checkedFloating.length) changed = true;
    } else {
      (newState.props as any)[key] = await checkNFTRef((newState.props as any)[key]);
    }
  }

  // Check companions/effects
  newState.pet = await checkNFTRef(newState.pet);
  newState.aura = await checkNFTRef(newState.aura);

  return changed ? newState : avatarProfile;
}