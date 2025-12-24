import * as THREE from 'three';

export interface GolfGameState {
  ball: THREE.Mesh;
  hole: THREE.Mesh;
  obstacles: THREE.Mesh[];
  velocity: THREE.Vector3;
  isMoving: boolean;
  score: number;
}

const BALL_RADIUS = 0.15;
const FRICTION = 0.985;
const BOUNCE = 0.7;
const MIN_SPEED = 0.01;
const HIT_FORCE = 12;

// Platform bounds (30x30 platform centered at 0,0)
const BOUNDS = 14.8; // Slightly less than 15 to account for ball radius

export function createMiniGolf(scene: THREE.Scene, platformY: number): GolfGameState {
  // 1. Create Ball
  const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 16, 16);
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.position.set(0, platformY + BALL_RADIUS, 10);
  ball.userData = { isGolfBall: true };
  scene.add(ball);

  // 2. Create Hole
  const holeGeo = new THREE.CircleGeometry(0.4, 32);
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const hole = new THREE.Mesh(holeGeo, holeMat);
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(0, platformY + 0.01, -10);
  scene.add(hole);

  // 3. Create Obstacles (Simple walls/blocks)
  const obstacles: THREE.Mesh[] = [];
  const obstacleMat = new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.5 });
  
  // A middle barrier with a gap
  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 1), obstacleMat);
  wallLeft.position.set(-9, platformY + 0.25, 0);
  scene.add(wallLeft);
  obstacles.push(wallLeft);

  const wallRight = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 1), obstacleMat);
  wallRight.position.set(9, platformY + 0.25, 0);
  scene.add(wallRight);
  obstacles.push(wallRight);

  // A small rotating windmill-like obstacle (we'll animate this in the loop)
  const spinner = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 0.5), obstacleMat);
  spinner.position.set(0, platformY + 0.25, -5);
  spinner.userData = { isSpinner: true };
  scene.add(spinner);
  obstacles.push(spinner);

  return {
    ball,
    hole,
    obstacles,
    velocity: new THREE.Vector3(),
    isMoving: false,
    score: 0
  };
}

export function updateMiniGolf(state: GolfGameState, delta: number) {
  if (delta > 0.1) return; // Prevent huge jumps on lag

  // Animate the spinner
  state.obstacles.forEach(obj => {
    if (obj.userData.isSpinner) {
      obj.rotation.y += delta * 2;
    }
  });

  if (!state.isMoving && state.velocity.length() < MIN_SPEED) {
    state.velocity.set(0, 0, 0);
    return;
  }

  state.isMoving = true;

  // Apply velocity
  const nextPos = state.ball.position.clone().add(state.velocity.clone().multiplyScalar(delta));

  // Boundary Collisions
  if (nextPos.x > BOUNDS || nextPos.x < -BOUNDS) {
    state.velocity.x *= -BOUNCE;
    nextPos.x = THREE.MathUtils.clamp(nextPos.x, -BOUNDS, BOUNDS);
  }
  if (nextPos.z > BOUNDS || nextPos.z < -BOUNDS) {
    state.velocity.z *= -BOUNCE;
    nextPos.z = THREE.MathUtils.clamp(nextPos.z, -BOUNDS, BOUNDS);
  }

  // Obstacle Collisions (Simple AABB-ish)
  state.obstacles.forEach(obs => {
    const box = new THREE.Box3().setFromObject(obs);
    const ballBox = new THREE.Box3().setFromCenterAndSize(
        nextPos, 
        new THREE.Vector3(BALL_RADIUS * 2, BALL_RADIUS * 2, BALL_RADIUS * 2)
    );

    if (box.intersectsBox(ballBox)) {
        // Reflect based on major axis of overlap
        const overlapX = Math.min(box.max.x - nextPos.x, nextPos.x - box.min.x);
        const overlapZ = Math.min(box.max.z - nextPos.z, nextPos.z - box.min.z);

        if (overlapX < overlapZ) {
            state.velocity.x *= -BOUNCE;
        } else {
            state.velocity.z *= -BOUNCE;
        }
    }
  });

  // Check Hole
  const distToHole = new THREE.Vector2(nextPos.x, nextPos.z).distanceTo(new THREE.Vector2(state.hole.position.x, state.hole.position.z));
  if (distToHole < 0.4 && state.velocity.length() < 5) {
    // Score! Reset ball
    state.score++;
    state.ball.position.set(0, state.ball.position.y, 10);
    state.velocity.set(0, 0, 0);
    state.isMoving = false;
    return;
  }

  // Apply Position
  state.ball.position.x = nextPos.x;
  state.ball.position.z = nextPos.z;

  // Apply Friction
  state.velocity.multiplyScalar(FRICTION);

  // Stop if too slow
  if (state.velocity.length() < MIN_SPEED) {
    state.velocity.set(0, 0, 0);
    state.isMoving = false;
  }
}

export function hitBall(state: GolfGameState, camera: THREE.Camera) {
  if (state.isMoving) return;

  // Get look direction in XZ plane
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();

  state.velocity.copy(dir).multiplyScalar(HIT_FORCE);
  state.isMoving = true;
}