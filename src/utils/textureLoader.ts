import * as THREE from 'three';
import gifler from 'gifler';

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
            await new Promise<void>((resolve, reject) => {
                const onCanPlay = () => {
                    videoElement.removeEventListener('canplay', onCanPlay);
                    videoElement.removeEventListener('error', onError);
                    videoElement.play().then(resolve).catch(reject);
                };
                const onError = (e: Event | string) => {
                    videoElement.removeEventListener('canplay', onCanPlay);
                    videoElement.removeEventListener('error', onError);
                    reject(e);
                };
                videoElement.addEventListener('canplay', onCanPlay);
                videoElement.addEventListener('error', onError);
                videoElement.src = url;
                videoElement.crossOrigin = 'anonymous';
                videoElement.load();
            });
            const texture = new THREE.VideoTexture(videoElement);
            texture.colorSpace = THREE.SRGBColorSpace;
            return { texture };
        }

        if (isGif) {
            return await new Promise((resolve) => {
                gifler(url).get((anim: any) => {
                    const canvas = anim.canvas;
                    const texture = new THREE.CanvasTexture(canvas);
                    texture.colorSpace = THREE.SRGBColorSpace;
                    
                    let isRunning = true;
                    anim.animateInCanvas();

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
            });
        }

        // Static image
        const texture = await new THREE.TextureLoader().loadAsync(url);
        texture.colorSpace = THREE.SRGBColorSpace;
        return { texture };

    } catch (error) {
        console.error(`Failed to load texture from ${url}:`, error);
        return { texture: createPlaceholderTexture() };
    }
};