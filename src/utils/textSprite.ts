import * as THREE from 'three';

/**
 * Creates a THREE.Sprite displaying text rendered onto a canvas.
 * @param text The text content.
 * @param parameters Configuration for the sprite (font size, color, background).
 * @returns A THREE.Sprite object.
 */
export function createTextSprite(text: string, parameters: {
  fontsize?: number;
  fontface?: string;
  textColor?: string;
  backgroundColor?: string | null;
  padding?: number;
  scale?: number;
} = {}): THREE.Sprite {
  const {
    fontsize = 32,
    fontface = 'Arial',
    textColor = 'rgba(255, 255, 255, 1)',
    backgroundColor = 'rgba(0, 0, 0, 0.7)',
    padding = 10,
    scale = 0.5,
  } = parameters;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error("Canvas context not available.");

  context.font = `${fontsize}px ${fontface}`;
  
  // Measure text width
  const metrics = context.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontsize;

  // Set canvas dimensions (add padding)
  canvas.width = textWidth + 2 * padding;
  canvas.height = textHeight + 2 * padding;

  // Re-set font after resizing canvas
  context.font = `${fontsize}px ${fontface}`;
  context.textAlign = 'left';
  context.textBaseline = 'top';

  // Draw background
  if (backgroundColor) {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Draw text
  context.fillStyle = textColor;
  context.fillText(text, padding, padding);

  // Create texture and material
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMaterial);

  // Scale the sprite based on the canvas dimensions and desired scale factor
  sprite.scale.set(canvas.width * scale / fontsize, canvas.height * scale / fontsize, 1);

  return sprite;
}