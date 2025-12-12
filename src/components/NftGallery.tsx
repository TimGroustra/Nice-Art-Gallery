import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls, RectAreaLightUniformsLib } from 'three-stdlib';
import { initializeGalleryConfig, GALLERY_PANEL_CONFIG, getCurrentNftSource, updatePanelIndex, PanelConfig } from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftSource, NftAttribute } from '@/utils/nftFetcher';
import { showSuccess, showError } from '@/utils/toast';
import { createGifTexture } from '@/utils/gifTexture'; // Import the new utility
import { MarketBrowserRefined } from './MarketBrowserRefined';

// ---------- OCTAGON CONSTANTS ----------
const OCTAGON_RADIUS = 25; // Half‑size of the original square room
const DIAGONAL_WALL_LENGTH = Math.SQRT2 * OCTAGON_RADIUS; // Approx. length of a diagonal side
const DIAGONAL_WALL_THICKNESS = 0.05;

// ---------- CEILING SHADERS (unchanged) ----------
const ceilingVertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const ceilingFragmentShader = `
    uniform float time;
    uniform float opacity;
    
    vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    void main() {
        float hue = mod(time * 0.05, 1.0);
        float pulse = 0.3 + sin(time * 0.5) * 0.1;
        vec3 color = hsv2rgb(vec3(hue, 0.8, pulse));
        gl_FragColor = vec4(color, opacity);
    }
`;

// ---------- TEXTURE HELPERS (unchanged) ----------
const createTextTexture = (text: string, width: number, height: number, fontSize: number = 30, color: string = 'white', options: { scrollY?: number, wordWrap?: boolean } = {}): { texture: THREE.CanvasTexture, totalHeight: number } => {
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
    const maxWidth = canvas.width - 2 * padding;

    for (let n = 0; n < words.length; n++) {
      const test = line + words[n] + ' ';
      const metrics = context.measureText(test);
      if (metrics.width > maxWidth && n > 0) {
        context.fillText(line, padding, y - scrollY);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = test;
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
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, totalHeight };
};

const createAttributesTextTexture = (attributes: NftAttribute[], width: number, height: number, fontSize: number, color: string = 'white'): { texture: THREE.CanvasTexture } => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { texture: new THREE.CanvasTexture(document.createElement('canvas')) };

  const resolution = 512;
  canvas.width = resolution * (width / height);
  canvas.height = resolution;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const padding = 40;
  const lineHeight = fontSize * 1.2;
  let y = padding;
  const maxWidth = canvas.width - 2 * padding;

  if (!attributes || attributes.length === 0) {
    ctx.fillText('No attributes found.', padding, y);
  } else {
    attributes.forEach(attr => {
      if (attr.trait_type && attr.value) {
        const line = `${attr.trait_type}: ${attr.value}`;
        const words = line.split(' ');
        let curLine = '';
        for (let n = 0; n < words.length; n++) {
          const test = curLine + words[n] + ' ';
          if (ctx.measureText(test).width > maxWidth && n > 0) {
            ctx.fillText(curLine, padding, y);
            curLine = words[n] + ' ';
            y += lineHeight;
          } else {
            curLine = test;
          }
        }
        ctx.fillText(curLine, padding, y);
        y += lineHeight;
      }
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture };
};

// ---------- COMPONENT ----------
const NftGallery: React.FC<{ setInstructionsVisible: (v: boolean) => void }> = ({ setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<any[]>([]);
  const wallMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const [isLocked, setIsLocked] = useState(false);
  const [marketBrowserState, setMarketBrowserState] = useState<{ open: boolean; collection?: string; tokenId?: string | number }>({ open: false });

  // ------------------------------------------------- //
  // Utility helpers (video / GIF detection, cleanup)
  // ------------------------------------------------- //
  const isVideoContent = (type: string, url: string) => !!(type.startsWith('video/') || url.match(/\.(mp4|webm|ogg)(\?|$)/i));
  const isGifContent   = (type: string, url: string) => !!(type === 'image/gif' || url.match(/\.gif(\?|$)/i));

  const disposeTextureSafely = (mesh: THREE.Mesh) => {
    if (mesh.material instanceof THREE.MeshBasicMaterial) {
      if (mesh.material.map && typeof mesh.material.map.dispose === 'function') {
        mesh.material.map.dispose();
        mesh.material.map = null;
      }
      mesh.material.dispose();
    }
  };

  // ------------------------------------------------- //
  // Texture loading (image / video / GIF)
  // ------------------------------------------------- //
  const loadTexture = useCallback(async (url: string, panel: any, contentType: string): Promise<THREE.Texture | THREE.VideoTexture> => {
    const isVideo = isVideoContent(contentType, url);
    const isGif   = isGifContent(contentType, url);

    // Cleanup previous media
    if (panel.videoElement) {
      panel.videoElement.pause();
      panel.videoElement.removeAttribute('src');
      panel.videoElement = null;
    }
    if (panel.gifStopFunction) {
      panel.gifStopFunction();
      panel.gifStopFunction = null;
    }

    if (isVideo) {
      return new Promise(resolve => {
        let videoEl = panel.videoElement;
        if (!videoEl) {
          videoEl = document.createElement('video');
          videoEl.playsInline = true;
          videoEl.autoplay = true;
          videoEl.loop = true;
          videoEl.muted = true;
          videoEl.style.display = 'none';
          panel.videoElement = videoEl;
        }
        videoEl.src = url;
        videoEl.load();
        if ((window as any).galleryControls?.isLocked?.()) {
          videoEl.play().catch(() => { /* ignore autoplay blocks */ });
        }
        const vt = new THREE.VideoTexture(videoEl);
        vt.minFilter = THREE.LinearFilter;
        vt.magFilter = THREE.LinearFilter;
        resolve(vt);
      });
    }

    if (isGif) {
      try {
        const { texture, stop } = await createGifTexture(url);
        panel.gifStopFunction = stop;
        return texture;
      } catch (e) {
        console.error('GIF load failed, falling back to image', e);
      }
    }

    // Regular image fallback
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(url, tex => resolve(tex), undefined, err => {
        console.error('Image load error', err);
        showError(`Failed to load image: ${url.slice(0, 30)}…`);
        reject(err);
      });
    });
  }, []);

  // ------------------------------------------------- //
  // Panel content updater
  // ------------------------------------------------- //
  const updatePanelContent = useCallback(async (panel: any, source: NftSource | null) => {
    const collection = GALLERY_PANEL_CONFIG[panel.wallName];
    const txtColor = collection?.text_color || 'white';

    // Reset panel visuals
    disposeTextureSafely(panel.mesh);
    panel.mesh.material = new THREE.MeshBasicMaterial({ color: 0x333333 });
    panel.metadataUrl = '';
    panel.isVideo = false;
    panel.isGif   = false;
    if (panel.titleMesh) panel.titleMesh.visible = false;
    if (panel.descriptionMesh) panel.descriptionMesh.visible = false;
    if (panel.attributesMesh) panel.attributesMesh.visible = false;

    // Cleanup media
    if (panel.videoElement) {
      panel.videoElement.pause();
      panel.videoElement.removeAttribute('src');
      panel.videoElement = null;
    }
    if (panel.gifStopFunction) {
      panel.gifStopFunction();
      panel.gifStopFunction = null;
    }

    // Blank panel (no NFT)
    if (!source || source.contractAddress === '') {
      const showArrows = collection && collection.tokenIds.length > 1;
      panel.prevArrow.visible = showArrows;
      panel.nextArrow.visible = showArrows;
      return;
    }

    // Fetch metadata (cached)
    const metadata = await getCachedNftMetadata(source.contractAddress, source.tokenId);
    if (!metadata) {
      showError('Failed to fetch NFT metadata.');
      return;
    }

    try {
      const tex = await loadTexture(metadata.contentUrl, panel, metadata.contentType);
      disposeTextureSafely(panel.mesh);
      panel.mesh.material = new THREE.MeshBasicMaterial({ map: tex });
      panel.metadataUrl = metadata.source;
      panel.isVideo = isVideoContent(metadata.contentType, metadata.contentUrl);
      panel.isGif   = isGifContent(metadata.contentType, metadata.contentUrl);

      // Title
      const titleTex = createTextTexture(metadata.title, 4, 0.5, 120, txtColor).texture;
      (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTex;
      panel.titleMesh.visible = true;

      // Description (scrollable)
      const { texture: descTex, totalHeight } = createTextTexture(metadata.description, 2.5, 1.5, 30, txtColor, { wordWrap: true });
      (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = descTex;
      panel.currentDescription = metadata.description;
      panel.descriptionTextHeight = totalHeight;
      panel.descriptionScrollY = 0;
      panel.descriptionMesh.visible = true;

      // Attributes
      const attrTex = createAttributesTextTexture(metadata.attributes || [], 2.5, 1.5, 40, txtColor).texture;
      (panel.attributesMesh.material as THREE.MeshBasicMaterial).map = attrTex;
      panel.attributesMesh.visible = true;

      showSuccess(`Loaded ${panel.isVideo ? 'video' : panel.isGif ? 'GIF' : 'image'} NFT`);
    } catch (e) {
      console.error('NFT content error', e);
      showError('Error loading NFT content.');
    }

    // Arrow visibility
    const showArrows = collection && collection.tokenIds.length > 1;
    panel.prevArrow.visible = showArrows;
    panel.nextArrow.visible = showArrows;
  }, [loadTexture]);

  // ------------------------------------------------- //
  // Video playback control when lock state changes
  // ------------------------------------------------- //
  const manageVideoPlayback = useCallback((play: boolean) => {
    panelsRef.current.forEach(p => {
      if (p.videoElement) {
        if (play) {
          const locked = (window as any).galleryControls?.isLocked?.();
          if (locked) p.videoElement.play().catch(() => {});
        } else {
          p.videoElement.pause();
        }
      }
    });
  }, []);

  // ------------------------------------------------- //
  // Effect: setup Three.js scene
  // ------------------------------------------------- //
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaaaaaa);
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, -20);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    // Controls
    const controls = new PointerLockControls(camera, renderer.domElement);
    (window as any).galleryControls = {
      lockControls: () => controls.lock(),
      hasVideo: () => panelsRef.current.some(p => p.videoElement !== null),
      isMuted: () => {
        const vids = panelsRef.current.filter(p => p.videoElement);
        if (!vids.length) return true;
        return vids.every(v => v.videoElement!.muted);
      },
      toggleMute: () => {
        const vids = panelsRef.current.filter(p => p.videoElement);
        if (!vids.length) return;
        const muteState = vids[0].videoElement!.muted;
        vids.forEach(v => { v.videoElement!.muted = !muteState; });
      },
      isLocked: () => controls.isLocked,
      getTargetedPanel: () => currentTargetedPanel,
    };

    // ---------- LOCK/UNLOCK UI ----------
    controls.addEventListener('lock', () => {
      setIsLocked(true);
      setInstructionsVisible(false);
      manageVideoPlayback(true);
    });
    controls.addEventListener('unlock', () => {
      setIsLocked(false);
      setInstructionsVisible(true);
      manageVideoPlayback(false);
    });

    // ---------- OCTAGON FLOOR ----------
    const floorShape = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI / 4) * i - Math.PI / 2; // start at north (-Z)
      const x = Math.cos(angle) * OCTAGON_RADIUS;
      const z = Math.sin(angle) * OCTAGON_RADIUS;
      if (i === 0) floorShape.moveTo(x, z);
      else floorShape.lineTo(x, z);
    }
    floorShape.closePath();
    const floorGeometry = new THREE.ShapeGeometry(floorShape);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      side: THREE.DoubleSide,
      roughness: 0.2,
      metalness: 0.1,
    });
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    scene.add(floorMesh);

    // ---------- OCTAGON WALLS ----------
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI / 4) * i - Math.PI / 2;
      const nextAngle = angle + Math.PI / 4;
      const x1 = Math.cos(angle) * OCTAGON_RADIUS;
      const z1 = Math.sin(angle) * OCTAGON_RADIUS;
      const x2 = Math.cos(nextAngle) * OCTAGON_RADIUS;
      const z2 = Math.sin(nextAngle) * OCTAGON_RADIUS;

      const wallLength = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
      const wallGeom = new THREE.PlaneGeometry(wallLength, 4);
      const wallMesh = new THREE.Mesh(wallGeom, wallMaterial.clone());

      // Position at midpoint
      wallMesh.position.set((x1 + x2) / 2, 2, (z1 + z2) / 2);
      // Rotate to face inward
      const wallAngle = Math.atan2(z2 - z1, x2 - x1) + Math.PI / 2;
      wallMesh.rotation.y = -wallAngle;

      const wallKey = `oct-wall-${i}`;
      wallMeshesRef.current.set(wallKey, wallMesh);
      scene.add(wallMesh);
    }

    // ---------- CEILING ----------
    RectAreaLightUniformsLib.init();
    const ceilingMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, opacity: { value: 1 } },
      vertexShader: ceilingVertexShader,
      fragmentShader: ceilingFragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const ceilingGeom = new THREE.PlaneGeometry(OCTAGON_RADIUS * 2, OCTAGON_RADIUS * 2);
    const ceiling = new THREE.Mesh(ceilingGeom, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 4;
    scene.add(ceiling);

    // ---------- LIGHTING ----------
    scene.add(new THREE.AmbientLight(0x404050, 1));
    const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5);
    hemi.position.set(0, 4, 0);
    scene.add(hemi);

    // ---------- PANEL SETUP ----------
    // Geometry & materials shared across panels
    const panelGeom = new THREE.PlaneGeometry(2, 2);
    const panelMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide, transparent: true, opacity: 0 });

    // Text panel material factory
    const createTextPanelMaterial = () => new THREE.MeshBasicMaterial({ map: null, transparent: true, side: THREE.DoubleSide, alphaTest: 0.01, depthWrite: false });

    // Title / description / attributes / wall‑title geometries
    const titleGeom = new THREE.PlaneGeometry(4, 0.5);
    const descGeom = new THREE.PlaneGeometry(2.5, 1.5);
    const attrGeom = new THREE.PlaneGeometry(2.5, 1.5);
    const wallTitleGeom = new THREE.PlaneGeometry(8, 0.75);
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15); arrowShape.lineTo(0.3, 0); arrowShape.lineTo(0, -0.15); arrowShape.lineTo(0, 0.15);
    const arrowGeom = new THREE.ShapeGeometry(arrowShape);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide });

    // Helper to compute panel position/orientation from octagon side index
    const panelConfigs: { wallName: keyof PanelConfig; pos: [number, number, number]; rot: [number, number, number] }[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI / 4) * i - Math.PI / 2; // north = -Z
      const x = Math.cos(angle) * OCTAGON_RADIUS * 0.9;
      const z = Math.sin(angle) * OCTAGON_RADIUS * 0.9;
      const rotY = -angle; // panels face inward
      const wallKey = `oct-wall-${i}` as keyof PanelConfig;
      panelConfigs.push({ wallName: wallKey, pos: [x, 1.8, z], rot: [0, rotY, 0] });
    }

    // Clear any previous panels
    panelsRef.current = [];

    panelConfigs.forEach(cfg => {
      const mesh = new THREE.Mesh(panelGeom, panelMat.clone());
      mesh.position.set(...cfg.pos);
      mesh.rotation.set(...cfg.rot);
      scene.add(mesh);

      // Title mesh (above main panel)
      const titleMesh = new THREE.Mesh(titleGeom, createTextPanelMaterial());
      titleMesh.rotation.set(...cfg.rot);
      const titlePos = new THREE.Vector3(...cfg.pos);
      titlePos.y += 1 + 0.5 / 2 + 0.1;
      titlePos.add(new THREE.Vector3(0, 0, 0).applyEuler(new THREE.Euler(...cfg.rot)).multiplyScalar(0.16));
      titleMesh.position.copy(titlePos);
      titleMesh.visible = false;
      scene.add(titleMesh);

      // Description panel (left side)
      const descMesh = new THREE.Mesh(descGeom, createTextPanelMaterial());
      descMesh.rotation.set(...cfg.rot);
      const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(...cfg.rot));
      const descPos = new THREE.Vector3(...cfg.pos).addScaledVector(right, -1.5);
      descPos.add(new THREE.Vector3(0, 0, 0).applyEuler(new THREE.Euler(...cfg.rot)).multiplyScalar(0.16));
      descMesh.position.copy(descPos);
      descMesh.visible = false;
      scene.add(descMesh);

      // Attributes panel (right side)
      const attrMesh = new THREE.Mesh(attrGeom, createTextPanelMaterial());
      attrMesh.rotation.set(...cfg.rot);
      const attrPos = new THREE.Vector3(...cfg.pos).addScaledVector(right, 1.5);
      attrPos.add(new THREE.Vector3(0, 0, 0).applyEuler(new THREE.Euler(...cfg.rot)).multiplyScalar(0.16));
      attrMesh.position.copy(attrPos);
      attrMesh.visible = false;
      scene.add(attrMesh);

      // Wall‑title (above panel)
      const wallTitleMesh = new THREE.Mesh(wallTitleGeom, createTextPanelMaterial());
      wallTitleMesh.rotation.set(...cfg.rot);
      const wallTitlePos = new THREE.Vector3(...cfg.pos);
      wallTitlePos.y = 3.2;
      wallTitleMesh.position.copy(wallTitlePos);
      wallTitleMesh.visible = false;
      scene.add(wallTitleMesh);

      // Arrows
      const prevArrow = new THREE.Mesh(arrowGeom, arrowMat.clone());
      prevArrow.rotation.set(...cfg.rot);
      prevArrow.rotation.y += Math.PI;
      const prevPos = new THREE.Vector3(...cfg.pos).addScaledVector(right, -1);
      prevArrow.position.copy(prevPos);
      scene.add(prevArrow);

      const nextArrow = new THREE.Mesh(arrowGeom, arrowMat.clone());
      nextArrow.rotation.set(...cfg.rot);
      const nextPos = new THREE.Vector3(...cfg.pos).addScaledVector(right, 1);
      nextArrow.position.copy(nextPos);
      scene.add(nextArrow);

      panelsRef.current.push({
        mesh,
        wallName: cfg.wallName,
        metadataUrl: '',
        isVideo: false,
        isGif: false,
        prevArrow,
        nextArrow,
        titleMesh,
        descriptionMesh: descMesh,
        attributesMesh: attrMesh,
        wallTitleMesh,
        currentDescription: '',
        descriptionScrollY: 0,
        descriptionTextHeight: 0,
        currentAttributes: [],
        videoElement: null,
        gifStopFunction: null,
      });
    });

    // ------------------------------------------------- //
    // Interaction (mouse, keyboard, wheel)
    // ------------------------------------------------- //
    let moveF = false, moveB = false, moveL = false, moveR = false;
    const vel = new THREE.Vector3(), dir = new THREE.Vector3(), speed = 20;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') moveF = true;
      else if (e.code === 'KeyS') moveB = true;
      else if (e.code === 'KeyA') moveL = true;
      else if (e.code === 'KeyD') moveR = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') moveF = false;
      else if (e.code === 'KeyS') moveB = false;
      else if (e.code === 'KeyA') moveL = false;
      else if (e.code === 'KeyD') moveR = false;
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    const raycaster = new THREE.Raycaster();
    const centerRay = new THREE.Vector2(0, 0);

    const onMouseDown = () => {
      if (!controls.isLocked) return;
      if (currentTargetedArrow) {
        const panel = panelsRef.current.find(p => p.prevArrow === currentTargetedArrow || p.nextArrow === currentTargetedArrow);
        if (panel) {
          const dir = currentTargetedArrow === panel.nextArrow ? 'next' : 'prev';
          if (updatePanelIndex(panel.wallName, dir as any)) {
            const src = getCurrentNftSource(panel.wallName);
            updatePanelContent(panel, src);
          }
        }
      } else if (currentTargetedPanel) {
        const src = getCurrentNftSource(currentTargetedPanel.wallName);
        if (src) {
          setMarketBrowserState({ open: true, collection: src.contractAddress, tokenId: src.tokenId });
          controls.unlock();
        }
      }
    };
    document.addEventListener('mousedown', onMouseDown);

    // Description scroll
    const onWheel = (e: WheelEvent) => {
      if (!controls.isLocked || !currentTargetedDescriptionPanel) return;
      const panel = currentTargetedDescriptionPanel;
      const delta = e.deltaY * 0.5;
      const canvasH = 512;
      const padding = 40;
      const maxScroll = Math.max(0, panel.descriptionTextHeight - (canvasH - 2 * padding));
      const newY = Math.max(0, Math.min(panel.descriptionScrollY + delta, maxScroll));
      if (newY !== panel.descriptionScrollY) {
        panel.descriptionScrollY = newY;
        const { texture } = createTextTexture(panel.currentDescription, 2.5, 1.5, 30, GALLERY_PANEL_CONFIG[panel.wallName]?.text_color || 'white', { wordWrap: true, scrollY: newY });
        (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = texture;
      }
    };
    document.addEventListener('wheel', onWheel);

    // ------------------------------------------------- //
    // Animation loop
    // ------------------------------------------------- //
    let prevTime = performance.now();
    const startTime = performance.now();

    const animate = () => {
      requestAnimationFrame(animate);
      const now = performance.now();
      const delta = (now - prevTime) / 1000;
      const elapsed = (now - startTime) / 1000;

      // Ceiling shader time
      (ceilingMaterial.uniforms as any).time.value = elapsed;

      if (controls.isLocked) {
        vel.x -= vel.x * 10 * delta;
        vel.z -= vel.z * 10 * delta;
        dir.set(Number(moveR) - Number(moveL), 0, Number(moveB) - Number(moveF)).normalize();
        if (moveF || moveB) vel.z -= dir.z * speed * delta;
        if (moveL || moveR) vel.x -= dir.x * speed * delta;

        const prevX = camera.position.x;
        const prevZ = camera.position.z;

        controls.moveRight(-vel.x * delta);
        controls.moveForward(-vel.z * delta);

        // Keep inside octagon radius (simple circular bound)
        const radius = OCTAGON_RADIUS - 0.5;
        const dist = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
        if (dist > radius) {
          camera.position.x = (camera.position.x / dist) * radius;
          camera.position.z = (camera.position.z / dist) * radius;
        }

        camera.position.y = 1.6;

        // Raycast for interactive objects
        raycaster.setFromCamera(centerRay, camera);
        const hits = raycaster.intersectObjects(panelsRef.current.flatMap(p => [p.mesh, p.prevArrow, p.nextArrow, p.descriptionMesh]), false);
        panelsRef.current.forEach(p => {
          (p.prevArrow.material as THREE.MeshBasicMaterial).color.setHex(0xcccccc);
          (p.nextArrow.material as THREE.MeshBasicMaterial).color.setHex(0xcccccc);
        });
        currentTargetedPanel = null;
        currentTargetedArrow = null;
        currentTargetedDescriptionPanel = null;

        if (hits.length && hits[0].distance < 5) {
          const hit = hits[0].object as THREE.Mesh;
          const panel = panelsRef.current.find(p => p.mesh === hit || p.prevArrow === hit || p.nextArrow === hit || p.descriptionMesh === hit);
          if (panel) {
            if (hit === panel.mesh) currentTargetedPanel = panel;
            else if (hit === panel.prevArrow || hit === panel.nextArrow) {
              currentTargetedArrow = hit;
              (hit.material as THREE.MeshBasicMaterial).color.setHex(0x00ff00);
            } else if (hit === panel.descriptionMesh) {
              currentTargetedDescriptionPanel = panel;
            }
          }
        }
      }

      prevTime = now;
      renderer.render(scene, camera);
    };
    animate();

    // ------------------------------------------------- //
    // Initial content load
    // ------------------------------------------------- //
    const loadAllPanels = async () => {
      await initializeGalleryConfig();
      // Apply wall colors from config
      Object.entries(GALLERY_PANEL_CONFIG).forEach(([key, cfg]) => {
        const wall = wallMeshesRef.current.get(key);
        if (wall && cfg.wall_color) {
          (wall.material as THREE.MeshStandardMaterial).color.set(cfg.wall_color);
        }
      });

      for (const panel of panelsRef.current) {
        const src = getCurrentNftSource(panel.wallName);
        await updatePanelContent(panel, src);
        // Small delay to avoid RPC spiking
        await new Promise(r => setTimeout(r, 80));
      }
    };
    loadAllPanels();

    // ------------------------------------------------- //
    // Resize & cleanup
    // ------------------------------------------------- //
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      mountRef.current?.removeChild(renderer.domElement);
      controls.dispose();

      panelsRef.current.forEach(p => {
        if (p.videoElement) {
          p.videoElement.pause();
          p.videoElement.removeAttribute('src');
        }
        if (p.gifStopFunction) p.gifStopFunction();
      });

      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
          } else {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
        }
      });
      renderer.dispose();
      delete (window as any).galleryControls;
      currentTargetedPanel = null;
      currentTargetedArrow = null;
      currentTargetedDescriptionPanel = null;
    };
  }, [setInstructionsVisible, updatePanelContent, manageVideoPlayback]);

  return (
    <>
      <div ref={mountRef} className="w-full h-full" />
      {marketBrowserState.open && (
        <MarketBrowserRefined
          collection={marketBrowserState.collection || ''}
          tokenId={marketBrowserState.tokenId || ''}
          open={marketBrowserState.open}
          onClose={() => setMarketBrowserState({ open: false })}
        />
      )}
    </>
  );
};

export default NftGallery;