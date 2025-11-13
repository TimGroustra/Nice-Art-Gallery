import * as THREE from "three";
import { parseGIF, decompressFrames } from "gifuct-js";

export interface GifTextureResult {
    texture: THREE.CanvasTexture;
    stop: () => void;
    width: number;
    height: number;
}

/**
 * Fetches a GIF, decodes its frames, and sets up a continuous loop to update a THREE.CanvasTexture.
 * @param gifUrl The URL of the GIF file.
 * @returns An object containing the texture, a stop function, and the GIF dimensions.
 */
export async function createGifTexture(gifUrl: string): Promise<GifTextureResult> {
    // 1. Fetch binary data
    const res = await fetch(gifUrl, { mode: "cors" });
    if (!res.ok) {
        throw new Error(`Failed to fetch GIF: ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    
    // 2. Decode frames
    const gif = parseGIF(arrayBuffer);
    const frames = decompressFrames(gif, true);

    if (frames.length === 0) {
        throw new Error("GIF contains no frames.");
    }

    // 3. Setup canvas
    const width = frames[0].dims.width;
    const height = frames[0].dims.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
        throw new Error("Could not get 2D context for canvas.");
    }

    // 4. Create Three.js texture
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBAFormat;
    texture.needsUpdate = true;

    let frameIndex = 0;
    let running = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // 5. Draw loop
    function loop() {
        if (!running) return;
        
        const f = frames[frameIndex];
        
        // Create ImageData from frame.patch (Uint8ClampedArray) then putImageData
        // Note: f.patch is a Uint8Array, but ImageData constructor expects Uint8ClampedArray or Uint8Array
        const imageData = new ImageData(new Uint8ClampedArray(f.patch), f.dims.width, f.dims.height);
        
        // Draw the frame patch onto the canvas at the correct offset
        ctx.putImageData(imageData, f.dims.left, f.dims.top);
        
        texture.needsUpdate = true;

        // Next frame after delay (delay is in hundredths of a second in GIF spec)
        const delayMs = (f.delay || 10) * 10;
        frameIndex = (frameIndex + 1) % frames.length;
        
        timeoutId = setTimeout(loop, delayMs);
    }

    loop();

    const stop = () => { 
        running = false; 
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        // Dispose of the texture when stopped
        texture.dispose();
    };

    return { texture, stop, width, height };
}