import * as THREE from 'three';

// This type helps manage textures that need updates in the animation loop
export interface AnimatedTexture {
  texture: THREE.CanvasTexture;
  cleanup: () => void;
}

// Placeholder for failed/empty loads
const createPlaceholderTexture = (): THREE.Texture => {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = 'white'; ctx.font = '20px Arial';
        ctx.textAlign = 'center'; ctx.fillText('Load Error', 128, 128);
    }
    const placeholderTex = new THREE.CanvasTexture(canvas);
    // Use SRGBColorSpace for placeholder consistency
    placeholderTex.colorSpace = THREE.SRGBColorSpace; 
    return placeholderTex;
};

export const createNftTexture = async (
    url: string, 
    videoElement: HTMLVideoElement
): Promise<{ texture: THREE.Texture, animatedTexture?: AnimatedTexture }> => {
    if (!url) {
        return { texture: createPlaceholderTexture() };
    }

    const isVideo = /\.(mp4|webm|ogg)(\?.*)?$/i.test(url);
    const isGif = /\.gif(\?.*)?$/i.test(url);

    try {
        if (isVideo) {
            // 1. Set up video element properties
            videoElement.src = url;
            videoElement.crossOrigin = 'anonymous';
            videoElement.loop = true;
            // Muted is handled by NftGallery's global controls, but ensure playsInline for mobile
            videoElement.playsInline = true; 
            videoElement.load();

            // 2. Wait for video data to be ready
            await new Promise<void>((resolve, reject) => {
                if (videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
                    return resolve();
                }
                
                const onLoadedData = () => {
                    videoElement.removeEventListener('loadeddata', onLoadedData);
                    videoElement.removeEventListener('error', onError);
                    resolve();
                };
                const onError = (e: Event | string) => {
                    videoElement.removeEventListener('loadeddata', onLoadedData);
                    videoElement.removeEventListener('error', onError);
                    reject(e);
                };
                videoElement.addEventListener('loadeddata', onLoadedData);
                videoElement.addEventListener('error', onError);
            });
            
            // 3. Start playback (handled by NftGallery controls after lock)
            // We create the texture now that the element has data
            const texture = new THREE.VideoTexture(videoElement);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;
            
            return { texture };
        }

        if (isGif) {
            return await new Promise(async (resolve, reject) => {
                try {
                    // Dynamic import of gifler (Option B from your suggestion)
                    const mod = await import('gifler');
                    const gifler = mod.default ?? mod;

                    if (typeof gifler !== 'function') {
                        throw new Error("gifler module not found or not callable.");
                    }

                    gifler(url).get((anim: any) => {
                        const canvas = anim.canvas;
                        const texture = new THREE.CanvasTexture(canvas);
                        texture.colorSpace = THREE.SRGBColorSpace;
                        texture.minFilter = THREE.LinearFilter;
                        texture.magFilter = THREE.LinearFilter;
                        texture.generateMipmaps = false;
                        
                        let isRunning = true;
                        anim.animateInCanvas();

                        // We need to manually update the texture in the render loop
                        // NftGallery will handle the needsUpdate via the AnimatedTexture interface
                        
                        const animatedTexture: AnimatedTexture = {
                            texture,
                            cleanup: () => {
                                if (isRunning) {
                                    anim.stop();
                                    isRunning = false;
                                }
                            }
                        };
                        resolve({ texture, animatedTexture });
                    });
                } catch (e) {
                    reject(e);
                }
            });
        }

        // Static image
        const texture = await new THREE.TextureLoader().loadAsync(url);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        return { texture };

    } catch (error) {
        console.error(`Failed to load texture from ${url}:`, error);
        return { texture: createPlaceholderTexture() };
    }
};