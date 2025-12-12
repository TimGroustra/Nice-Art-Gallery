import React from "react";
import NftGallery from "./NftGallery";

interface NftGalleryLayoutProps {
  setInstructionsVisible: (visible: boolean) => void;
}

/**
 * Wrapper component that renders the 3‑D gallery.
 * It simply forwards the `setInstructionsVisible` callback to the
 * underlying `NftGallery` component.
 */
const NftGalleryLayout: React.FC<NftGalleryLayoutProps> = ({
  setInstructionsVisible,
}) => {
  return <NftGallery setInstructionsVisible={setInstructionsVisible} />;
};

export default NftGalleryLayout;