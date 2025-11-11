import * as THREE from 'three';
import type { NftMetadata, NftAttribute } from '@/utils/nftFetcher';
import type { PanelConfig } from '@/config/galleryConfig';
import { GALLERY_PANEL_CONFIG } from '@/config/galleryConfig'; // <-- FIX 1: Import GALLERY_PANEL_CONFIG

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

  if (!attributes || attributes.length === 0) {
    context.fillText('No attributes found.', padding, y - scrollY);
    totalHeight = lineHeight;
  } else {
    attributes.forEach(attr => {
      if (attr.trait_type && attr.value) {
        const line = `${attr.trait_type}: ${attr.value}`;
        // Note: We are not implementing word wrap here, assuming attributes are short lines.
        context.fillText(line, padding, y - scrollY);
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
  wallName: keyof PanelConfig; // Added wallName here for easy lookup
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
  titleMesh: THREE.Mesh; // Collection Name
  nameMesh: THREE.Mesh; // NFT Name (metadata title)
  descriptionMesh: THREE.Mesh;
  attributesMesh: THREE.Mesh;
  currentDescription: string;
  descriptionTextHeight: number;
  descriptionScrollY: number;
  currentAttributes: NftAttribute[];
  attributesTextHeight: number; // New field for attributes height
  attributesScrollY: number; // New field for attributes scroll
  updateContent: (metadata: NftMetadata, textureLoader: (url: string, isVideo?: boolean) => THREE.Texture | THREE.VideoTexture) => void;
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
  private resourcesToDispose: any[] = [];

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
    this.group.add(wallMesh);
    this.resourcesToDispose.push(wallGeom, wallMat);

    const pd = this.options.panelDescriptors!;
    pd.forEach((desc) => {
      const panel = this.createPanel(desc);
      this.panels.push(panel);
      this.group.add(panel.mesh, panel.prevArrow, panel.nextArrow, panel.titleMesh, panel.nameMesh, panel.descriptionMesh, panel.attributesMesh);
      this.interactiveMeshes.push(panel.mesh, panel.prevArrow, panel.nextArrow, panel.descriptionMesh, panel.attributesMesh); // Added attributesMesh
    });

    this.createDownlights();

    const glowGeo = new THREE.BoxGeometry(width! * 0.98, 0.08, 0.02);
    const glowMat = new THREE.MeshBasicMaterial({ color: this.options.coveLightColor!, toneMapped: false });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, this.options.height! - 0.04, 0.01);
    this.group.add(glow);
    this.resourcesToDispose.push(glowGeo, glowMat);
  }

  private createPanel(desc: PanelDescriptor): PanelHandles {
    const { panelSize } = this.options;
    const panelCenterY = desc.offsetY ?? 1.8;

    const panelGeom = new THREE.PlaneGeometry(panelSize!.w, panelSize!.h);
    const panelMat = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(panelGeom, panelMat);
    mesh.position.set(desc.offsetX, panelCenterY, -0.01 + (desc.offsetZ || 0));

    // Attach wallName and panelId to meshes for easy raycasting lookup
    (mesh.userData as any).wallName = this.wallName;
    (mesh.userData as any).panelId = desc.id;
    mesh.name = 'nft-panel'; // Ensure the main panel is identifiable

    // Title Mesh (Collection Name)
    const titleGeom = new THREE.PlaneGeometry(panelSize!.w * 1.2, 0.6); // Increased height
    const placeholderTitleTex = createTextTexture('Loading...', panelSize!.w * 1.2, 0.6, 80).texture; // Increased font size
    const titleMat = new THREE.MeshBasicMaterial({ map: placeholderTitleTex, transparent: true });
    const titleMesh = new THREE.Mesh(titleGeom, titleMat);
    
    // Position title centered above the NFT panel
    const titleY = panelCenterY + (panelSize!.h / 2) + 0.6 / 2 + 0.1; // Adjusted position based on new height
    titleMesh.position.set(desc.offsetX, titleY, 0.02);

    // Name Mesh (NFT Name/Metadata Title)
    const nameGeom = new THREE.PlaneGeometry(panelSize!.w * 1.2, 0.6); // Increased height
    const placeholderNameTex = createTextTexture('NFT Name', panelSize!.w * 1.2, 0.6, 80).texture; // Increased font size
    const nameMat = new THREE.MeshBasicMaterial({ map: placeholderNameTex, transparent: true });
    const nameMesh = new THREE.Mesh(nameGeom, nameMat);

    // Position name centered below the NFT panel
    const nameY = panelCenterY - (panelSize!.h / 2) - 0.6 / 2 - 0.1; // Adjusted position based on new height
    nameMesh.position.set(desc.offsetX, nameY, 0.02);


    // Description Panel (Left)
    const descGeom = new THREE.PlaneGeometry(1.5, 1.8);
    const descPlace = createTextTexture('', 1.5, 1.8, 28);
    const descMat = new THREE.MeshBasicMaterial({ map: descPlace.texture, transparent: true });
    const descriptionMesh = new THREE.Mesh(descGeom, descMat);
    const textBlockOffsetX = -3;
    descriptionMesh.position.set(desc.offsetX + textBlockOffsetX, panelCenterY, 0.02);
    (descriptionMesh.userData as any).wallName = this.wallName;
    (descriptionMesh.userData as any).panelId = desc.id;
    descriptionMesh.name = 'description'; // Add name for easier identification

    // Attributes Panel (Right)
    const attrGeom = new THREE.PlaneGeometry(1.5, 1.8); // Increased height to 1.8
    const attrPlace = createAttributesTextTexture([], 1.5, 1.8, 60); // Updated font size to 60
    const attrMat = new THREE.MeshBasicMaterial({ map: attrPlace.texture, transparent: true });
    const attributesMesh = new THREE.Mesh(attrGeom, attrMat);
    const attrBlockOffsetX = 3;
    attributesMesh.position.set(desc.offsetX + attrBlockOffsetX, panelCenterY, 0.02); // Centered vertically
    (attributesMesh.userData as any).wallName = this.wallName;
    (attributesMesh.userData as any).panelId = desc.id;
    attributesMesh.name = 'attributes'; // Unique name for raycasting

    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15); arrowShape.lineTo(0.3, 0); arrowShape.lineTo(0, -0.15); arrowShape.lineTo(0, 0.15);
    const arrowGeom = new THREE.ShapeGeometry(arrowShape);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xcccccc });
    const prevArrow = new THREE.Mesh(arrowGeom, arrowMat.clone());
    prevArrow.rotation.z = Math.PI;
    prevArrow.position.set(desc.offsetX - 1.6, panelCenterY, 0.03);
    (prevArrow.userData as any).wallName = this.wallName;
    (prevArrow.userData as any).panelId = desc.id;
    (prevArrow.userData as any).direction = 'prev';

    const nextArrow = new THREE.Mesh(arrowGeom, arrowMat.clone());
    nextArrow.position.set(desc.offsetX + 1.6, panelCenterY, 0.03);
    (nextArrow.userData as any).wallName = this.wallName;
    (nextArrow.userData as any).panelId = desc.id;
    (nextArrow.userData as any).direction = 'next';

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
      updateContent: (metadata: NftMetadata, textureLoader) => {
        try {
          const imageUrl = metadata.image;
          const isVideo = !!imageUrl && /\.(mp4|webm|ogg)$/i.test(imageUrl);
          const tex = textureLoader(imageUrl, isVideo);
          if (mesh.material instanceof THREE.MeshBasicMaterial) {
            if (mesh.material.map) mesh.material.map.dispose();
            mesh.material.map = tex;
            mesh.material.needsUpdate = true;
          }

          // Update title (Collection Name only)
          const collectionName = GALLERY_PANEL_CONFIG[this.wallName]?.name || 'Unknown Collection';
          const titleText = collectionName;
          
          const titleTex = createTextTexture(titleText, panelSize!.w * 1.2, 0.6, 80).texture;
          (titleMesh.material as THREE.MeshBasicMaterial).map?.dispose();
          (titleMesh.material as THREE.MeshBasicMaterial).map = titleTex;

          // Update name (NFT Name/Metadata Title)
          const nftNameText = metadata.title;
          const nameTex = createTextTexture(nftNameText, panelSize!.w * 1.2, 0.6, 80).texture;
          (nameMesh.material as THREE.MeshBasicMaterial).map?.dispose();
          (nameMesh.material as THREE.MeshBasicMaterial).map = nameTex;


          // Update Description
          const descTexObj = createTextTexture(metadata.description || '', 1.5, 1.8, 28, 'lightgray', { wordWrap: true });
          (descriptionMesh.material as THREE.MeshBasicMaterial).map?.dispose();
          (descriptionMesh.material as THREE.MeshBasicMaterial).map = descTexObj.texture;

          panelHandle.currentDescription = metadata.description || '';
          panelHandle.descriptionTextHeight = descTexObj.totalHeight;
          panelHandle.descriptionScrollY = 0;

          // Update Attributes
          const attributes = metadata.attributes || [];
          panelHandle.currentAttributes = attributes;
          const attrTexObj = createAttributesTextTexture(attributes, 1.5, 1.8, 60, 'lightgray', { scrollY: 0 });
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

  public setPanelMetadataById(id: string, metadata: NftMetadata, textureLoader: (url: string, isVideo?: boolean) => THREE.Texture | THREE.VideoTexture) {
    const panel = this.panels.find(p => p.id === id);
    if (!panel) return;
    panel.updateContent(metadata, textureLoader);
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