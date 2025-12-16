// NFTMediaResolver.ts
import * as THREE from "three";

export type NFTMedia = 
  | { type: "texture"; texture: THREE.Texture }
  | { type: "video"; texture: THREE.VideoTexture };

export async function resolveNFTMedia(
  url: string
): Promise<NFTMedia> {
  // Check for video extensions
  if (url.endsWith(".mp4") || url.endsWith(".webm")) {
    const video = document.createElement("video");
    video.src = url;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    
    // Attempt to play immediately (may be blocked, but texture creation is synchronous)
    video.play().catch(e => console.warn("Video autoplay blocked for NFT media:", e));
    
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { type: "video", texture };
  }

  // Default to image texture
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return { type: "texture", texture };
}