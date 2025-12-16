// persistence/OwnershipValidator.ts
import { NFTRef, AvatarState } from "./AvatarState";

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
  avatarState: AvatarState,
  wallet: string
): Promise<AvatarState> {
  const newState = JSON.parse(JSON.stringify(avatarState)) as AvatarState;
  let changed = false;

  const checkCategory = async (category: 'wearables' | 'props' | 'companions' | 'effects' | 'morphs') => {
    const items = newState[category] as Record<string, NFTRef | null>;
    for (const slot in items) {
      const nft = items[slot];
      if (nft) {
        const owned = await ownsNFT(wallet, nft);
        if (!owned) {
          (items as any)[slot] = null;
          changed = true;
          console.warn(`NFT in slot ${slot} removed due to failed ownership check.`);
        }
      }
    }
  };

  await checkCategory('wearables');
  await checkCategory('props');
  await checkCategory('companions');
  await checkCategory('effects');
  await checkCategory('morphs');


  return changed ? newState : avatarState;
}