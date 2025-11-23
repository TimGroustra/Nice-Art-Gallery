import * as THREE from 'three';
import { PointerLockControls } from 'three-stdlib';

export function createSceneAndCamera() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaaaaaa);
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, -20);
    return { scene, camera };
}

export function createRenderer(mount: HTMLDivElement) {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);
    return renderer;
}

export function createControls(camera: THREE.Camera, domElement: HTMLElement) {
    return new PointerLockControls(camera, domElement);
}