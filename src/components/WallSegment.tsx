import * as THREE from 'three';
import type { NftMetadata, NftAttribute } from '@/utils/nftFetcher';
import type { PanelConfig } from '@/config/galleryConfig';
import { GALLERY_PANEL_CONFIG } from '@/config/galleryConfig';

// ----------------------
// Helpers (text textures)
// ----------------------
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
    const words = text ? text.split(' ') : [];
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

export const createAttributesTextTexture = (attributes: NftAttribute[], width: number, height: number, fontSize: number, color: string = 'white', options: { scrollY?: number } = {}): { texture: THREE.CanvasTexture, totalHeight: number } => {
  const { scrollY = 0 } = options;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return { texture: new THREE.CanvasTexture(document.createElement('canvas')), totalHeight: 0 };

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
  let totalHeight = 0;
  const maxTextWidth = canvas.width - 2 * padding;

  if (!attributes || attributes.length === 0) {
    context.fillText('No attributes found.', padding, y - scrollY);
    totalHeight = lineHeight;
  } else {
    attributes.forEach(attr => {
      if (attr.trait_type && attr.value) {
        const traitType = `${attr.trait_type}: `;
        const value = String(attr.value);
        
        context.font = `bold ${fontSize}px Arial`;
        context.fillText(traitType, padding, y - scrollY);
        
        const traitMetrics = context.measureText(traitType);
        let currentX = padding + traitMetrics.width;
        
        context.font = `${fontSize}px Arial`;
        
        const words = value.split(' ');
        let line = '';
        
        for (let n = 0; n < words.length; n++) {
          const word = words[n];
          const testLine = line + word + ' ';
          const metrics = context.measureText(testLine);
          const testWidth = metrics.width;
          
          if (currentX + testWidth > canvas.width - padding && n > 0) {
            context.fillText(line, currentX, y - scrollY);
            y += lineHeight;
            currentX = padding;
            line = word + ' ';
          } else {
            line = testLine;
          }
        }
        
        context.fillText(line, currentX, y - scrollY);
        y += lineHeight;
      }
    });
    totalHeight = y + lineHeight - padding;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return { texture, totalHeight };
};

// ----------------------
// Types
// ----------------------
export type PanelDescriptor = {
  id: string;
  offsetX: number;
  offsetY?: number;
  offsetZ?: number;
};

export type WallSegmentOptions = {
  wallName: keyof PanelConfig;
  width?: number;
  height?: number;
  panelDescriptors?: PanelDescriptor[];
  panelSize?: { w: number; h: number };
  baseColor?: number;
  coveLightColor?: number;
  downlightCount?: number;
};

export type PanelHandles = {
  id: string;
  mesh: THREE.Mesh;
  prevArrow: THREE.Mesh;
  nextArrow: THREE.Mesh;
  titleMesh: THREE.Mesh;
  nameMesh: THREE.Mesh;
  descriptionMesh: THREE.Mesh;
  attributesMesh: THREE.Mesh;
  currentDescription: string;
  descriptionTextHeight: number;
  descriptionScrollY: number;
  currentAttributes: NftAttribute[];
  attributesTextHeight: number;
  attributesScrollY: number;
  updateContent: (texture: THREE.Texture, metadata: NftMetadata) => void;
  dispose: () => void;
};

// ----------------------
// WallSegment class
// ----------------------
export class WallSegment {
  public group: THREE.Group;
  public panels: PanelHandles[] = [];
  public interactiveMeshes: THREE.Mesh[] = [];
  public wallName: keyof PanelConfig;
  private options: WallSegmentOptions;

  constructor(options: WallSegmentOptions) {
    this.options = {
      width: 10,
      height: 4,
      panelDescriptors: [{ id: 'main', offsetX: 0 }],
      panelSize: { w: 2, h: 2 },
      baseColor: 0x333333,
      coveLightColor: 0x87CEEB,
      downlightCount: 3,
      ...options,
    };
    this.wallName = options.wallName;
    this.group = new THREE.Group();
    this.buildBase();
  }

  private buildBase() {
    const { width, height, baseColor } = this.options;
    const wallGeom = new THREE.PlaneGeometry(width!, height!);
    const wallMat = new THREE.MeshStandardMaterial({ color: baseColor, side: THREE.FrontSide });
    const wallMesh = new THREE.Mesh(wallGeom, wallMat);
    wallMesh.position.set(0, height! / 2, 0);
    wallMesh.renderOrder = 0;
    this.group.add(wallMesh);

    this.options.panelDescriptors!.forEach((desc) => {
      const panel = this.createPanel(desc);
      this.panels.push(panel);
      this.group.add(panel.mesh, panel.prevArrow, panel.nextArrow, panel.titleMesh, panel.nameMesh, panel.descriptionMesh, panel.attributesMesh);
      this.interactiveMeshes.push(panel.mesh, panel.prevArrow, panel.nextArrow, panel.descriptionMesh, panel.attributesMesh);
    });

    this.createDownlights();

    const glowGeo = new THREE.BoxGeometry(width! * 0.98, 0.08, 0.02);
    const glowMat = new THREE.MeshBasicMaterial({ color: this.options.coveLightColor!, toneMapped: false });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, this.options.height! - 0.04, 0.01);
    this.group.add(glow);
  }

  private createPanel(desc: PanelDescriptor): PanelHandles {
    const { panelSize } = this.options;
    const panelCenterY = desc.offsetY ?? 1.8;
    
    const TEXT_PANEL_WIDTH = 2.25;
    const TEXT_PANEL_HEIGHT = 1.8;
    const TEXT_FONT_SIZE_DESC = 28;
    const TEXT_FONT_SIZE_ATTR = 30; 
    const TEXT_BLOCK_OFFSET_X_LEFT = -3.375; 
    const TEXT_BLOCK_OFFSET_X_RIGHT = 3.375; 

    const TITLE_NAME_WIDTH = panelSize!.w * 2.4; 
    const TITLE_NAME_HEIGHT = 0.6;
    const TITLE_NAME_FONT_SIZE = 120;

    const FRONT_OFFSET = 0.03; 

    const panelGeom = new THREE.PlaneGeometry(panelSize!.w, panelSize!.h);
    const panelMat = new THREE.MeshBasicMaterial({ 
      color: 0xffffff,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(panelGeom, panelMat);
    
    mesh.position.set(desc.offsetX, panelCenterY, FRONT_OFFSET + (desc.offsetZ || 0));
    mesh.renderOrder = 1; 

    (mesh.userData as any).wallName = this.wallName;
    (mesh.userData as any).panelId = desc.id;
    mesh.name = 'nft-panel';

    const titleGeom = new THREE.PlaneGeometry(TITLE_NAME_WIDTH, TITLE_NAME_HEIGHT); 
    const placeholderTitleTex = createTextTexture('Loading...', TITLE_NAME_WIDTH, TITLE_NAME_HEIGHT, TITLE_NAME_FONT_SIZE).texture; 
    const titleMat = new THREE.MeshBasicMaterial({ map: placeholderTitleTex, transparent: true });
    const titleMesh = new THREE.Mesh(titleGeom, titleMat);
    
    const titleY = panelCenterY + (panelSize!.h / 2) + TITLE_NAME_HEIGHT / 2 + 0.1; 
    titleMesh.position.set(desc.offsetX, titleY, FRONT_OFFSET + 0.01);
    titleMesh.renderOrder = 1;

    const nameGeom = new THREE.PlaneGeometry(TITLE_NAME_WIDTH, TITLE_NAME_HEIGHT); 
    const placeholderNameTex = createTextTexture('NFT Name', TITLE_NAME_WIDTH, TITLE_NAME_HEIGHT, TITLE_NAME_FONT_SIZE).texture; 
    const nameMat = new THREE.MeshBasicMaterial({ map: placeholderNameTex, transparent: true });
    const nameMesh = new THREE.Mesh(nameGeom, nameMat);

    const nameY = panelCenterY - (panelSize!.h / 2) - TITLE_NAME_HEIGHT / 2 - 0.1; 
    nameMesh.position.set(desc.offsetX, nameY, FRONT_OFFSET + 0.01);
    nameMesh.renderOrder = 1;

    const descGeom = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, TEXT_PANEL_HEIGHT);
    const descPlace = createTextTexture('', TEXT_PANEL_WIDTH, TEXT_PANEL_HEIGHT, TEXT_FONT_SIZE_DESC);
    const descMat = new THREE.MeshBasicMaterial({ map: descPlace.texture, transparent: true });
    const descriptionMesh = new THREE.Mesh(descGeom, descMat);
    descriptionMesh.position.set(desc.offsetX + TEXT_BLOCK_OFFSET_X_LEFT, panelCenterY, FRONT_OFFSET + 0.01);
    descriptionMesh.renderOrder = 1;
    (descriptionMesh.userData as any).wallName = this.wallName;
    (descriptionMesh.userData as any).panelId = desc.id;
    descriptionMesh.name = 'description';

    const attrGeom = new THREE.PlaneGeometry(TEXT_PANEL_WIDTH, TEXT_PANEL_HEIGHT);
    const attrPlace = createAttributesTextTexture([], TEXT_PANEL_WIDTH, TEXT_PANEL_HEIGHT, TEXT_FONT_SIZE_ATTR);
    const attrMat = new THREE.MeshBasicMaterial({ map: attrPlace.texture, transparent: true });
    const attributesMesh = new THREE.Mesh(attrGeom, attrMat);
    attributesMesh.position.set(desc.offsetX + TEXT_BLOCK_OFFSET_X_RIGHT, panelCenterY, FRONT_OFFSET + 0.01);
    attributesMesh.renderOrder = 1;
    (attributesMesh.userData as any).wallName = this.wallName;
    (attributesMesh.userData as any).panelId = desc.id;
    attributesMesh.name = 'attributes';

    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15); arrowShape.lineTo(0.3, 0); arrowShape.lineTo(0, -0.15); arrowShape.lineTo(0, 0.15);
    const arrowGeom = new THREE.ShapeGeometry(arrowShape);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xcccccc });
    const prevArrow = new THREE.Mesh(arrowGeom, arrowMat.clone());
    prevArrow.rotation.z = Math.PI;
    prevArrow.position.set(desc.offsetX - 1.6, panelCenterY, FRONT_OFFSET + 0.02);
    (prevArrow.userData as any).wallName = this.wallName;
    (prevArrow.userData as any).panelId = desc.id;
    (prevArrow.userData as any).direction = 'prev';
    prevArrow.renderOrder = 2;

    const nextArrow = new THREE.Mesh(arrowGeom, arrowMat.clone());
    nextArrow.position.set(desc.offsetX + 1.6, panelCenterY, FRONT_OFFSET + 0.02);
    (nextArrow.userData as any).wallName = this.wallName;
    (nextArrow.userData as any).panelId = desc.id;
    (nextArrow.userData as any).direction = 'next';
    nextArrow.renderOrder = 2;

    const panelHandle: PanelHandles = {
      id: desc.id,
      mesh,
      prevArrow,
      nextArrow,
      titleMesh,
      nameMesh,
      descriptionMesh,
      attributesMesh,
      currentDescription: '',
      descriptionTextHeight: 0,
      descriptionScrollY: 0,
      currentAttributes: [],
      attributesTextHeight: 0,
      attributesScrollY: 0,
      updateContent: (texture: THREE.Texture, metadata: NftMetadata) => {
        try {
          if (mesh.material instanceof THREE.MeshBasicMaterial) {
            if (mesh.material.map) mesh.material.map.dispose();
            mesh.material.map = texture;
            mesh.material.color.setHex(0xffffff);
            mesh.material.needsUpdate = true;
          }

          const collectionName = GALLERY_PANEL_CONFIG[this.wallName]?.name || 'Unknown Collection';
          const titleTex = createTextTexture(collectionName, TITLE_NAME_WIDTH, TITLE_NAME_HEIGHT, TITLE_NAME_FONT_SIZE).texture; 
          (titleMesh.material as THREE.MeshBasicMaterial).map?.dispose();
          (titleMesh.material as THREE.MeshBasicMaterial).map = titleTex;

          const nameTex = createTextTexture(metadata.title, TITLE_NAME_WIDTH, TITLE_NAME_HEIGHT, TITLE_NAME_FONT_SIZE).texture; 
          (nameMesh.material as THREE.MeshBasicMaterial).map?.dispose();
          (nameMesh.material as THREE.MeshBasicMaterial).map = nameTex;

          const descTexObj = createTextTexture(metadata.description || '', TEXT_PANEL_WIDTH, TEXT_PANEL_HEIGHT, TEXT_FONT_SIZE_DESC, 'lightgray', { wordWrap: true });
          (descriptionMesh.material as THREE.MeshBasicMaterial).map?.dispose();
          (descriptionMesh.material as THREE.MeshBasicMaterial).map = descTexObj.texture;
          panelHandle.currentDescription = metadata.description || '';
          panelHandle.descriptionTextHeight = descTexObj.totalHeight;
          panelHandle.descriptionScrollY = 0;

          const attributes = metadata.attributes || [];
          panelHandle.currentAttributes = attributes;
          const attrTexObj = createAttributesTextTexture(attributes, TEXT_PANEL_WIDTH, TEXT_PANEL_HEIGHT, TEXT_FONT_SIZE_ATTR, 'lightgray', { scrollY: 0 });
          (attributesMesh.material as THREE.MeshBasicMaterial).map?.dispose();
          (attributesMesh.material as THREE.MeshBasicMaterial).map = attrTexObj.texture;
          panelHandle.attributesTextHeight = attrTexObj.totalHeight;
          panelHandle.attributesScrollY = 0;

        } catch (err) {
          console.error('WallSegment panel update error', err);
        }
      },
      dispose: () => {
        [panelGeom, panelMat, titleGeom, titleMat, nameGeom, nameMat, descGeom, descMat, attrGeom, attrMat, arrowGeom, arrowMat].forEach((r:any) => {
          try { if (r && typeof r.dispose === 'function') r.dispose(); } catch(e){ }
        });
      }
    };

    return panelHandle;
  }

  private createDownlights() {
    const count = this.options.downlightCount!;
    for (let i = 0; i < count; i++) {
      const pl = new THREE.PointLight(0xffffff, 0.6, 6);
      const x = THREE.MathUtils.lerp(-this.options.width!/2 + 0.5, this.options.width!/2 - 0.5, i / Math.max(1, count-1));
      pl.position.set(x, this.options.height! - 0.3, 0.2);
      this.group.add(pl);
    }
  }

  public setPanelContent(id: string, texture: THREE.Texture, metadata: NftMetadata) {
    const panel = this.panels.find(p => p.id === id);
    if (!panel) return;
    panel.updateContent(texture, metadata);
  }

  public dispose() {
    this.panels.forEach(p => p.dispose());
    this.group.traverse(obj => {
      if (obj instanceof THREE.Mesh) { 
        obj.geometry.dispose?.();
        const m = obj.material;
        if (m) {
          if (Array.isArray(m)) m.forEach(mi => { mi.map?.dispose?.(); mi.dispose?.(); });
          else { if ((m as THREE.Material & { map?: THREE.Texture }).map) (m as THREE.Material & { map?: THREE.Texture }).map.dispose(); m.dispose(); }
        }
      }
    });
  }
}