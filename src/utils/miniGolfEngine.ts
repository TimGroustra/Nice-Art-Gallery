"use client";

import * as THREE from 'three';

export interface GolfGameState {
  ball: THREE.Mesh;
  hole: THREE.Mesh;
  walls: THREE.Mesh[];
  velocity: THREE.Vector3;
  isMoving: boolean;
  score: number;
  initialPos: THREE.Vector3;
  groundY: number;
  platformY: number;
  platformBox: THREE.Box3;
  rampBox: THREE.Box3;
}

const BALL_RADIUS = 0.15;
const FRICTION = 0.985;
const BOUNCE = 0.6;
const MIN_SPEED = 0.01;
const HIT_FORCE = 12;
const GRAVITY = 15;

export function createMiniGolf(scene: THREE.Scene, baseLevelY: number): GolfGameState {
  const wallColor = 0x89CFF0; // Baby Blue
  const turfColor = 0x2d5a27; // Deep turf green
  const platformHeight = 1.5;
  const platformY = baseLevelY + platformHeight;

  // 1. Turf Floor (Ground Level)
  const turfGeo = new THREE.PlaneGeometry(30, 30);
  const turfMat = new THREE.MeshStandardMaterial({ color: turfColor, roughness: 0.9 });
  const turf = new THREE.Mesh(turfGeo, turfMat);
  turf.rotation.x = -Math.PI / 2;
  turf.position.set(0, baseLevelY + 0.01, 0);
  scene.add(turf);

  // 2. Elevated Platform
  // Positioned in the North-West corner
  const platGeo = new THREE.BoxGeometry(10, platformHeight, 10);
  const platMat = new THREE.MeshStandardMaterial({ color: 0x3d7a37, roughness: 0.8 });
  const platform = new THREE.Mesh(platGeo, platMat);
  platform.position.set(-10, baseLevelY + platformHeight / 2, -10);
  scene.add(platform);
  const platformBox = new THREE.Box3().setFromObject(platform);

  // 3. Ramp
  // The platform edge is at Z = -5. The ramp starts at Z = 3 (floor).
  // Length is 8 units on Z axis, height rise is 1.5 units.
  const rampDepth = 8;
  const rampWidth = 6;
  const rampThickness = 0.2;
  const angle = Math.atan(platformHeight / rampDepth);
  const actualLength = Math.sqrt(rampDepth ** 2 + platformHeight ** 2);
  
  const rampGeo = new THREE.BoxGeometry(rampWidth, rampThickness, actualLength);
  const ramp = new THREE.Mesh(rampGeo, platMat);
  
  // Center of ramp on Z is at (3 + -5) / 2 = -1
  // Center of ramp on Y is at (baseLevelY + platformY) / 2
  ramp.position.set(-10, (baseLevelY + platformY) / 2, -1);
  ramp.rotation.x = angle; 
  scene.add(ramp);
  const rampBox = new THREE.Box3().setFromObject(ramp);

  // 4. Labyrinth Walls & Guard Rails
  const walls: THREE.Mesh[] = [];
  const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.3, metalness: 0.2 });

  const createWall = (w: number, h: number, d: number, x: number, z: number, ry = 0) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    // Determine if wall belongs to platform or ground
    const isNorth = z < -5;
    const yPos = isNorth ? platformY + h/2 : baseLevelY + h/2;
    wall.position.set(x, yPos, z);
    wall.rotation.y = ry;
    scene.add(wall);
    walls.push(wall);
    return wall;
  };

  // Outer Perimeter
  createWall(30, 1, 0.4, 0, 15);     // South
  createWall(10, 1, 0.4, 10, -15);   // North (Ground part)
  createWall(0.4, 1, 30, 15, 0);     // East
  createWall(0.4, 1, 10, -15, 10);   // West (Ground part)

  // Platform Guard Rails
  createWall(10, 1, 0.4, -10, -15);  // North edge
  createWall(0.4, 1, 10, -15, -10);  // West edge
  createWall(0.4, 1, 10, -5, -10);   // East edge (platform)

  // Labyrinth (on ground)
  createWall(10, 1, 0.4, 5, 10);     
  createWall(10, 1, 0.4, -5, 5);     
  createWall(10, 1, 0.4, 5, 0);      
  createWall(0.4, 1, 5, 0, 7.5);     

  // 5. Ball
  const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 16, 16);
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  const startPos = new THREE.Vector3(12, baseLevelY + BALL_RADIUS + 0.05, 12);
  ball.position.copy(startPos);
  ball.userData = { isGolfBall: true };
  scene.add(ball);

  // 6. Hole
  const holeGeo = new THREE.CircleGeometry(0.4, 32);
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const hole = new THREE.Mesh(holeGeo, holeMat);
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(-10, platformY + 0.02, -10);
  scene.add(hole);

  return {
    ball,
    hole,
    walls,
    velocity: new THREE.Vector3(),
    isMoving: false,
    score: 0,
    initialPos: startPos,
    groundY: baseLevelY,
    platformY,
    platformBox,
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

  const nextPos = state.ball.position.clone().add(state.velocity.clone().multiplyScalar(delta));

  // 1. Wall Collisions
  const ballBox = new THREE.Box3();
  state.walls.forEach(wall => {
    ballBox.setFromCenterAndSize(nextPos, new THREE.Vector3(BALL_RADIUS*2, BALL_RADIUS*2, BALL_RADIUS*2));
    const wallBox = new THREE.Box3().setFromObject(wall);

    if (wallBox.intersectsBox(ballBox)) {
      const diff = nextPos.clone().sub(wall.position);
      if (Math.abs(diff.x) > Math.abs(diff.z)) {
        state.velocity.x *= -BOUNCE;
      } else {
        state.velocity.z *= -BOUNCE;
      }
    }
  });

  // 2. Physics / Elevation
  const onPlatform = state.platformBox.containsPoint(nextPos);
  const onRamp = state.rampBox.containsPoint(nextPos);

  if (onPlatform) {
    nextPos.y = state.platformY + BALL_RADIUS;
  } else if (onRamp) {
    // Correct lerp from floor (Z=3) to platform (Z=-5)
    const t = (nextPos.z - 3) / (-5 - 3);
    nextPos.y = THREE.MathUtils.lerp(state.groundY, state.platformY, t) + BALL_RADIUS;
    
    // Slope gravity (pulls ball down toward Z=3)
    state.velocity.z += GRAVITY * 0.2 * delta; 
  } else {
    nextPos.y = state.groundY + BALL_RADIUS;
    if (state.ball.position.y > state.groundY + 0.5) {
      state.velocity.y -= GRAVITY * delta;
    }
  }

  // 3. Hole Check
  const distToHole = new THREE.Vector2(nextPos.x, nextPos.z).distanceTo(new THREE.Vector2(state.hole.position.x, state.hole.position.z));
  if (distToHole < 0.4 && onPlatform) {
    state.ball.scale.multiplyScalar(0.9);
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

  state.ball.position.copy(nextPos);
  state.velocity.multiplyScalar(FRICTION);

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