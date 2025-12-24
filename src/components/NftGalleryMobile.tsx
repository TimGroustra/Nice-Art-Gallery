"use client";

import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three-stdlib';
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

RectAreaLightUniformsLib.init();

const PANEL_WIDTH = 6;
const PANEL_HEIGHT = 6;

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

const NftGalleryMobile: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<Panel[]>([]);
  const [isStarted, setIsStarted] = useState(false);
  const [marketBrowserState, setMarketBrowserState] = useState<{
    open: boolean;
    collection?: string;
    tokenId?: string | number;
  }>({ open: false });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

  // Rotation state for touch dragging
  const rotationRef = useRef({ yaw: 0, pitch: 0 });
  const touchStartRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  const loadTexture = useCallback(async (url: string, panel: Panel, contentType: string): Promise<THREE.Texture | THREE.VideoTexture> => {
    const isVideo = isVideoContent(contentType, url);
    const isGif = isGifContent(contentType, url);

    if (panel.videoElement) {
      panel.videoElement.pause();
      panel.videoElement.src = '';
      panel.videoElement = null;
    }

    if (isGif) {
      const { texture, stop } = await createGifTexture(url);
      panel.gifStopFunction = stop;
      return texture;
    }

    if (isVideo) {
      const videoEl = document.createElement('video');
      videoEl.playsInline = true;
      videoEl.autoplay = true;
      videoEl.loop = true;
      videoEl.muted = true;
      videoEl.crossOrigin = 'anonymous';
      videoEl.src = url;
      panel.videoElement = videoEl;
      const videoTexture = new THREE.VideoTexture(videoEl);
      return videoTexture;
    }

    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, resolve, undefined, reject);
    });
  }, []);

  const updatePanelContent = useCallback(async (panel: Panel, source: NftSource | null) => {
    disposeTextureSafely(panel.mesh);
    panel.mesh.material = new THREE.MeshBasicMaterial({ color: 0x222222 });
    
    if (!source || source.contractAddress === '') return;

    const metadata = await getCachedNftMetadata(source.contractAddress, source.tokenId);
    if (!metadata) return;

    try {
      const texture = await loadTexture(metadata.contentUrl, panel, metadata.contentType || '');
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

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x050505);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    cameraRef.current = camera;
    camera.position.set(0, 1.6, 20);
    camera.rotation.order = 'YXZ';

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current = renderer;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.5);
    sun.position.set(5, 10, 7.5);
    scene.add(sun);

    const ROOM_SIZE = 50;
    const floorGeo = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const rainbowMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: rainbowVertexShader,
      fragmentShader: rainbowFragmentShader,
      side: THREE.DoubleSide
    });
    const ceiling = new THREE.Mesh(floorGeo, rainbowMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 16;
    scene.add(ceiling);

    const createPanels = async () => {
      await initializeGalleryConfig();
      const panelGeo = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
      const arrowShape = new THREE.Shape();
      arrowShape.moveTo(0, 0.2); arrowShape.lineTo(0.4, 0); arrowShape.lineTo(0, -0.2);
      const arrowGeo = new THREE.ShapeGeometry(arrowShape);

      Object.keys(GALLERY_PANEL_CONFIG).forEach((key, idx) => {
        const config = GALLERY_PANEL_CONFIG[key];
        if (!config) return;

        const mesh = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({ color: 0x333333 }));
        const col = idx % 5;
        const row = Math.floor(idx / 5);
        mesh.position.set((col - 2) * 8, 4 + row * 8, -20);
        scene.add(mesh);

        const prevArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc }));
        prevArrow.rotation.z = Math.PI;
        prevArrow.position.set(mesh.position.x - 3.5, mesh.position.y, mesh.position.z + 0.1);
        scene.add(prevArrow);

        const nextArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xcccccc }));
        nextArrow.position.set(mesh.position.x + 3.5, mesh.position.y, mesh.position.z + 0.1);
        scene.add(nextArrow);

        const p: Panel = { mesh, wallName: key as keyof PanelConfig, metadataUrl: '', isVideo: false, isGif: false, prevArrow, nextArrow, videoElement: null, gifStopFunction: null };
        panelsRef.current.push(p);
        updatePanelContent(p, getCurrentNftSource(key as keyof PanelConfig));
      });
    };

    createPanels();

    const handleTouchStart = (e: TouchEvent) => {
      isDraggingRef.current = false;
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const handleTouchMove = (e: TouchEvent) => {
      isDraggingRef.current = true;
      const deltaX = e.touches[0].clientX - touchStartRef.current.x;
      const deltaY = e.touches[0].clientY - touchStartRef.current.y;
      
      const sensitivity = 0.005;
      rotationRef.current.yaw -= deltaX * sensitivity;
      rotationRef.current.pitch -= deltaY * sensitivity;
      rotationRef.current.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, rotationRef.current.pitch));

      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isDraggingRef.current) {
        const touch = e.changedTouches[0];
        const x = (touch.clientX / window.innerWidth) * 2 - 1;
        const y = -(touch.clientY / window.innerHeight) * 2 + 1;

        const raycaster = raycasterRef.current;
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
        
        const objects = panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow]);
        const intersects = raycaster.intersectObjects(objects);

        if (intersects.length > 0) {
          const hit = intersects[0].object as THREE.Mesh;
          const panel = panelsRef.current.find(p => p.mesh === hit || p.prevArrow === hit || p.nextArrow === hit);
          
          if (panel) {
            if (hit === panel.prevArrow || hit === panel.nextArrow) {
              const direction = hit === panel.nextArrow ? 'next' : 'prev';
              if (updatePanelIndex(panel.wallName, direction)) {
                updatePanelContent(panel, getCurrentNftSource(panel.wallName));
              }
            } else if (panel.metadataUrl) {
              const config = GALLERY_PANEL_CONFIG[panel.wallName];
              setMarketBrowserState({
                open: true,
                collection: config.contractAddress,
                tokenId: config.tokenIds[config.currentIndex]
              });
            }
          }
        }
      }
    };

    const container = mountRef.current;
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd);

    const animate = () => {
      const time = performance.now() * 0.001;
      rainbowMat.uniforms.time.value = time;
      
      if (camera) {
        camera.rotation.set(rotationRef.current.pitch, rotationRef.current.yaw, 0);
      }

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      renderer.dispose();
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('resize', onResize);
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, [updatePanelContent]);

  const handleStart = () => {
    setIsStarted(true);
    // Enable audio context if needed
    const bgm = (window as any).musicControls;
    if (bgm && bgm.play) bgm.play();
  };

  return (
    <div className="w-full h-full bg-black relative">
      <div ref={mountRef} className="w-full h-full" />
      
      {!isStarted && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black/70 z-50 cursor-pointer"
          onClick={handleStart}
        >
          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-2xl text-center max-w-xs animate-in fade-in zoom-in duration-300">
            <h2 className="text-2xl font-bold text-white mb-4">Art Gallery Mobile</h2>
            <p className="text-white/70 mb-6">Drag to look around, tap on panels to interact.</p>
            <button className="bg-primary text-primary-foreground px-8 py-3 rounded-full font-bold hover:scale-105 transition-transform">
              Enter Gallery
            </button>
          </div>
        </div>
      )}

      {isStarted && (
        <div className="fixed bottom-4 left-4 right-4 text-white text-center pointer-events-none bg-black/40 p-2 rounded text-xs z-20">
          Drag to look around • Tap panels to interact
        </div>
      )}
      
      {marketBrowserState.open && (
        <MarketBrowserRefined
          collection={marketBrowserState.collection || ''}
          tokenId={marketBrowserState.tokenId || ''}
          open={marketBrowserState.open}
          onClose={() => setMarketBrowserState({ open: false })}
        />
      )}
    </div>
  );
};

export default NftGalleryMobile;