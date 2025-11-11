import * as THREE from 'three';
import { PanelConfig } from '@/config/galleryConfig';
import { NftAttribute } from '@/utils/nftFetcher';

/**
 * Defines the structure for a panel object, holding references to all its 3D meshes and state.
 */
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

/**
 * Configuration for creating a new wall.
 */
export interface WallCreationConfig {
    wallName: keyof PanelConfig;
    size: { width: number; height: number };
    position: THREE.Vector3;
    rotation: THREE.Euler;
}

/**
 * Creates a text texture using a 2D canvas.
 */
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

/**
 * Creates a texture for displaying NFT attributes.
 */
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

/**
 * Factory function to create a complete wall unit with panel, text, arrows, and lighting.
 */
export function createWallWithPanel(scene: THREE.Scene, config: WallCreationConfig) {
    const { wallName, size, position, rotation } = config;

    // Wall Plane
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });
    const wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(size.width, size.height), wallMaterial);
    wallMesh.position.copy(position);
    wallMesh.rotation.copy(rotation);
    scene.add(wallMesh);

    // Cove Lighting
    const coveLightColor = 0x87CEEB;
    const coveLightIntensity = 10;
    const coveLightWidth = size.width;
    const coveLightHeight = 0.1;
    const rectLight = new THREE.RectAreaLight(coveLightColor, coveLightIntensity, coveLightWidth, coveLightHeight);
    const glowGeo = new THREE.BoxGeometry(coveLightWidth, coveLightHeight, 0.02);
    const glowMat = new THREE.MeshBasicMaterial({ color: coveLightColor, toneMapped: false });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    const yPos = size.height - 0.1;
    const offset = 0.1;
    const lightPosition = position.clone();
    lightPosition.y = yPos;
    const forward = new THREE.Vector3(0, 0, 1).applyEuler(rotation);
    let lightRotationEuler: THREE.Euler;

    if (Math.abs(forward.z) > 0.9) { // North or South wall
        lightPosition.z += offset * Math.sign(forward.z);
        lightRotationEuler = new THREE.Euler(Math.PI / 2 * -Math.sign(forward.z), 0, 0);
    } else { // East or West wall
        lightPosition.x += offset * -Math.sign(forward.x);
        lightRotationEuler = new THREE.Euler(-Math.PI / 2, -Math.PI / 2 * Math.sign(forward.x), 0, 'YXZ');
    }
    rectLight.position.copy(lightPosition);
    rectLight.rotation.copy(lightRotationEuler);
    glowMesh.position.copy(lightPosition);
    glowMesh.rotation.copy(lightRotationEuler);
    scene.add(rectLight);
    scene.add(glowMesh);

    // NFT Panel and Arrows
    const panelYPosition = 1.8;
    const panelDepthOffset = 0.02;
    const panelGeometry = new THREE.PlaneGeometry(2, 2);
    const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
    const panelPositionVec = position.clone();
    panelPositionVec.y = panelYPosition;
    panelPositionVec.addScaledVector(forward, -panelDepthOffset);
    const panelMesh = new THREE.Mesh(panelGeometry, panelMaterial.clone());
    panelMesh.position.copy(panelPositionVec);
    panelMesh.rotation.copy(rotation);
    scene.add(panelMesh);

    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15); arrowShape.lineTo(0.3, 0); arrowShape.lineTo(0, -0.15); arrowShape.lineTo(0, 0.15);
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
    const ARROW_PANEL_OFFSET = 1.5;
    const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(rotation);
    
    const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
    const prevRotation = rotation.clone();
    prevRotation.y += Math.PI;
    prevArrow.rotation.copy(prevRotation);
    prevArrow.position.copy(panelPositionVec.clone().addScaledVector(rightVector, -ARROW_PANEL_OFFSET));
    scene.add(prevArrow);

    const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
    nextArrow.rotation.copy(rotation);
    nextArrow.position.copy(panelPositionVec.clone().addScaledVector(rightVector, ARROW_PANEL_OFFSET));
    scene.add(nextArrow);

    // Text Panels
    const TEXT_DEPTH_OFFSET = 0.03;
    const TEXT_PANEL_WIDTH = 1.5, TITLE_HEIGHT = 0.5, DESCRIPTION_HEIGHT = 1.5, TEXT_BLOCK_OFFSET_X = 3;
    const TITLE_PANEL_WIDTH = 2.0;
    const { texture: placeholderTexture } = createTextTexture('Loading...', TEXT_PANEL_WIDTH, TITLE_HEIGHT + DESCRIPTION_HEIGHT, 30, 'white', { wordWrap: false });
    const placeholderMaterial = new THREE.MeshBasicMaterial({ map: placeholderTexture, transparent: true, side: THREE.DoubleSide, alphaTest: 0.01, depthWrite: false });
    const upVector = new THREE.Vector3(0, 1, 0).applyEuler(rotation);

    const titleMesh = new THREE.Mesh(new THREE.PlaneGeometry(TITLE_PANEL_WIDTH, TITLE_HEIGHT), placeholderMaterial.clone());
    titleMesh.rotation.copy(rotation);
    const titleYOffset = -1 - (TITLE_HEIGHT / 2) - 0.1;
    titleMesh.position.copy(panelPositionVec.clone().addScaledVector(upVector, titleYOffset).addScaledVector(forward, TEXT_DEPTH_OFFSET));
    scene.add(titleMesh);

    const descriptionMesh = new THREE.Mesh(new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, TITLE_HEIGHT + DESCRIPTION_HEIGHT), placeholderMaterial.clone());
    descriptionMesh.rotation.copy(rotation);
    const textGroupPosition = panelPositionVec.clone().addScaledVector(rightVector, -TEXT_BLOCK_OFFSET_X);
    descriptionMesh.position.copy(textGroupPosition.clone().addScaledVector(forward, TEXT_DEPTH_OFFSET));
    scene.add(descriptionMesh);

    const attributesMesh = new THREE.Mesh(new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, 1.5), placeholderMaterial.clone());
    attributesMesh.rotation.copy(rotation);
    const collectionInfoGroupPosition = panelPositionVec.clone().addScaledVector(rightVector, 3);
    attributesMesh.position.copy(collectionInfoGroupPosition.clone().addScaledVector(forward, TEXT_DEPTH_OFFSET));
    scene.add(attributesMesh);

    const wallTitleMesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.75), placeholderMaterial.clone());
    wallTitleMesh.rotation.copy(rotation);
    const wallTitlePosition = panelPositionVec.clone();
    wallTitlePosition.y = 3.2;
    wallTitleMesh.position.copy(wallTitlePosition);
    scene.add(wallTitleMesh);

    const panel: Panel = {
        mesh: panelMesh, wallName, metadataUrl: '', isVideo: false, prevArrow, nextArrow, titleMesh, descriptionMesh,
        attributesMesh, wallTitleMesh, currentDescription: '', descriptionScrollY: 0, descriptionTextHeight: 0, currentAttributes: [],
    };

    const interactiveMeshes = [panel.mesh, panel.prevArrow, panel.nextArrow, panel.descriptionMesh];

    return { panel, interactiveMeshes };
}