import * as THREE from 'three';
import { ROOM_SIZE, WALL_HEIGHT } from './constants';

const createStarTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return null;

    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
};

const createStarField = (count: number, size: number, color: number, texture: THREE.CanvasTexture | null) => {
    const starVertices = [];
    for (let i = 0; i < count; i++) {
        const x = THREE.MathUtils.randFloatSpread(ROOM_SIZE);
        const z = THREE.MathUtils.randFloatSpread(ROOM_SIZE);
        const y = WALL_HEIGHT - 0.01;
        starVertices.push(x, y, z);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    const starMaterial = new THREE.PointsMaterial({
        map: texture,
        color: color,
        size: size * 5,
        sizeAttenuation: true,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(starGeometry, starMaterial);
};

export function setupStarfield(scene: THREE.Scene) {
    const starTexture = createStarTexture();
    const stars1 = createStarField(7000, 0.05, 0xffffff, starTexture);
    const stars2 = createStarField(7000, 0.05, 0xeeeeff, starTexture);
    scene.add(stars1, stars2);
    return { stars1, stars2 };
}