import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import {
  initializeGalleryConfig,
  GALLERY_PANEL_CONFIG,
  getCurrentNftSource,
  updatePanelIndex,
  PanelConfig,
} from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';
import { createGifTexture } from '@/utils/gifTexture';
import { MarketBrowserRefined } from '@/components/MarketBrowserRefined';

// Initialize RectAreaLightUniformsLib immediately upon module load
RectAreaLightUniformsLib.init();

// Constants for geometry
const PANEL_WIDTH = 6;
const PANEL_HEIGHT = 6;

// Define types for the panel objects
interface Panel {
  mesh: THREE.Mesh;
  wallName: keyof PanelConfig;
  metadataUrl: string;
  isVideo: boolean;
  isGif: boolean;
  prevArrow: THREE.Mesh;
  nextArrow: THREE.Mesh;
  videoElement: HTMLVideoElement | null;
  gifStopFunction: (() => void) | null;
}

interface NftGalleryProps {
  setInstructionsVisible: (visible: boolean) => void;
}

// Global state for UI interaction
let currentTargetedPanel: Panel | null = null;
let currentTargetedArrow: THREE.Mesh | null = null;
let currentTargetedButton: THREE.Mesh | null = null;

// --- GLSL Shader Code for Starry Night Ceiling ---
const ceilingVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ceilingFragmentShader = `
  varying vec2 vUv;
  uniform float time;

  float rand(vec2 co) {
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
  }

  float noise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = rand(i);
    float b = rand(i + vec2(1.0, 0.0));
    float c = rand(i + vec2(0.0, 1.0));
    float d = rand(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) +
           (c - a)* u.y * (1.0 - u.x) +
           (d - b) * u.x * u.y;
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;

    // Base vertical gradient sky
    float height = uv.y * 0.6 + 0.5;
    vec3 topColor = vec3(0.02, 0.03, 0.08);
    vec3 bottomColor = vec3(0.01, 0.01, 0.04);
    vec3 skyColor = mix(bottomColor, topColor, height);

    // Soft moving clouds
    float t = time * 0.03;
    float n1 = noise(uv * 3.0 + vec2(t, 0.0));
    float n2 = noise(uv * 6.0 - vec2(0.0, t * 0.7));
    float clouds = smoothstep(0.4, 0.9, n1 + n2 * 0.5);
    vec3 cloudColor = vec3(0.06, 0.08, 0.18);
    skyColor = mix(skyColor, cloudColor, clouds * 0.7);

    // --- Star field: fewer, larger, clustered stars (no grid) ---

    // Large-scale mask so some areas have more stars, some almost none
    float starMask = noise(vUv * 4.0 + vec2(time * 0.02, -time * 0.015));
    starMask = smoothstep(0.3, 0.8, starMask); // kill stars in dark zones

    float starField = 0.0;

    // Base scattered tiny stars
    float r1 = rand(vUv * 90.0 + time * 0.03);
    float tiny = pow(r1, 28.0);        // lower exponent = a bit more stars than before
    starField += tiny * 0.7;

    // Some brighter & bigger stars using another random sample
    float r2 = rand(vUv * 55.0 - time * 0.02);
    float big = pow(r2, 9.0);          // noticeably larger & rarer
    starField += big * 2.0;

    // Slight “halo” by sampling a nearby offset
    float r3 = rand((vUv + 0.01) * 55.0 + time * 0.01);
    float halo = pow(r3, 14.0) * 0.5;
    starField += halo;

    // Apply star clustering mask
    starField *= starMask;

    // Gentle twinkle
    float twinkle = 0.7 + 0.3 * sin(time * 0.8 + r2 * 18.0);
    starField *= twinkle;

    vec3 starColor = vec3(0.8, 0.93, 1.0);
    vec3 color = skyColor + starField * starColor;

    // Vignette
    float vignette = smoothstep(1.35, 0.2, length(uv));
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// --- GLSL Shader Code for Rainbow Under-Platform Plane ---
const rainbowVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const rainbowFragmentShader = `
  varying vec2 vUv;
  uniform float time;

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    float hue = fract(time * 0.08 + vUv.x * 0.5 + vUv.y * 0.5);
    float sat = 0.9;
    float val = 0.9;

    vec3 color = hsv2rgb(vec3(hue, sat, val));

    vec2 uv = vUv * 2.0 - 1.0;
    float vignette = smoothstep(1.4, 0.2, length(uv));
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Helpers for media
const isVideoContent = (contentType: string, url: string) =>
  !!(contentType.startsWith('video/') || url.match(/\.(mp4|webm|ogg)(\?|$)/i));

const isGifContent = (contentType: string, url: string) =>
  !!(contentType === 'image/gif' || url.match(/\.gif(\?|$)/i));

const disposeTextureSafely = (mesh: THREE.Mesh) => {
  const material = mesh.material;
  if (material instanceof THREE.MeshBasicMaterial) {
    const mat = material as THREE.MeshBasicMaterial & { map: THREE.Texture | null };
    if (mat.map) {
      mat.map.dispose();
      mat.map = null;
    }
    mat.dispose();
  }
};

const NftGallery: React.FC<NftGalleryProps> = ({ setInstructionsVisible }) => {
  // ...rest of the file unchanged from the last working version...
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const wallMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const [isLocked, setIsLocked] = useState(false);
  const [marketBrowserState, setMarketBrowserState] = useState<{
    open: boolean;
    collection?: string;
    tokenId?: string | number;
  }>({ open: false });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);

  const isTeleportingRef = useRef(false);
  const fadeStartTimeRef = useRef(0);
  const FADE_DURATION = 0.5;

  const ceilingMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const rainbowMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  // (keep all existing logic below exactly as in the previous version)
  // ...
};

export default NftGallery;