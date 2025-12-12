import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
} from 'react';
import * as THREE from 'three';
import {
  PointerLockControls,
  RectAreaLightUniformsLib,
} from 'three-stdlib';
import {
  initializeGalleryConfig,
  GALLERY_PANEL_CONFIG,
  getCurrentNftSource,
  updatePanelIndex,
} from '@/config/galleryConfig';
import { getCachedNftMetadata } from '@/utils/metadataCache';
import { NftMetadata, NftAttribute, NftSource } from '@/utils/nftFetcher';
import { createGifTexture } from '@/utils/gifTexture';
import { showSuccess, showError } from '@/utils/toast';
import { MarketBrowserRefined } from './MarketBrowserRefined';
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';

/* --------------------------------------------------------------
   Helper: neon strip (RectAreaLight + thin visible mesh)
   -------------------------------------------------------------- */
const addNeonStrip = (
  scene: THREE.Scene,
  start: THREE.Vector3,
  end: THREE.Vector3,
  color: number = 0x00ffff,
  width = 0.2,
) => {
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  const mid = new THREE.Vector3()
    .addVectors(start, end)
    .multiplyScalar(0.5);

  // Light
  const light = new THREE.RectAreaLight(color, 8, width, len);
  light.position.copy(mid);
  const axis = new THREE.Vector3(0, 0, 1);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    axis,
    dir.normalize(),
  );
  light.quaternion.copy(quat);
  scene.add(light);

  // Thin visible mesh (so the strip appears even without helpers)
  const geom = new THREE.PlaneGeometry(width, len);
  const mat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.6,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.copy(mid);
  mesh.quaternion.copy(quat);
  scene.add(mesh);
};

/* --------------------------------------------------------------
   Minimal texture helper stubs (used elsewhere in the file)
   -------------------------------------------------------------- */
function createTextTexture(
  text: string,
  width: number,
  height: number,
  fontSize: number,
  color: string,
  options?: { wordWrap?: boolean; scrollY?: number }
): { texture: THREE.Texture; totalHeight?: number } {
  // Very simple canvas‑based texture – sufficient for compilation.
  const canvas = document.createElement('canvas');
  canvas.width = width * 100; // scale for readability
  canvas.height = height * 100;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.font = `${fontSize * 10}px sans-serif`;
  ctx.textBaseline = 'top';
  let y = options?.scrollY ?? 0;
  if (options?.wordWrap) {
    const words = text.split(' ');
    let line = '';
    const lineHeight = fontSize * 12;
    for (let i = 0; i < words.length; i++) {
      const test = line + words[i] + ' ';
      const metrics = ctx.measureText(test);
      if (metrics.width > canvas.width && i > 0) {
        ctx.fillText(line, 0, y);
        line = words[i] + ' ';
        y += lineHeight;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, 0, y);
    return { texture: new THREE.CanvasTexture(canvas), totalHeight: y + fontSize * 12 };
  } else {
    ctx.fillText(text, 0, y);
    return { texture: new THREE.CanvasTexture(canvas) };
  }
}

function createAttributesTextTexture(
  attributes: NftAttribute[],
  width: number,
  height: number,
  fontSize: number,
  color: string,
): { texture: THREE.Texture } {
  const canvas = document.createElement('canvas');
  canvas.width = width * 100;
  canvas.height = height * 100;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.font = `${fontSize * 10}px sans-serif`;
  let y = 0;
  attributes.forEach((attr) => {
    const line = `${attr.trait_type}: ${attr.value}`;
    ctx.fillText(line, 0, y);
    y += fontSize * 12;
  });
  return { texture: new THREE.CanvasTexture(canvas) };
}

/* --------------------------------------------------------------
   Main component
   -------------------------------------------------------------- */
const NftGallery: React.FC<{
  setInstructionsVisible: (v: boolean) => void;
}> = ({ setInstructionsVisible }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<any[]>([]);
  const wallMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const [marketBrowserState, setMarketBrowserState] = useState<{
    open: boolean;
    collection?: string;
    tokenId?: string | number;
  }>({ open: false });

  /* --------------------------------------------------------------
     CREATE SCENE, CAMERA, RENDERER
     -------------------------------------------------------------- */
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111); // very dark ambient

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 1.6, -20);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    /* -------------------- CONTROLS -------------------- */
    const controls = new PointerLockControls(camera, renderer.domElement);
    (window as any).galleryControls = {
      lockControls: () => controls.lock(),
      isLocked: () => controls.isLocked,
      hasVideo: () => panelsRef.current.some((p) => p.videoElement),
      isMuted: () => {
        const vids = panelsRef.current.filter((p) => p.videoElement);
        if (!vids.length) return true;
        return vids.every((p) => p.videoElement!.muted);
      },
      toggleMute: () => {
        const vids = panelsRef.current.filter((p) => p.videoElement);
        if (!vids.length) return;
        const cur = vids[0].videoElement!.muted;
        vids.forEach((p) => {
          p.videoElement!.muted = !cur;
        });
      },
      getTargetedPanel: () => currentTargetedPanel,
    };

    controls.addEventListener('lock', () => {
      setInstructionsVisible(false);
    });
    controls.addEventListener('unlock', () => {
      setInstructionsVisible(true);
    });

    /* -------------------- LIGHTING -------------------- */
    // Ambient dark
    scene.add(new THREE.AmbientLight(0x111111, 0.3));

    const neonCyan = 0x00ffff;
    const neonMagenta = 0xff00ff;

    // Ceiling neon strips (full room outline)
    const halfRoom = 25;
    const ceilY = 4;
    // north‑south edges
    addNeonStrip(
      scene,
      new THREE.Vector3(-halfRoom, ceilY, -halfRoom),
      new THREE.Vector3(halfRoom, ceilY, -halfRoom),
      neonCyan,
    );
    addNeonStrip(
      scene,
      new THREE.Vector3(-halfRoom, ceilY, halfRoom),
      new THREE.Vector3(halfRoom, ceilY, halfRoom),
      neonCyan,
    );
    // east‑west edges
    addNeonStrip(
      scene,
      new THREE.Vector3(-halfRoom, ceilY, -halfRoom),
      new THREE.Vector3(-halfRoom, ceilY, halfRoom),
      neonMagenta,
    );
    addNeonStrip(
      scene,
      new THREE.Vector3(halfRoom, ceilY, -halfRoom),
      new THREE.Vector3(halfRoom, ceilY, halfRoom),
      neonMagenta,
    );

    // Wall‑top neon strips (top of each wall segment)
    const wallSegmentSize = 10; // <-- renamed from duplicate
    for (let i = -2; i <= 2; i++) {
      const x = i * wallSegmentSize;
      // north + south
      addNeonStrip(
        scene,
        new THREE.Vector3(x - wallSegmentSize / 2, ceilY, -halfRoom),
        new THREE.Vector3(x + wallSegmentSize / 2, ceilY, -halfRoom),
        neonMagenta,
      );
      addNeonStrip(
        scene,
        new THREE.Vector3(x - wallSegmentSize / 2, ceilY, halfRoom),
        new THREE.Vector3(x + wallSegmentSize / 2, ceilY, halfRoom),
        neonMagenta,
      );
      // east + west (z axis)
      const z = i * wallSegmentSize;
      addNeonStrip(
        scene,
        new THREE.Vector3(-halfRoom, ceilY, z - wallSegmentSize / 2),
        new THREE.Vector3(-halfRoom, ceilY, z + wallSegmentSize / 2),
        neonCyan,
      );
      addNeonStrip(
        scene,
        new THREE.Vector3(halfRoom, ceilY, z - wallSegmentSize / 2),
        new THREE.Vector3(halfRoom, ceilY, z + wallSegmentSize / 2),
        neonCyan,
      );
    }

    // Ceiling glowing coil sculpture
    const coilGeo = new THREE.TorusKnotGeometry(2, 0.3, 100, 16);
    const coilMat = new THREE.MeshStandardMaterial({
      color: neonCyan,
      emissive: neonCyan,
      emissiveIntensity: 2,
      metalness: 0.2,
      roughness: 0.5,
    });
    const coil = new THREE.Mesh(coilGeo, coilMat);
    coil.position.set(0, ceilY - 0.5, 0);
    scene.add(coil);

    /* -------------------- FLOOR & RUG -------------------- */
    // Light stone tiles (canvas texture)
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = floorCanvas.height = 512;
    const ctx = floorCanvas.getContext('2d')!;
    ctx.fillStyle = '#ddd';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.02})`;
      ctx.fillRect(
        Math.random() * 512,
        Math.random() * 512,
        Math.random() * 2 + 0.5,
        Math.random() * 2 + 0.5,
      );
    }
    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(10, 10);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.9,
    });
    const floorGeo = new THREE.PlaneGeometry(50, 50);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);

    // Pale rug under lounge
    const rugMat = new THREE.MeshStandardMaterial({
      color: '#e0e0e0',
      roughness: 0.7,
    });
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 4),
      rugMat,
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.01, 5);
    scene.add(rug);

    /* -------------------- WALLS -------------------- */
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.9,
    });
    const wallGeo = new THREE.PlaneGeometry(10, 4);
    const makeWall = (
      key: string,
      pos: THREE.Vector3,
      rotY: number,
      graffiti = false,
    ) => {
      const mesh = new THREE.Mesh(wallGeo, wallMat.clone());
      mesh.position.copy(pos);
      mesh.rotation.y = rotY;
      scene.add(mesh);
      wallMeshesRef.current.set(key, mesh);
      if (graffiti) {
        const graff = document.createElement('canvas');
        graff.width = graff.height = 512;
        const gctx = graff.getContext('2d')!;
        gctx.fillStyle = '#222';
        gctx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 80; i++) {
          gctx.fillStyle = `hsl(${Math.random() * 360},80%,50%)`;
          gctx.beginPath();
          gctx.arc(
            Math.random() * 512,
            Math.random() * 512,
            Math.random() * 30 + 10,
            0,
            Math.PI * 2,
          );
          gctx.fill();
        }
        const tex = new THREE.CanvasTexture(graff);
        (mesh.material as THREE.MeshStandardMaterial).map = tex;
      }
    };
    const half = 25;
    const wallY = 2;
    makeWall('north-wall-0', new THREE.Vector3(0, wallY, -half), 0);
    makeWall('south-wall-0', new THREE.Vector3(0, wallY, half), Math.PI);
    makeWall('east-wall-0', new THREE.Vector3(half, wallY, 0), -Math.PI / 2, true); // graffiti on east wall
    makeWall('west-wall-0', new THREE.Vector3(-half, wallY, 0), Math.PI / 2);

    /* -------------------- LOUNGE AREA -------------------- */
    const couchMat = new THREE.MeshStandardMaterial({
      color: '#111111',
      metalness: 0.1,
      roughness: 0.8,
    });
    const seatGeo = new THREE.BoxGeometry(2.5, 0.5, 1);
    const backGeo = new THREE.BoxGeometry(2.5, 1, 0.2);
    const leftArm = new THREE.Mesh(seatGeo, couchMat);
    leftArm.position.set(-1.75, 0.25, 5);
    scene.add(leftArm);
    const rightArm = new THREE.Mesh(seatGeo, couchMat);
    rightArm.position.set(1.75, 0.25, 5);
    scene.add(rightArm);
    const back = new THREE.Mesh(backGeo, couchMat);
    back.position.set(0, 0.75, 5.75);
    scene.add(back);
    const centre = new THREE.Mesh(seatGeo, couchMat);
    centre.scale.set(1.5, 1, 1);
    centre.position.set(0, 0.25, 5);
    scene.add(centre);

    // Couch under‑glow (soft cyan)
    const couchLight = new THREE.RectAreaLight(neonCyan, 4, 6, 2);
    couchLight.position.set(0, 0.01, 5);
    couchLight.rotation.x = -Math.PI / 2;
    scene.add(couchLight);

    // Small round table
    const tableGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 32);
    const tableMat = new THREE.MeshStandardMaterial({
      color: '#222222',
      metalness: 0.2,
      roughness: 0.7,
    });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.position.set(0, 0.1, 5);
    scene.add(table);

    // Neon‑lit planter
    const coneGeo = new THREE.ConeGeometry(0.4, 0.6, 16);
    const coneMat = new THREE.MeshStandardMaterial({
      color: '#111111',
      metalness: 0.1,
      roughness: 0.9,
    });
    const planter = new THREE.Mesh(coneGeo, coneMat);
    planter.position.set(-3, 0.3, 2);
    scene.add(planter);
    const plantGlow = new THREE.PointLight(neonMagenta, 2, 5);
    plantGlow.position.set(-3, 1, 2);
    scene.add(plantGlow);

    // Silhouette visitors (cylinders + spheres)
    const visitorMat = new THREE.MeshStandardMaterial({
      color: '#111111',
    });
    for (let i = 0; i < 3; i++) {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 1.6, 12),
        visitorMat,
      );
      body.position.set(-5 + i * 2.5, 0.8, -8);
      scene.add(body);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 12, 12),
        visitorMat,
      );
      head.position.set(body.position.x, 1.7, body.position.z);
      scene.add(head);
    }

    /* ------------------------------------------------------------
       PANEL SETUP (geometry, arrows, text meshes, neon frame)
       ------------------------------------------------------------ */
    const panelGeometry = new THREE.PlaneGeometry(2, 2);
    const panelMaterial = new THREE.MeshBasicMaterial({
      color: 0x333333,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.15);
    arrowShape.lineTo(0.3, 0);
    arrowShape.lineTo(0, -0.15);
    arrowShape.lineTo(0, 0.15);
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const ARROW_COLOR_DEFAULT = 0xcccccc;
    const ARROW_COLOR_HOVER = 0x00ff00;
    const arrowMaterial = new THREE.MeshBasicMaterial({
      color: ARROW_COLOR_DEFAULT,
      side: THREE.DoubleSide,
    });

    // Helpers for text panels
    const createTextPanelMaterial = () =>
      new THREE.MeshBasicMaterial({
        map: null,
        transparent: true,
        side: THREE.DoubleSide,
        alphaTest: 0.01,
        depthWrite: false,
      });

    // Text geometry (re‑used for title, description, attributes)
    const TITLE_HEIGHT = 0.5;
    const TEXT_PANEL_WIDTH = 2.5;
    const DESCRIPTION_HEIGHT = 1.5;
    const ATTRIBUTES_HEIGHT = 1.5;
    const DESCRIPTION_PANEL_HEIGHT = TITLE_HEIGHT + DESCRIPTION_HEIGHT;
    const titleGeometry = new THREE.PlaneGeometry(4.0, TITLE_HEIGHT);
    const descriptionGeometry = new THREE.PlaneGeometry(
      TEXT_PANEL_WIDTH,
      DESCRIPTION_PANEL_HEIGHT,
    );
    const attributesGeometry = new THREE.PlaneGeometry(
      TEXT_PANEL_WIDTH,
      ATTRIBUTES_HEIGHT,
    );
    const wallTitleGeometry = new THREE.PlaneGeometry(8, 0.75);

    // Build panel configs (walls + inner rooms)
    const dynamicPanelConfigs: {
      wallName: keyof typeof GALLERY_PANEL_CONFIG;
      position: [number, number, number];
      rotation: [number, number, number];
      textOffsetSign: number;
    }[] = [];
    const WALL_NAMES = ['north-wall', 'south-wall', 'east-wall', 'west-wall'];
    const MAX_SEGMENT_INDEX = 4; // segments 0‑4 (5 total)
    const wallSegmentSizePanel = 10; // <-- renamed to avoid duplicate
    for (let i = 0; i <= MAX_SEGMENT_INDEX; i++) {
      for (const wallBase of WALL_NAMES) {
        const panelKey = `${wallBase}-${i}` as keyof typeof GALLERY_PANEL_CONFIG;
        let x = 0,
          z = 0,
          rot: [number, number, number] = [0, 0, 0];
        const centerIdx = i - 2; // -2…2 => positions -20…20
        const segPos = centerIdx * wallSegmentSizePanel;
        if (wallBase === 'north-wall') {
          x = segPos;
          z = -half;
          rot = [0, 0, 0];
        } else if (wallBase === 'south-wall') {
          x = segPos;
          z = half;
          rot = [0, Math.PI, 0];
        } else if (wallBase === 'east-wall') {
          x = half;
          z = segPos;
          rot = [0, -Math.PI / 2, 0];
        } else {
          x = -half;
          z = segPos;
          rot = [0, Math.PI / 2, 0];
        }
        dynamicPanelConfigs.push({
          wallName: panelKey,
          position: [x, 1.8, z],
          rotation: rot,
          textOffsetSign: 1,
        });
      }
    }

    // Helper for neon frame around a panel
    const createNeonFrame = (panel: any) => {
      const geo = new THREE.TorusGeometry(1.2, 0.08, 16, 100);
      const mat = new THREE.MeshBasicMaterial({
        color: neonCyan,
        transparent: true,
        opacity: 0.8,
      });
      const frame = new THREE.Mesh(geo, mat);
      frame.scale.set(1.1, 1.1, 1);
      frame.position.copy(panel.mesh.position);
      frame.rotation.copy(panel.mesh.rotation);
      scene.add(frame);
      panel.neonFrame = frame;
    };

    // Build all panels
    dynamicPanelConfigs.forEach((cfg) => {
      const mesh = new THREE.Mesh(panelGeometry, panelMaterial.clone());
      mesh.position.set(...cfg.position);
      mesh.rotation.set(...cfg.rotation);
      scene.add(mesh);

      // arrows
      const wallAxis =
        cfg.rotation[1] === 0 || cfg.rotation[1] === Math.PI ? 'z' : 'x';
      const rightVec = new THREE.Vector3(1, 0, 0).applyEuler(
        new THREE.Euler(...cfg.rotation, 'XYZ'),
      );
      const upVec = new THREE.Vector3(0, 1, 0).applyEuler(
        new THREE.Euler(...cfg.rotation, 'XYZ'),
      );
      const forwardVec = new THREE.Vector3(0, 0, 1).applyEuler(
        new THREE.Euler(...cfg.rotation, 'XYZ'),
      );
      const basePos = new THREE.Vector3(...cfg.position);
      const ARROW_PANEL_OFFSET = 1.5;

      const prevArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      prevArrow.rotation.set(...cfg.rotation);
      prevArrow.rotation.y += Math.PI; // point left
      prevArrow.position
        .copy(basePos)
        .addScaledVector(rightVec, -ARROW_PANEL_OFFSET);
      scene.add(prevArrow);

      const nextArrow = new THREE.Mesh(arrowGeometry, arrowMaterial.clone());
      nextArrow.rotation.set(...cfg.rotation);
      nextArrow.position
        .copy(basePos)
        .addScaledVector(rightVec, ARROW_PANEL_OFFSET);
      scene.add(nextArrow);

      // Title mesh (collection name)
      const titleMesh = new THREE.Mesh(
        titleGeometry,
        createTextPanelMaterial(),
      );
      titleMesh.rotation.set(...cfg.rotation);
      const titleYOffset = -1 - TITLE_HEIGHT / 2 - 0.1;
      const titlePos = basePos
        .clone()
        .addScaledVector(upVec, titleYOffset)
        .addScaledVector(forwardVec, 0.16);
      titleMesh.position.copy(titlePos);
      titleMesh.visible = false;
      scene.add(titleMesh);

      // Description mesh
      const descriptionMesh = new THREE.Mesh(
        descriptionGeometry,
        createTextPanelMaterial(),
      );
      descriptionMesh.rotation.set(...cfg.rotation);
      const descPos = basePos
        .clone()
        .addScaledVector(rightVec, -3.25 * cfg.textOffsetSign)
        .addScaledVector(forwardVec, 0.16);
      descriptionMesh.position.copy(descPos);
      descriptionMesh.visible = false;
      scene.add(descriptionMesh);

      // Attributes mesh
      const attributesMesh = new THREE.Mesh(
        attributesGeometry,
        createTextPanelMaterial(),
      );
      attributesMesh.rotation.set(...cfg.rotation);
      const attribPos = basePos
        .clone()
        .addScaledVector(rightVec, 3.25 * cfg.textOffsetSign)
        .addScaledVector(forwardVec, 0.16);
      attributesMesh.position.copy(attribPos);
      attributesMesh.visible = false;
      scene.add(attributesMesh);

      // Wall title (collection name above panel)
      const wallTitleMesh = new THREE.Mesh(
        wallTitleGeometry,
        createTextPanelMaterial(),
      );
      wallTitleMesh.rotation.set(...cfg.rotation);
      const wallTitlePos = new THREE.Vector3(...cfg.position);
      wallTitlePos.y = 3.2;
      wallTitleMesh.position.copy(wallTitlePos);
      wallTitleMesh.visible = false;
      scene.add(wallTitleMesh);

      const panelObj = {
        mesh,
        wallName: cfg.wallName,
        metadataUrl: '',
        isVideo: false,
        isGif: false,
        prevArrow,
        nextArrow,
        titleMesh,
        descriptionMesh,
        attributesMesh,
        wallTitleMesh,
        currentDescription: '',
        descriptionScrollY: 0,
        descriptionTextHeight: 0,
        currentAttributes: [] as NftAttribute[],
        videoElement: null as HTMLVideoElement | null,
        gifStopFunction: null as (() => void) | null,
        neonFrame: null as THREE.Mesh | null,
      };
      panelsRef.current.push(panelObj);
      createNeonFrame(panelObj);
    });

    /* ------------------------------------------------------------
       TEXTURE / VIDEO LOADING (including GIF handling)
       ------------------------------------------------------------ */
    const isVideoContent = (type: string, url: string) =>
      !!(
        type.startsWith('video/') ||
        url.match(/\.(mp4|webm|ogg)(\?|$)/i)
      );
    const isGifContent = (type: string, url: string) =>
      !!(type === 'image/gif' || url.match(/\.gif(\?|$)/i));

    const disposeTextureSafely = (mesh: THREE.Mesh) => {
      if (mesh.material instanceof THREE.MeshBasicMaterial) {
        if (mesh.material.map && typeof mesh.material.map.dispose === 'function')
          mesh.material.map.dispose();
        mesh.material.dispose();
      }
    };

    const loadTexture = useCallback(
      async (
        url: string,
        panel: any,
        contentType: string,
      ): Promise<THREE.Texture | THREE.VideoTexture> => {
        const isVid = isVideoContent(contentType, url);
        const isGif = isGifContent(contentType, url);

        // clean previous media
        if (panel.videoElement) {
          panel.videoElement.pause();
          panel.videoElement.removeAttribute('src');
          panel.videoElement = null;
        }
        if (panel.gifStopFunction) {
          panel.gifStopFunction();
          panel.gifStopFunction = null;
        }

        if (isVid) {
          return new Promise((resolve) => {
            const video = document.createElement('video');
            video.playsInline = true;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.style.display = 'none';
            video.crossOrigin = 'anonymous';
            panel.videoElement = video;
            video.src = url;
            video.load();

            if ((window as any).galleryControls?.isLocked?.()) {
              video.play().catch(() => {});
            }

            const vt = new THREE.VideoTexture(video);
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
            console.error('GIF load failed, falling back to image loader', e);
          }
        }

        // fallback – normal image
        return new Promise((resolve, reject) => {
          const loader = new THREE.TextureLoader();
          loader.setCrossOrigin('anonymous');
          loader.load(
            url,
            (tex) => resolve(tex),
            undefined,
            (err) => {
              console.error('Image load error', err);
              showError(`Failed to load image ${url.slice(0, 30)}…`);
              reject(err);
            },
          );
        });
      },
      [],
    );

    /* ------------------------------------------------------------
       PANEL CONTENT UPDATE (includes neon back‑light frame)
       ------------------------------------------------------------ */
    const updatePanelContent = useCallback(
      async (panel: any, source: NftSource | null) => {
        const collConfig = GALLERY_PANEL_CONFIG[panel.wallName];
        const collectionName = collConfig?.name || '...';
        const textColor = collConfig?.text_color || 'white';

        // ---- Wall title (collection name) ----
        disposeTextureSafely(panel.wallTitleMesh);
        const { texture: wallTitleTex } = createTextTexture(
          collectionName,
          8,
          0.75,
          120,
          textColor,
          { wordWrap: false },
        );
        (panel.wallTitleMesh.material as THREE.MeshBasicMaterial).map =
          wallTitleTex;
        panel.wallTitleMesh.visible = true;

        // ---- Reset panel to placeholder ----
        disposeTextureSafely(panel.mesh);
        panel.mesh.material = new THREE.MeshBasicMaterial({
          color: 0x333333,
        });
        panel.metadataUrl = '';
        panel.isVideo = false;
        panel.isGif = false;
        panel.titleMesh.visible = false;
        panel.descriptionMesh.visible = false;
        panel.attributesMesh.visible = false;
        if (panel.videoElement) {
          panel.videoElement.pause();
          panel.videoElement.removeAttribute('src');
          panel.videoElement = null;
        }
        if (panel.gifStopFunction) {
          panel.gifStopFunction();
          panel.gifStopFunction = null;
        }

        // ---- Blank panel (no NFT) ----
        if (!source || source.contractAddress === '') {
          const showArrows =
            collConfig && collConfig.tokenIds.length > 1;
          panel.prevArrow.visible = showArrows;
          panel.nextArrow.visible = showArrows;
          return;
        }

        // ---- Fetch metadata (cached) ----
        const meta = await getCachedNftMetadata(
          source.contractAddress,
          source.tokenId,
        );

        if (!meta) {
          console.warn(
            `Metadata fetch failed for ${source.contractAddress}/${source.tokenId}`,
          );
          const { texture } = createTextTexture(
            'NFT Unavailable',
            2,
            2,
            80,
            'red',
            { wordWrap: false },
          );
          panel.mesh.material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
          });
          return;
        }

        try {
          const contentUrl = meta.contentUrl;
          const isVid = isVideoContent(meta.contentType, contentUrl);
          const isGif = isGifContent(meta.contentType, contentUrl);
          const tex = await loadTexture(contentUrl, panel, meta.contentType);

          // Main NFT texture
          disposeTextureSafely(panel.mesh);
          panel.mesh.material = new THREE.MeshBasicMaterial({ map: tex });

          panel.metadataUrl = meta.source;
          panel.isVideo = isVid;
          panel.isGif = isGif;

          // Title
          disposeTextureSafely(panel.titleMesh);
          const { texture: titleTex } = createTextTexture(
            meta.title,
            4,
            TITLE_HEIGHT,
            120,
            textColor,
            { wordWrap: false },
          );
          (panel.titleMesh.material as THREE.MeshBasicMaterial).map = titleTex;
          panel.titleMesh.visible = true;

          // Description (scrollable)
          disposeTextureSafely(panel.descriptionMesh);
          const {
            texture: descTex,
            totalHeight,
          } = createTextTexture(
            meta.description,
            TEXT_PANEL_WIDTH,
            DESCRIPTION_PANEL_HEIGHT,
            30,
            textColor,
            { wordWrap: true },
          );
          (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map =
            descTex;
          panel.descriptionMesh.visible = true;
          panel.currentDescription = meta.description;
          panel.descriptionTextHeight = totalHeight ?? 0;
          panel.descriptionScrollY = 0;

          // Attributes
          disposeTextureSafely(panel.attributesMesh);
          const { texture: attrTex } = createAttributesTextTexture(
            meta.attributes || [],
            TEXT_PANEL_WIDTH,
            ATTRIBUTES_HEIGHT,
            40,
            textColor,
          );
          (panel.attributesMesh.material as THREE.MeshBasicMaterial).map = attrTex;
          panel.attributesMesh.visible = true;

          showSuccess(
            isVid
              ? `Loaded video NFT: ${meta.title}`
              : isGif
              ? `Loaded GIF NFT: ${meta.title}`
              : `Loaded image NFT: ${meta.title}`,
          );
        } catch (e) {
          console.error('Error updating panel', e);
          showError('Failed to load NFT content');
        }

        // ---- Arrow visibility based on collection size ----
        const showArrows =
          collConfig && collConfig.tokenIds.length > 1;
        panel.prevArrow.visible = showArrows;
        panel.nextArrow.visible = showArrows;
      },
      [loadTexture],
    );

    /* ------------------------------------------------------------
       INITIALIZE GALLERY CONFIG & PANEL CONTENT
       ------------------------------------------------------------ */
    const initAndLoad = async () => {
      await initializeGalleryConfig();

      // apply wall colours from config
      for (const [key, cfg] of Object.entries(GALLERY_PANEL_CONFIG)) {
        const wall = wallMeshesRef.current.get(key);
        if (wall && cfg.wall_color) {
          (wall.material as THREE.MeshStandardMaterial).color.set(
            cfg.wall_color,
          );
        }
      }

      // sequentially load each panel (rate‑limit friendly)
      for (const panel of panelsRef.current) {
        const src = getCurrentNftSource(panel.wallName);
        await updatePanelContent(panel, src);
        await new Promise((r) => setTimeout(r, 100)); // tiny pause
      }
    };
    initAndLoad();

    /* ------------------------------------------------------------
       INTERACTION (raycasting, mouse, keyboard)
       ------------------------------------------------------------ */
    let moveForward = false,
      moveBackward = false,
      moveLeft = false,
      moveRight = false;
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const speed = 20;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') moveForward = true;
      if (e.code === 'KeyS') moveBackward = true;
      if (e.code === 'KeyA') moveLeft = true;
      if (e.code === 'KeyD') moveRight = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') moveForward = false;
      if (e.code === 'KeyS') moveBackward = false;
      if (e.code === 'KeyA') moveLeft = false;
      if (e.code === 'KeyD') moveRight = false;
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(); // centre of screen
    let currentTargetedPanel: any = null;
    let currentTargetedArrow: any = null;
    let currentTargetedDescriptionPanel: any = null;

    const onMouseDown = () => {
      if (!controls.isLocked) return;

      if (currentTargetedArrow) {
        const panel = panelsRef.current.find(
          (p) =>
            p.prevArrow === currentTargetedArrow ||
            p.nextArrow === currentTargetedArrow,
        );
        if (panel) {
          const dir =
            panel.prevArrow === currentTargetedArrow ? 'prev' : 'next';
          if (updatePanelIndex(panel.wallName, dir)) {
            const src = getCurrentNftSource(panel.wallName);
            updatePanelContent(panel, src);
          }
        }
        return;
      }

      if (currentTargetedPanel) {
        const src = getCurrentNftSource(currentTargetedPanel.wallName);
        if (src) {
          setMarketBrowserState({
            open: true,
            collection: src.contractAddress,
            tokenId: src.tokenId,
          });
          controls.unlock();
        }
      }
    };
    document.addEventListener('mousedown', onMouseDown);

    const onWheel = (e: WheelEvent) => {
      if (!controls.isLocked || !currentTargetedDescriptionPanel) return;
      const panel = currentTargetedDescriptionPanel;
      const delta = e.deltaY * 0.5;
      const canvasH = 512;
      const pad = 40;
      const visibleH = canvasH - 2 * pad;
      const maxScroll = Math.max(0, panel.descriptionTextHeight - visibleH);
      panel.descriptionScrollY = Math.min(
        maxScroll,
        Math.max(0, panel.descriptionScrollY + delta),
      );

      const { texture } = createTextTexture(
        panel.currentDescription,
        TEXT_PANEL_WIDTH,
        DESCRIPTION_PANEL_HEIGHT,
        30,
        GALLERY_PANEL_CONFIG[panel.wallName]?.text_color || 'white',
        { wordWrap: true, scrollY: panel.descriptionScrollY },
      );
      (panel.descriptionMesh.material as THREE.MeshBasicMaterial).map = texture;
    };
    document.addEventListener('wheel', onWheel);

    const animate = () => {
      requestAnimationFrame(animate);
      const delta = Math.min(0.05, renderer.info.render.frame / 1000);

      if (controls.isLocked) {
        // movement
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

        const bound = half - 0.5;
        const prevPos = camera.position.clone();
        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, -bound, bound);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, -bound, bound);
        camera.position.y = 1.6;

        // raycast for hover detection
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(
          panelsRef.current.flatMap((p) => [
            p.mesh,
            p.prevArrow,
            p.nextArrow,
            p.descriptionMesh,
          ]),
        );

        // reset hover colors
        panelsRef.current.forEach((p) => {
          (p.prevArrow.material as THREE.MeshBasicMaterial).color.set(
            ARROW_COLOR_DEFAULT,
          );
          (p.nextArrow.material as THREE.MeshBasicMaterial).color.set(
            ARROW_COLOR_DEFAULT,
          );
        });
        currentTargetedPanel = null;
        currentTargetedArrow = null;
        currentTargetedDescriptionPanel = null;

        if (hits.length > 0 && hits[0].distance < 5) {
          const obj = hits[0].object as THREE.Mesh;
          const panel = panelsRef.current.find(
            (p) =>
              p.mesh === obj ||
              p.prevArrow === obj ||
              p.nextArrow === obj ||
              p.descriptionMesh === obj,
          );
          if (panel) {
            if (obj === panel.mesh) currentTargetedPanel = panel;
            else if (obj === panel.prevArrow || obj === panel.nextArrow) {
              currentTargetedArrow = obj;
              (obj.material as THREE.MeshBasicMaterial).color.set(
                ARROW_COLOR_HOVER,
              );
            } else if (obj === panel.descriptionMesh) {
              currentTargetedDescriptionPanel = panel;
            }
          }
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    /* ------------------------------------------------------------
       RESIZE & CLEANUP
       ------------------------------------------------------------ */
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

      // clean up media
      panelsRef.current.forEach((p) => {
        if (p.videoElement) {
          p.videoElement.pause();
          p.videoElement.removeAttribute('src');
        }
        if (p.gifStopFunction) p.gifStopFunction();
        if (p.neonFrame) p.neonFrame.geometry.dispose();
      });

      // dispose three.js resources
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => {
              if (m.map) m.map.dispose();
              m.dispose();
            });
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
  }, [setInstructionsVisible]);

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