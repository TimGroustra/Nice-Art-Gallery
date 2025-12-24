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
}

const BALL_RADIUS = 0.15;
const FRICTION = 0.985;
const BOUNCE = 0.6;
const MIN_SPEED = 0.01;
const HIT_FORCE = 12;
const GRAVITY = 9.8;

// Platform is 30x30 centered at 0,0
const BOUNDS = 14.8; 

export function createMiniGolf(scene: THREE.Scene, platformY: number): GolfGameState {
  const wallColor = 0x89CFF0; // Baby Blue
  const turfColor = 0x2d5a27; // Deep turf green

  // 1. Turf Floor (Replacing the concrete platform's visual area)
  const turfGeo = new THREE.PlaneGeometry(30, 30);
  const turfMat = new THREE.MeshStandardMaterial({ 
    color: turfColor, 
    roughness: 0.9,
    metalness: 0.0 
  });
  const turf = new THREE.Mesh(turfGeo, turfMat);
  turf.rotation.x = -Math.PI / 2;
  turf.position.set(0, platformY + 0.02, 0); // Just above platform
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

  // 4. Obstacles & Guide Rails
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

  // Outer Perimeter Rails
  createRail(30, 0.8, 0.4, 0, 15); // South
  createRail(30, 0.8, 0.4, 0, -15); // North
  createRail(0.4, 0.8, 30, 15, 0); // East
  createRail(0.4, 0.8, 30, -15, 0); // West

  // The Course Maze Layout
  // Angle for bouncing
  createRail(10, 0.8, 0.4, 10, 5, Math.PI / 4); 
  createRail(10, 0.8, 0.4, -10, -5, Math.PI / 4);

  // Ramp Platform (Visual part)
  const rampGeo = new THREE.BoxGeometry(8, 2, 8);
  const rampMat = new THREE.MeshStandardMaterial({ color: turfColor, roughness: 0.9 });
  const rampBlock = new THREE.Mesh(rampGeo, rampMat);
  rampBlock.position.set(0, platformY + 0.5, 0);
  rampBlock.rotation.x = -Math.PI / 12; // Sloped
  rampBlock.userData = { isRamp: true };
  scene.add(rampBlock);
  // obstacles.push(rampBlock); // Ball rolls over it

  // Tunnel
  const tunnelMat = new THREE.MeshStandardMaterial({ color: wallColor, side: THREE.DoubleSide });
  const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 6, 16, 1, true), tunnelMat);
  tunnel.rotation.z = Math.PI / 2;
  tunnel.position.set(-8, platformY + 1, 8);
  scene.add(tunnel);

  // Some interior walls to guide the path
  createRail(12, 0.8, 0.4, 4, 10);
  createRail(12, 0.8, 0.4, -4, -10);
  createRail(0.4, 0.8, 12, 10, -4);
  createRail(0.4, 0.8, 12, -10, 4);

  return {
    ball,
    hole,
    obstacles,
    velocity: new THREE.Vector3(),
    isMoving: false,
    score: 0,
    initialPos: startPos,
    platformY
  };
}

export function updateMiniGolf(state: GolfGameState, delta: number) {
  if (delta > 0.1) return;

  if (!state.isMoving && state.velocity.length() < MIN_SPEED) {
    state.velocity.set(0, 0, 0);
    return;
  }

  state.isMoving = true;

  // Simple Gravity for visual height
  const nextPos = state.ball.position.clone().add(state.velocity.clone().multiplyScalar(delta));

  // Platform Area Bounds check
  if (Math.abs(nextPos.x) > BOUNDS) {
    state.velocity.x *= -BOUNCE;
    nextPos.x = THREE.MathUtils.clamp(nextPos.x, -BOUNDS, BOUNDS);
  }
  if (Math.abs(nextPos.z) > BOUNDS) {
    state.velocity.z *= -BOUNCE;
    nextPos.z = THREE.MathUtils.clamp(nextPos.z, -BOUNDS, BOUNDS);
  }

  // Wall collisions
  state.obstacles.forEach(obs => {
    const ballBox = new THREE.Box3().setFromCenterAndSize(nextPos, new THREE.Vector3(BALL_RADIUS*2, BALL_RADIUS*2, BALL_RADIUS*2));
    const obsBox = new THREE.Box3().setFromObject(obs);

    if (obsBox.intersectsBox(ballBox)) {
      // Normal-based reflection would be better, but AABB reflection for now
      const center = obs.position;
      const size = (obs.geometry as THREE.BoxGeometry).parameters;
      const rot = obs.rotation.y;

      // Handle rotated walls by transforming ball into local space
      const localBallPos = nextPos.clone().sub(center).applyAxisAngle(new THREE.Vector3(0,1,0), -rot);
      const halfW = size.width / 2;
      const halfD = size.depth / 2;

      if (Math.abs(localBallPos.x) > halfW - BALL_RADIUS) {
          state.velocity.reflect(new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0,1,0), rot)).multiplyScalar(BOUNCE);
      } else if (Math.abs(localBallPos.z) > halfD - BALL_RADIUS) {
          state.velocity.reflect(new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0,1,0), rot)).multiplyScalar(BOUNCE);
      }
    }
  });

  // Check Hole
  const distToHole = new THREE.Vector2(nextPos.x, nextPos.z).distanceTo(new THREE.Vector2(state.hole.position.x, state.hole.position.z));
  if (distToHole < 0.45) {
    // Absorb animation
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

  // Apply Position
  state.ball.position.x = nextPos.x;
  state.ball.position.z = nextPos.z;

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