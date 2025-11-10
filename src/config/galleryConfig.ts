export interface NftSource {
  contractAddress: string;
  tokenId: number;
}

export interface PanelConfig {
  [key: string]: NftSource | null; // Key is the panel identifier, value is the NFT source or null
}

// The contract address provided by the user (Panth.art collection)
const COLLECTION_ADDRESS = "0xe86fb488532e86d99574B9fed9D42ff4AC0FDE23";

// Helper to generate NFT source objects
const getSource = (tokenId: number): NftSource => ({
  contractAddress: COLLECTION_ADDRESS,
  tokenId: tokenId,
});

// Helper to cycle through token IDs (1 to 20)
const getTokenId = (index: number) => index + 1;

export const GALLERY_PANEL_CONFIG: PanelConfig = {
  // --- East Wall (Right side of the room) ---
  'east-wall-left-left': getSource(getTokenId(0)),
  'east-wall-left-center': getSource(getTokenId(1)),
  'east-wall-center-center': getSource(getTokenId(2)),
  'east-wall-right-center': getSource(getTokenId(3)),
  'east-wall-right-right': getSource(getTokenId(4)),

  // --- West Wall (Left side of the room) ---
  'west-wall-right-right': getSource(getTokenId(5)),
  'west-wall-right-center': getSource(getTokenId(6)),
  'west-wall-center-center': getSource(getTokenId(7)),
  'west-wall-left-center': getSource(getTokenId(8)),
  'west-wall-left-left': getSource(getTokenId(9)),

  // --- South Wall (Back wall) ---
  'south-wall-left-left': getSource(getTokenId(10)),
  'south-wall-left-center': getSource(getTokenId(11)),
  'south-wall-center-center': getSource(getTokenId(12)),
  'south-wall-right-center': getSource(getTokenId(13)),
  'south-wall-right-right': getSource(getTokenId(14)),

  // --- North Wall (Front wall) ---
  'north-wall-right-right': getSource(getTokenId(15)),
  'north-wall-right-center': getSource(getTokenId(16)),
  'north-wall-center-center': getSource(getTokenId(17)),
  'north-wall-left-center': getSource(getTokenId(18)),
  'north-wall-left-left': getSource(getTokenId(19)),
};