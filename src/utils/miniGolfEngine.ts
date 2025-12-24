"use client";

import * as THREE from 'three';

export interface GolfGameState {
  ball: THREE.Mesh;
  hole: THREE.Mesh;
  obstacles: THREE.Mesh[];
  velocity: THREE.Vector3;
  isMoving: boolean;
  score: number;
  initialPos: THREE.Vector3;
  platformY: number;
  rampBox: THREE.Box3;
}

const BALL_RADIUS = 0.15;
const FRICTION = 0.985;
const BOUNCE = 0.6;
const MIN_SPEED = 0.01;
const HIT_FORCE = 12;
const GRAVITY = 15;

const BOUNDS = 14.8; 

export function createMiniGolf(scene: THREE.Scene, platformY: number): GolfGameState {
  const wallColor = 0x89CFF0; // Baby Blue
  const turfColor = 0x2d5a27; // Deep turf green

  // 1. Turf Floor
  const turfGeo = new THREE.PlaneGeometry(30, 30);
  const turfMat = new THREE.MeshStandardMaterial({ color: turfColor, roughness: 0.9 });
  const turf = new THREE.Mesh(turfGeo, turfMat);
  turf.rotation.x = -Math.PI / 2;
  turf.position.set(0, platformY + 0.02, 0);
  scene.add(turf);

  // 2. Ball
  const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 16, 16);
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  const startPos = new THREE.Vector3(12, platformY + BALL_RADIUS + 0.05, 12);
  ball.position.copy(startPos);
  ball.userData = { isGolfBall: true };
  scene.add(ball);

  // 3. Hole
  const holeGeo = new THREE.CircleGeometry(0.45, 32);
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const hole = new THREE.Mesh(holeGeo, holeMat);
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(-12, platformY + 0.03, -12);
  scene.add(hole);

  // 4. Obstacles
  const obstacles: THREE.Mesh[] = [];
  const railMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.3, metalness: 0.2 });

  const createRail = (w: number, h: number, d: number, x: number, z: number, ry = 0) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), railMat);
    rail.position.set(x, platformY + h/2 + 0.02, z);
    rail.rotation.y = ry;
    scene.add(rail);
    obstacles.push(rail);
    return rail;
  };

  // Outer Perimeter
  createRail(30, 1, 0.4, 0, 15);
  createRail(30, 1, 0.4, 0, -15);
  createRail(0.4, 1, 30, 15, 0);
  createRail(0.4, 1, 30, -15, 0);

  // Sequential Path: Maze -> Ramp -> Tunnel
  // Maze Walls
  createRail(15, 1, 0.4, 7.5, 8); // Blocks direct path to center
  createRail(15, 1, 0.4, -7.5, 4, Math.PI / 4); // Angled bounce wall

  // The Ramp (0,0 region)
  const rampGeo = new THREE.BoxGeometry(6, 1.5, 10);
  const rampMat = new THREE.MeshStandardMaterial({ color: 0x3d7a37, roughness: 0.8 });
  const ramp = new THREE.Mesh(rampGeo, rampMat);
  ramp.position.set(0, platformY + 0.2, 0);
  ramp.rotation.x = -0.15; // Sloped
  scene.add(ramp);
  const rampBox = new THREE.Box3().setFromObject(ramp);

  // Tunnel Lane
  createRail(0.4, 1, 10, -4, -5); 
  createRail(0.4, 1, 10, 4, -5); 

  // Tunnel Visual
  const tunnelMat = new THREE.MeshStandardMaterial({ color: wallColor, side: THREE.DoubleSide });
  const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 8, 16, 1, true), tunnelMat);
  tunnel.rotation.x = Math.PI / 2;
  tunnel.position.set(0, platformY + 1.2, -10);
  scene.add(tunnel);

  return {
    ball,
    hole,
    obstacles,
    velocity: new THREE.Vector3(),
    isMoving: false,
    score: 0,
    initialPos: startPos,
    platformY,
    rampBox
  };
}

export function updateMiniGolf(state: GolfGameState, delta: number) {
  if (delta > 0.05) return;

  if (!state.isMoving && state.velocity.length() < MIN_SPEED) {
    state.velocity.set(0, 0, 0);
    return;
  }

  state.isMoving = true;

  // Potential next position
  const nextPos = state.ball.position.clone().add(state.velocity.clone().multiplyScalar(delta));

  // 1. Boundary / Wall collisions
  state.obstacles.forEach(obs => {
    const ballBox = new THREE.Box3().setFromCenterAndSize(nextPos, new THREE.Vector3(BALL_RADIUS*2, BALL_RADIUS*2, BALL_RADIUS*2));
    const obsBox = new THREE.Box3().setFromObject(obs);

    if (obsBox.intersectsBox(ballBox)) {
      // Basic AABB reflection
      const diff = nextPos.clone().sub(obs.position);
      if (Math.abs(diff.x) > Math.abs(diff.z)) {
        state.velocity.x *= -BOUNCE;
      } else {
        state.velocity.z *= -BOUNCE;
      }
    }
  });

  // 2. Ramp Physics (Y-axis and slope acceleration)
  const onRamp = state.rampBox.containsPoint(nextPos);
  if (onRamp) {
    // Ball rolls up/down based on ramp slope
    state.velocity.z -= GRAVITY * 0.1 * delta; // Constant downward pull on slope
    // Adjust Y height based on Z position relative to ramp center
    const relativeZ = (nextPos.z - state.rampBox.getCenter(new THREE.Vector3()).z) / 10;
    nextPos.y = state.platformY + BALL_RADIUS + (0.5 - relativeZ * 1.5);
  } else {
    // Return to flat ground
    nextPos.y = THREE.MathUtils.lerp(nextPos.y, state.platformY + BALL_RADIUS + 0.05, 0.1);
  }

  // 3. Check Hole
  const distToHole = new THREE.Vector2(nextPos.x, nextPos.z).distanceTo(new THREE.Vector2(state.hole.position.x, state.hole.position.z));
  if (distToHole < 0.45 && !onRamp) {
    state.ball.scale.multiplyScalar(0.9); // Absorption animation
    state.velocity.multiplyScalar(0.8);
    
    if (state.ball.scale.x < 0.1) {
      state.score++;
      state.ball.scale.set(1, 1, 1);
      state.ball.position.copy(state.initialPos);
      state.velocity.set(0, 0, 0);
      state.isMoving = false;
      return;
    }
  }

  // Apply final position
  state.ball.position.copy(nextPos);

  // Friction
  state.velocity.multiplyScalar(FRICTION);

  // Stop check
  if (state.velocity.length() < MIN_SPEED) {
    state.velocity.set(0, 0, 0);
    state.isMoving = false;
  }
}

export function hitBall(state: GolfGameState, camera: THREE.Camera) {
  if (state.isMoving) return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();
  state.velocity.copy(dir).multiplyScalar(HIT_FORCE);
  state.isMoving = true;
}