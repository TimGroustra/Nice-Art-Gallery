import * as THREE from 'three';
import { PanelConfig } from '@/config/galleryConfig';
import { NftAttribute } from '@/utils/nftFetcher';

export interface Panel {
  mesh: THREE.Mesh;
  wallName: keyof PanelConfig;
  metadataUrl: string;
  isVideo: boolean;
  isGif: boolean;
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
  videoElement: HTMLVideoElement | null;
  gifStopFunction: (() => void) | null;
}

export interface GalleryState {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: any; // PointerLockControls is not easily typed here
    panels: Panel[];
    wallMeshes: Map<string, THREE.Mesh>;
    stars1: THREE.Points;
    stars2: THREE.Points;
    raycaster: THREE.Raycaster;
    currentTargetedPanel: Panel | null;
    currentTargetedArrow: THREE.Mesh | null;
    currentTargetedDescriptionPanel: Panel | null;
    moveState: {
        forward: boolean;
        backward: boolean;
        left: boolean;
        right: boolean;
    };
    velocity: THREE.Vector3;
    direction: THREE.Vector3;
}