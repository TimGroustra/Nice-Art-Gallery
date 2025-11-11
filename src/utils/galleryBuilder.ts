import * as THREE from 'three';
import { NftAttribute } from './nftFetcher';
import { PanelConfig } from '@/config/galleryConfig';

// --- Types and Constants ---

export interface Panel {
  mesh: THREE.Mesh;
  wallName: keyof PanelConfig;
  metadataUrl: string;
  isVideo: boolean;
  prevArrow: THREE.Mesh;
  nextArrow: THREE.Mesh;
  titleMesh: THREE.Mesh;
  descriptionMesh: THREE.Mesh;
  attributesMesh: THREE.Mesh;
  wallTitleMesh: THREE.Mesh;
  currentDescription: string;
  descriptionScrollY: number;
  descriptionTextHeight: number;
  currentAttributes: NftAttribute[];
}

export interface WallConfig {
    wallName: keyof PanelConfig;
    position: [number, number, number];
    rotation: [number, number, number];
    wallDimensions: { width: number, height: number };
    panelDimensions: { width: number, height: number };
}

const ARROW_COLOR_DEFAULT = 0xcccccc;
const ARROW_DEPTH_OFFSET = 0.02;
const ARROW_PANEL_OFFSET = 1.5;
const TEXT_DEPTH_OFFSET = 0.03;
const TEXT_PANEL_WIDTH = 1.5;
const TITLE_HEIGHT = 0.5;
const DESCRIPTION_HEIGHT = 1.5;
const TEXT_BLOCK_OFFSET_X = 3;
const TITLE_PANEL_WIDTH = 2.0;
const ATTRIBUTES_HEIGHT = 1.5;
const WALL_TITLE_HEIGHT = 0.75;


// --- Texture Helpers (Moved from NftGallery.tsx) ---

export const createTextTexture = (text: string, width: number, height: number, fontSize: number, color: string = 'white', options: { scrollY?: number, wordWrap?: boolean } = {}): { texture: THREE.CanvasTexture, totalHeight: number } => {
    const { scrollY = 0, wordWrap = false } = options;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return { texture: new THREE.CanvasTexture(document.createElement('canvas')), totalHeight: 0 };

    const resolution = 512;
    canvas.width = resolution * (width / height);
    canvas.height = resolution;

    context.clearRect(0, 0, canvas.width, canvas.height);

    const actualFontSize = fontSize;
    context.font = `bold ${actualFontSize}px Arial`;
    context.fillStyle = color;
    
    const padding = 40;
    const lineHeight = actualFontSize * 1.2;
    let totalHeight = 0;

    if (wordWrap) {
        context.textAlign = 'left';
        context.textBaseline = 'top';
        let y = padding;
        const words = text.split(' ');
        let line = '';
        const maxTextWidth = canvas.width - 2 * padding;

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = context.measureText(testLine);
            const testWidth = metrics.width;

            if (testWidth > maxTextWidth && n > 0) {
                context.fillText(line, padding, y - scrollY);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        context.fillText(line, padding, y - scrollY);
        totalHeight = y + lineHeight - padding;
    } else {
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        totalHeight = lineHeight;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return { texture, totalHeight };
};

export const createAttributesTextTexture = (attributes: NftAttribute[], width: number, height: number, fontSize: number, color: string = 'white'): { texture: THREE.CanvasTexture } => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return { texture: new THREE.CanvasTexture(document.createElement('canvas')) };

    const resolution = 512;
    canvas.width = resolution * (width / height);
    canvas.height = resolution;

    context.clearRect(0, 0, canvas.width, canvas.height);

    context.font = `bold ${fontSize}px Arial`;
    context.fillStyle = color;
    context.textAlign = 'left';
    context.textBaseline = 'top';

    const padding = 40;
    const lineHeight = fontSize * 1.2;
    let y = padding;

    if (!attributes || attributes.length === 0) {
        context.fillText('No attributes found.', padding, y);
    } else {
        attributes.forEach(attr => {
            if (attr.trait_type && attr.value) {
                const line = `${attr.trait_type}: ${attr.value}`;
                context.fillText(line, padding, y);
                y += lineHeight;
            }
        });
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return { texture };
};


// --- Wall Builder Function ---

export function buildGalleryWall(scene: THREE.Scene, config: WallConfig, collectionName: string): Panel {
    const { wallName, position, rotation, wallDimensions, panelDimensions } = config;
    const [wallWidth, wallHeight] = [wallDimensions.width, wallDimensions.height];
    const [panelWidth, panelHeight] = [panelDimensions.width, panelDimensions.height];
    const panelYPosition = position[1]; // Assuming panel is centered vertically on the wall

    // 1. Create the physical wall
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });
    const wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(wallWidth, wallHeight), wallMaterial);
    wallMesh.position.set(position[0], position[1], position[2]);
    wallMesh.rotation.set(...rotation);
    scene.add(wallMesh);

    // 2. Create the NFT Panel (Mesh)
    const panelGeometry = new THREE.PlaneGeometry(panelWidth, panelHeight);
    const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
    
    // Calculate the position of the panel slightly in front of the wall
    const wallRotation = new THREE.Euler(...rotation, 'XYZ');
    const forwardVector = new THREE.Vector3(0, 0, 1).applyEuler(wallRotation);
    const panelPosition = new THREE.Vector3(position[0], panelYPosition, position[2]).addScaledVector(forwardVector, ARROW_DEPTH_OFFSET);

    const mesh = new THREE.Mesh(panelGeometry, panelMaterial.clone());
    mesh.position.copy(panelPosition);
    mesh.rotation.set(...rotation);
    scene.add(mesh);

    // Helper vectors for positioning relative to wall rotation
    const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(wallRotation);
    const upVector = new THREE.Vector3(0, 1, 0).applyEuler(wallRotation);
    const basePosition = new THREE.Vector3(position[0], panelYPosition, position[2]);

    // 3. Create Placeholder Material for Text
    const { texture: placeholderTexture } = createTextTexture('Loading...', TEXT_PANEL_WIDTH, TITLE_HEIGHT + DESCRIPTION_HEIGHT, 30, 'white', { wordWrap: false });
    const placeholderMaterial = new THREE.MeshBasicMaterial({ map: placeholderTexture, transparent: true, side: THREE.DoubleSide, alphaTest: 0.01, depthWrite: false });

    // 4. Create Title Mesh (Below NFT)
    const titleGeometry = new THREE.PlaneGeometry(TITLE_PANEL_WIDTH, TITLE_HEIGHT);
    const titleMesh = new THREE.Mesh(titleGeometry, placeholderMaterial.clone());
    titleMesh.rotation.set(...rotation);
    const titleYOffset = -panelHeight / 2 - (TITLE_HEIGHT / 2) - 0.1; // panel half-height + title half-height + gap
    const titlePosition = basePosition.clone()
        .addScaledVector(upVector, titleYOffset)
        .addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
    titleMesh.position.copy(titlePosition);
    scene.add(titleMesh);

    // 5. Create Description Mesh (Left of NFT)
    const descriptionGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, DESCRIPTION_HEIGHT);
    const descriptionMesh = new THREE.Mesh(descriptionGeometry, placeholderMaterial.clone());
    descriptionMesh.rotation.set(...rotation);
    
    const descriptionGroupPosition = basePosition.clone().addScaledVector(rightVector, -TEXT_BLOCK_OFFSET_X);
    const descriptionPosition = descriptionGroupPosition.clone().addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
    descriptionMesh.position.copy(descriptionPosition);
    scene.add(descriptionMesh);

    // 6. Create Attributes Mesh (Right of NFT)
    const attributesGeometry = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, ATTRIBUTES_HEIGHT);
    const attributesMesh = new THREE.Mesh(attributesGeometry, placeholderMaterial.clone());
    attributesMesh.rotation.set(...rotation);
    
    const collectionInfoGroupPosition = basePosition.clone().addScaledVector(rightVector, TEXT_BLOCK_OFFSET_X);
    const attributesPosition = collectionInfoGroupPosition.clone().addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
    attributesMesh.position.copy(attributesPosition);
    scene.add(attributesMesh);

    // 7. Create Wall Title Mesh (Above NFT)
    const wallTitleGeometry = new THREE.PlaneGeometry(4, WALL_TITLE_HEIGHT);
    const wallTitleMesh = new THREE.Mesh(wallTitleGeometry, placeholderMaterial.clone());
    wallTitleMesh.rotation.set(...rotation);
    const wallTitleYOffset = wallHeight / 2 - WALL_TITLE_HEIGHT / 2 - 0.1; // Position near the top of the wall
    const wallTitlePosition = basePosition.clone()
        .addScaledVector(upVector, wallTitleYOffset)
        .addScaledVector(forwardVector, TEXT_DEPTH_OFFSET);
    wallTitleMesh.position.copy(wallTitlePosition);
    scene.add(wallTitleMesh);
    
    // Initial Wall Title Content
    if (wallTitleMesh.material instanceof THREE.MeshBasicMaterial && wallTitleMesh.material.map) {
        wallTitleMesh.material.map.dispose();
    }
    const { texture: wallTitleTexture } = createTextTexture(collectionName, 4, WALL_TITLE_HEIGHT, 100, 'white', { wordWrap: false });
    (wallTitleMesh.material as THREE.MeshBasicMaterial).map = wallTitleTexture;


    // 8. Create Navigation Arrows
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15); arrowShape.lineTo(0.3, 0); arrowShape.lineTo(0, -0.15); arrowShape.lineTo(0, 0.15);
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: ARROW_COLOR_DEFAULT, side: THREE.DoubleSide });

    // Previous Arrow
    const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
    prevArrow.rotation.set(rotation[0], rotation[1] + Math.PI, rotation[2]);
    const prevPosition = basePosition.clone().addScaledVector(rightVector, -ARROW_PANEL_OFFSET).addScaledVector(forwardVector, ARROW_DEPTH_OFFSET);
    prevArrow.position.copy(prevPosition);
    scene.add(prevArrow);
    
    // Next Arrow
    const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
    nextArrow.rotation.set(...rotation);
    const nextPosition = basePosition.clone().addScaledVector(rightVector, ARROW_PANEL_OFFSET).addScaledVector(forwardVector, ARROW_DEPTH_OFFSET);
    nextArrow.position.copy(nextPosition);
    scene.add(nextArrow);

    return {
        mesh, wallName, metadataUrl: '', isVideo: false, prevArrow, nextArrow, titleMesh, descriptionMesh,
        attributesMesh, wallTitleMesh, currentDescription: '', descriptionScrollY: 0, descriptionTextHeight: 0, currentAttributes: [],
    };
}