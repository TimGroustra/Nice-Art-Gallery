"use client";

import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { RectAreaLightUniformsLib, GLTFLoader } from 'three-stdlib';
import {
  initializeGalleryConfig,
  GALLERY_PANEL_CONFIG,
  getCurrentNftSource,
  updatePanelIndex,
  PanelConfig,
} from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource } from '@/utils/nftFetcher';
import { createGifTexture } from '@/utils/gifTexture';
import { MarketBrowserRefined } from '@/components/MarketBrowserRefined';
import { Footprints } from 'lucide-react';
import { fetchGalleryFurniture, FurnitureItem } from '@/utils/furnitureFetcher';

RectAreaLightUniformsLib.init();

// Constants for geometry
const PANEL_WIDTH = 6;
const PANEL_HEIGHT = 6;
const ROOM_SEGMENT_SIZE = 10;
const NUM_SEGMENTS = 5;
const ROOM_SIZE = ROOM_SEGMENT_SIZE * NUM_SEGMENTS;
const WALL_HEIGHT = 16;
const LOWER_WALL_HEIGHT = 8;
const LOWER_PANEL_Y = 5.0;
const INNER_LOWER_PANEL_Y = 4.0;
const UPPER_PANEL_Y = 12.0;
const WALL_THICKNESS = 0.5;
const BOUNDARY = ROOM_SIZE / 2 - 1.0; 

const PLATFORM_Y = LOWER_WALL_HEIGHT + WALL_THICKNESS / 2 + 0.01; // 8.26

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
    vec3 color = hsv2rgb(vec3(hue, 0.9, 0.9));
    vec2 uv = vUv * 2.0 - 1.0;
    float vignette = smoothstep(1.4, 0.2, length(uv));
    gl_FragColor = vec4(color * vignette, 1.0);
  }
`;

const isVideoContent = (contentType: string, url: string) =>
  !!(contentType.startsWith('video/') || url.match(/\.(mp4|webm|ogg)(\?|$)/i));

const isGifContent = (contentType: string, url: string) =>
  !!(contentType === 'image/gif' || url.match(/\.gif(\?|$)/i));

const disposeTextureSafely = (mesh: THREE.Mesh, isContextLost = false) => {
  const material = mesh.material;
  if (material instanceof THREE.MeshBasicMaterial) {
    const mat = material as THREE.MeshBasicMaterial & { map: THREE.Texture | null };
    if (!isContextLost && mat.map) {
      mat.map.dispose();
    }
    mat.map = null;
    if (!isContextLost) {
      mat.dispose();
    }
  }
};

const NftGalleryMobile: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const teleportButtonsRef = useRef<THREE.Mesh[]>([]);
  const fadeMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const fadeScreenRef = useRef<THREE.Mesh | null>(null);
  const rainbowMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  
  const [isStarted, setIsStarted] = useState(false);
  const [isWalking, setIsWalking] = useState(false);
  const [marketBrowserState, setMarketBrowserState] = useState<{
    open: boolean;
    collection?: string;
    tokenId?: string | number;
  }>({ open: false });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

  const isTeleportingRef = useRef(false);
  const fadeStartTimeRef = useRef(0);
  const FADE_DURATION = 0.5;

  const rotationRef = useRef({ yaw: 0, pitch: 0 });
  const touchStartRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const isWalkingRef = useRef(false);

  useEffect(() => {
    isWalkingRef.current = isWalking;
  }, [isWalking]);

  const loadTexture = useCallback(async (url: string, panel: Panel, contentType: string): Promise<THREE.Texture | THREE.VideoTexture> => {
    const isVideo = isVideoContent(contentType, url);
    const isGif = isGifContent(contentType, url);

    if (panel.videoElement) {
      panel.videoElement.pause();
      panel.videoElement.src = '';
      panel.videoElement = null;
    }
    if (panel.gifStopFunction) {
      panel.gifStopFunction();
      panel.gifStopFunction = null;
    }

    if (isGif) {
      const { texture, stop } = await createGifTexture(url);
      panel.gifStopFunction = stop;
      return texture;
    }
    if (isVideo) {
      const videoEl = document.createElement('video');
      videoEl.playsInline = true; videoEl.autoplay = true; videoEl.loop = true; videoEl.muted = true;
      videoEl.crossOrigin = 'anonymous'; videoEl.src = url;
      panel.videoElement = videoEl;
      return new THREE.VideoTexture(videoEl);
    }
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, resolve, undefined, reject);
    });
  }, []);

  const updatePanelContent = useCallback(async (panel: Panel, source: NftSource | null, isContextLost = false) => {
    disposeTextureSafely(panel.mesh, isContextLost);
    panel.mesh.material = new THREE.MeshBasicMaterial({ color: 0x222222 });
    panel.metadataUrl = '';
    
    if (!source || source.contractAddress === '') return;

    try {
      const metadata = await getCachedNftMetadata(source.contractAddress, source.tokenId);
      if (!metadata) return;

      const texture = await loadTexture(metadata.contentUrl, panel, metadata.contentType || '');
      disposeTextureSafely(panel.mesh, isContextLost);
      panel.mesh.material = new THREE.MeshBasicMaterial({ map: texture });
      panel.metadataUrl = metadata.source;
      panel.isVideo = isVideoContent(metadata.contentType || '', metadata.contentUrl);
      panel.isGif = isGifContent(metadata.contentType || '', metadata.contentUrl);
      
      const config = GALLERY_PANEL_CONFIG[panel.wallName];
      const showArrows = config && config.tokenIds.length > 1;
      panel.prevArrow.visible = showArrows;
      panel.nextArrow.visible = showArrows;
    } catch (e) {
      console.error(e);
    }
  }, [loadTexture]);

  const performTeleport = (targetY: number) => {
    if (isTeleportingRef.current) return;
    isTeleportingRef.current = true;
    fadeStartTimeRef.current = performance.now();
    setTimeout(() => { if (cameraRef.current) cameraRef.current.position.y = targetY; }, FADE_DURATION * 1000);
  };

  const checkCollision = useCallback((pos: THREE.Vector3) => {
    if (Math.abs(pos.x) > BOUNDARY || Math.abs(pos.z) > BOUNDARY) return true;
    if (pos.y < 5) {
      const p = 0.8; const wt = 0.25 + p; const whl = 5.0 + p;
      const cp = [-10, 10]; const ib = 5.0;
      for (const c of cp) {
        if (Math.abs(pos.z - (-ib)) < wt && Math.abs(pos.x - c) < whl) return true;
        if (Math.abs(pos.z - ib) < wt && Math.abs(pos.x - c) < whl) return true;
        if (Math.abs(pos.x - ib) < wt && Math.abs(pos.z - c) < whl) return true;
        if (Math.abs(pos.x - (-ib)) < wt && Math.abs(pos.z - c) < whl) return true;
      }
    }
    return false;
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene(); sceneRef.current = scene;
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    cameraRef.current = camera; camera.position.set(0, 1.6, 20); camera.rotation.order = 'YXZ';

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: "high-performance",
      stencil: false,
      depth: true
    });
    rendererRef.current = renderer;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x404050, 1.0));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemiLight.position.set(0, WALL_HEIGHT, 0); scene.add(hemiLight);

    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8, metalness: 0.1 });
    const halfRoomSize = ROOM_SIZE / 2;
    const outerWallGeometry = new THREE.BoxGeometry(ROOM_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
    ['north', 'south', 'east', 'west'].forEach((dir) => {
      const wall = new THREE.Mesh(outerWallGeometry, wallMaterial.clone());
      if (dir === 'north') wall.position.set(0, WALL_HEIGHT / 2, -halfRoomSize);
      if (dir === 'south') wall.position.set(0, WALL_HEIGHT / 2, halfRoomSize);
      if (dir === 'east') { wall.rotation.y = Math.PI / 2; wall.position.set(halfRoomSize, WALL_HEIGHT / 2, 0); }
      if (dir === 'west') { wall.rotation.y = Math.PI / 2; wall.position.set(-halfRoomSize, WALL_HEIGHT / 2, 0); }
      scene.add(wall);
    });

    const crossWallGeometry = new THREE.BoxGeometry(ROOM_SEGMENT_SIZE, LOWER_WALL_HEIGHT, WALL_THICKNESS);
    const cp = [-10, 10];
    cp.forEach((sc) => {
      const walls = [ {p:[sc, 4, -5], r:0}, {p:[sc, 4, 5], r:0}, {p:[-5, 4, sc], r:Math.PI/2}, {p:[5, 4, sc], r:Math.PI/2} ];
      walls.forEach(w => { const m = new THREE.Mesh(crossWallGeometry, wallMaterial.clone()); m.position.set(w.p[0], w.p[1], w.p[2]); m.rotation.y = w.r; scene.add(m); });
    });

    const rainbowMaterial = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 } }, vertexShader: rainbowVertexShader, fragmentShader: rainbowFragmentShader, side: THREE.DoubleSide });
    rainbowMaterialRef.current = rainbowMaterial;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2, metalness: 0.1 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), rainbowMaterial);
    ceiling.rotation.x = Math.PI / 2; ceiling.position.y = WALL_HEIGHT; scene.add(ceiling);

    const PLATFORM_Y_CALC = LOWER_WALL_HEIGHT + WALL_THICKNESS / 2 + 0.01;
    const platform = new THREE.Mesh(new THREE.BoxGeometry(30, WALL_THICKNESS, 30), wallMaterial.clone());
    platform.position.set(0, PLATFORM_Y_CALC, 0); scene.add(platform);
    const up = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), rainbowMaterial);
    up.rotation.x = -Math.PI / 2; up.position.y = LOWER_WALL_HEIGHT; scene.add(up);

    const buttonGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.2, 32);
    const buttonMat = new THREE.MeshStandardMaterial({ color: 0x1a3f7c, emissive: 0x1a3f7c, emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.9 });
    const gBtn = new THREE.Mesh(buttonGeo, buttonMat.clone()); gBtn.position.set(0, 0.2, 0); gBtn.userData = { isTeleportButton: true, targetY: PLATFORM_Y_CALC + 1.6 + WALL_THICKNESS / 2 }; scene.add(gBtn);
    const uBtn = new THREE.Mesh(buttonGeo, buttonMat.clone()); uBtn.position.set(0, PLATFORM_Y_CALC + WALL_THICKNESS / 2 + 0.1, 0); uBtn.userData = { isTeleportButton: true, targetY: 1.6 }; scene.add(uBtn);
    teleportButtonsRef.current = [gBtn, uBtn];

    const loadFurniture = async () => {
      const items = await fetchGalleryFurniture();
      const gltfLoader = new GLTFLoader();
      for (const item of items) {
        if (!item.model_url || (!item.model_url.endsWith('.glb') && !item.model_url.endsWith('.gltf'))) continue;
        gltfLoader.load(item.model_url, (gltf) => {
          let m: THREE.Object3D | null = null;
          if (item.name_filter) gltf.scene.traverse(c => { if (c.name.toLowerCase().includes(item.name_filter!.toLowerCase())) m = c; });
          if (!m) m = gltf.scene;
          if (m) {
            const b = new THREE.Box3().setFromObject(m); const s = new THREE.Vector3(); b.getSize(s);
            const max = Math.max(s.x, s.z); let sc = item.scale_multiplier; if (item.target_width > 0 && max > 0) sc = item.target_width / max;
            m.scale.set(sc, sc * item.scale_y_multiplier, sc);
            const ab = new THREE.Box3().setFromObject(m); const fh = item.floor_level === 'first' ? PLATFORM_Y + WALL_THICKNESS/2 : 0;
            m.position.set(item.position_x, fh + item.position_y - ab.min.y, item.position_z); m.rotation.y = item.rotation_y; scene.add(m);
          }
        }, undefined, () => {});
      }
    };
    loadFurniture();

    let stopLoad = false;
    
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn('[Gallery Mobile] WebGL Context Lost.');
      stopLoad = true;
      panelsRef.current.forEach(p => { p.videoElement?.pause(); p.gifStopFunction?.(); });
    };

    const handleContextRestored = async () => {
      console.log('[Gallery Mobile] WebGL Context Restored. Resuming session.');
      if (rainbowMaterialRef.current) rainbowMaterialRef.current.uniforms.time.value = 0.0;
      const panelsToUpdate = [...panelsRef.current]; 
      for (const p of panelsToUpdate) {
        await updatePanelContent(p, getCurrentNftSource(p.wallName), true);
      }
      stopLoad = false;
      animate();
    };

    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored, false);

    const createPanels = async () => {
      await initializeGalleryConfig();
      const pGeo = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
      const aShape = new THREE.Shape(); aShape.moveTo(0, 0.15); aShape.lineTo(0.3, 0); aShape.lineTo(0, -0.15);
      const aGeo = new THREE.ShapeGeometry(aShape);
      const ADO = 0.15 + WALL_THICKNESS / 2; const APO = 3.2;

      for (let i = 0; i <= 4; i++) {
        ['north-wall', 'south-wall', 'east-wall', 'west-wall'].forEach((base) => {
          const sc = (i - 2) * ROOM_SEGMENT_SIZE;
          [{ y: LOWER_PANEL_Y, s: '-ground' }, { y: UPPER_PANEL_Y, s: '-first' }].forEach(tier => {
            const key = `${base}-${i}${tier.s}` as keyof PanelConfig;
            let x = 0, z = 0, r = 0, dx = 0, dz = 0;
            if (base === 'north-wall') { x = sc; z = -halfRoomSize; r = 0; dz = ADO; }
            if (base === 'south-wall') { x = sc; z = halfRoomSize; r = Math.PI; dz = -ADO; }
            if (base === 'east-wall') { x = halfRoomSize; z = sc; r = -Math.PI / 2; dx = -ADO; }
            if (base === 'west-wall') { x = -halfRoomSize; z = sc; r = Math.PI / 2; dx = ADO; }
            const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide }));
            m.position.set(x + dx, tier.y, z + dz); m.rotation.y = r; scene.add(m);
            const rv = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, r, 0));
            const pa = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide })); pa.rotation.y = r + Math.PI; pa.position.copy(m.position).addScaledVector(rv, -APO); scene.add(pa);
            const na = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide })); na.rotation.y = r; na.position.copy(m.position).addScaledVector(rv, APO); scene.add(na);
            const p: Panel = { mesh: m, wallName: key, metadataUrl: '', isVideo: false, isGif: false, prevArrow: pa, nextArrow: na, videoElement: null, gifStopFunction: null };
            panelsRef.current.push(p);
          });
        });
      }

      cp.forEach((sc, idx) => {
        const cfgs = [ { k: `north-inner-wall-outer-${idx}`, p: [sc, 4, -5 - ADO], r: Math.PI }, { k: `north-inner-wall-inner-${idx}`, p: [sc, 4, -5 + ADO], r: 0 }, { k: `south-inner-wall-outer-${idx}`, p: [sc, 4, 5 + ADO], r: 0 }, { k: `south-inner-wall-inner-${idx}`, p: [sc, 4, 5 - ADO], r: Math.PI }, { k: `east-inner-wall-outer-${idx}`, p: [5 + ADO, 4, sc], r: Math.PI / 2 }, { k: `east-inner-wall-inner-${idx}`, p: [5 - ADO, 4, sc], r: -Math.PI / 2 }, { k: `west-inner-wall-outer-${idx}`, p: [-5 - ADO, 4, sc], r: -Math.PI / 2 }, { k: `west-inner-wall-inner-${idx}`, p: [-5 + ADO, 4, sc], r: Math.PI / 2 } ];
        cfgs.forEach(c => {
          const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide })); m.position.set(c.p[0], c.p[1], c.p[2]); m.rotation.y = c.r; scene.add(m);
          const rv = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, c.r, 0));
          const pa = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide })); pa.rotation.y = c.r + Math.PI; pa.position.copy(m.position).addScaledVector(rv, -APO); scene.add(pa);
          const na = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide })); na.rotation.y = c.r; na.position.copy(m.position).addScaledVector(rv, APO); scene.add(na);
          panelsRef.current.push({ mesh: m, wallName: c.k as keyof PanelConfig, metadataUrl: '', isVideo: false, isGif: false, prevArrow: pa, nextArrow: na, videoElement: null, gifStopFunction: null });
        });
      });

      for (let i = 0; i < panelsRef.current.length; i++) {
        if (stopLoad) break;
        updatePanelContent(panelsRef.current[i], getCurrentNftSource(panelsRef.current[i].wallName));
        if (i % 3 === 0) await new Promise(res => setTimeout(res, 100));
      }
    };
    createPanels();

    const fadeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false }); fadeMaterialRef.current = fadeMaterial;
    const fs = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), fadeMaterial); fs.renderOrder = 999; fadeScreenRef.current = fs; scene.add(fs);

    const handleTS = (e: TouchEvent) => { isDraggingRef.current = false; touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
    const handleTM = (e: TouchEvent) => { isDraggingRef.current = true; const dx = e.touches[0].clientX - touchStartRef.current.x; const dy = e.touches[0].clientY - touchStartRef.current.y; rotationRef.current.yaw += dx * 0.005; rotationRef.current.pitch += dy * 0.005; rotationRef.current.pitch = Math.max(-1.4, Math.min(1.4, rotationRef.current.pitch)); touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
    const handleTE = (e: TouchEvent) => {
      if (!isDraggingRef.current) {
        const t = e.changedTouches[0]; const x = (t.clientX/window.innerWidth)*2-1; const y = -(t.clientY/window.innerHeight)*2+1;
        raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), camera);
        const objs = [...panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow]), ...teleportButtonsRef.current];
        const ints = raycasterRef.current.intersectObjects(objs);
        if (ints.length > 0) {
          const hit = ints[0].object as THREE.Mesh;
          setIsWalking(false);
          if (hit.userData.isTeleportButton) { performTeleport(hit.userData.targetY); return; }
          const p = panelsRef.current.find(p => p.mesh === hit || p.prevArrow === hit || p.nextArrow === hit);
          if (p) {
            if (hit === p.prevArrow || hit === p.nextArrow) { if (updatePanelIndex(p.wallName, hit === p.nextArrow ? 'next' : 'prev')) updatePanelContent(p, getCurrentNftSource(p.wallName)); }
            else if (p.metadataUrl) { const cfg = GALLERY_PANEL_CONFIG[p.wallName]; setMarketBrowserState({ open: true, collection: cfg.contractAddress, tokenId: cfg.tokenIds[cfg.currentIndex] }); }
          }
        }
      }
    };

    const container = mountRef.current;
    container.addEventListener('touchstart', handleTS, { passive: true });
    container.addEventListener('touchmove', handleTM, { passive: true });
    container.addEventListener('touchend', handleTE);

    let lastTime = performance.now();
    const animate = () => {
      if (stopLoad) return;
      const t = performance.now(); const d = (t - lastTime) * 0.001; lastTime = t;
      if (rainbowMaterialRef.current) rainbowMaterialRef.current.uniforms.time.value = t * 0.001;
      if (camera) {
        camera.rotation.set(rotationRef.current.pitch, rotationRef.current.yaw, 0);
        if (isWalkingRef.current && !isTeleportingRef.current) {
          const fw = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); fw.y = 0; fw.normalize();
          const nx = new THREE.Vector3(camera.position.x + fw.x * 4 * d, camera.position.y, camera.position.z); if (!checkCollision(nx)) camera.position.x = nx.x;
          const nz = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z + fw.z * 4 * d); if (!checkCollision(nz)) camera.position.z = nz.z;
        }
        if (fs) { fs.position.copy(camera.position); fs.quaternion.copy(camera.quaternion); }
      }
      if (isTeleportingRef.current && fadeMaterialRef.current) {
        const el = (t - fadeStartTimeRef.current) / 1000;
        if (el < 0.5) fadeMaterialRef.current.opacity = el / 0.5;
        else if (el < 1) fadeMaterialRef.current.opacity = 1 - (el - 0.5) / 0.5;
        else { fadeMaterialRef.current.opacity = 0; isTeleportingRef.current = false; }
      }
      renderer.render(scene, camera); requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => { if (camera && renderer) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); } };
    window.addEventListener('resize', onResize);
    return () => {
      stopLoad = true;
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      container.removeEventListener('touchstart', handleTS); container.removeEventListener('touchmove', handleTM); container.removeEventListener('touchend', handleTE);
      window.removeEventListener('resize', onResize); renderer.dispose(); mountRef.current?.removeChild(renderer.domElement);
    };
  }, [updatePanelContent, checkCollision, isWalking]);

  return (
    <div className="w-full h-full bg-black relative touch-none">
      <div ref={mountRef} className="w-full h-full touch-none" />
      {!isStarted && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-50 cursor-pointer" onClick={() => setIsStarted(true)}>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-2xl text-center max-w-xs">
            <h2 className="text-2xl font-bold text-white mb-4">Nice Art Gallery</h2>
            <p className="text-white/70 mb-6">Drag to look around, tap on panels to interact.</p>
            <button className="bg-primary text-primary-foreground px-8 py-3 rounded-full font-bold">Enter Gallery</button>
          </div>
        </div>
      )}
      {isStarted && (
        <>
          <div className="fixed bottom-4 left-4 right-4 text-white text-center pointer-events-none bg-black/40 p-2 rounded text-xs z-20">Drag to look around • Tap panels to interact</div>
          <button onClick={() => setIsWalking(!isWalking)} className={`fixed bottom-16 right-6 p-4 rounded-full z-30 shadow-lg ${isWalking ? 'bg-primary text-primary-foreground scale-110' : 'bg-white/10 text-white backdrop-blur-md border border-white/20'}`}>
            <Footprints className={`h-8 w-8 ${isWalking ? 'animate-pulse' : ''}`} />
          </button>
        </>
      )}
      {marketBrowserState.open && (
        <MarketBrowserRefined collection={marketBrowserState.collection || ''} tokenId={marketBrowserState.tokenId || ''} open={marketBrowserState.open} onClose={() => setMarketBrowserState({ open: false })} />
      )}
    </div>
  );
};

export default NftGalleryMobile;