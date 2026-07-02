import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BIRD_COUNT = 138;

// Same flame palette used by the previous particle animation.
const PALETTE = ['#FF1C1C', '#FF6A00', '#FFD700', '#A100FF'].map((hex) => new THREE.Color(hex));

// Kept inside the camera frustum (FOV 75 at z=5 gives ~6.1 horizontal /
// ~3.8 vertical half-extent at z=0) so the spread reads as "fills the
// screen," not "wanders off camera."
const BOUNDS = new THREE.Vector3(5.6, 3.2, 3.6);

// Ballerini et al. (2008) found starlings orient to a fixed number of nearest
// neighbors (~6-7) rather than everything within a fixed radius - that
// "topological" interaction is what keeps a murmuration cohesive at any
// density. We use the same rule here instead of a radius search.
const K_NEAREST = 7;
const SENSE_RANGE = 2.1;
const SENSE_RANGE_SQ = SENSE_RANGE * SENSE_RANGE;
const SEPARATION_RADIUS = 0.85;

const MAX_SPEED = 2.2;
const MIN_SPEED = 0.9;
const MAX_FORCE = 2.4;
// Alignment leads separation/cohesion so the flock reads as one body moving
// together rather than a scatter of birds independently dodging each other.
const SEPARATION_WEIGHT = 1.5;
const ALIGNMENT_WEIGHT = 1.8;
const COHESION_WEIGHT = 0.55;
const SEEK_WEIGHT = 0.35;
const BOUNDS_WEIGHT = 5;
// A gentle pull toward the whole flock's average heading, recomputed once
// per frame (not per-neighbor-pair). Local alignment only propagates a
// shared heading through the ~7-neighbor graph, which is slow enough that
// separate sub-clusters can drift apart; this keeps the entire flock
// cohering on one general direction while local rules still add texture and
// the occasional individual exception.
const GLOBAL_ALIGNMENT_WEIGHT = 0.5;
// Containment starts easing in this far before the hard edge (fraction of
// each half-extent) and ramps in with a quadratic (zero slope at the start),
// so birds arc back gently instead of bouncing off an invisible wall.
const BOUNDS_MARGIN = 0.72;

// Steering forces (esp. from the topological neighbor set changing member by
// member frame to frame) can jump around a lot; low-pass filtering the
// resulting acceleration before it touches velocity gives birds a sense of
// inertia/momentum so turns curve instead of snapping.
const ACCEL_SMOOTH_RATE = 4.5;
// A second, faster smoothing pass on the rendered orientation itself (slerp)
// irons out any remaining per-frame attitude jitter.
const ORIENT_SMOOTH_RATE = 9;
const BANK_SMOOTH_RATE = 6;

// Real fliers only flap to climb; level or descending flight is a glide with
// wings held apart. ASCEND_THRESHOLD is the vertical speed at which a bird
// is flapping at full amplitude; ENVELOPE_RATE controls how smoothly it eases
// between gliding and flapping so wings never snap between states.
const FLAP_SPEED = 8;
const FLAP_AMPLITUDE = 0.85;
const ASCEND_THRESHOLD = 0.35;
const ENVELOPE_RATE = 3;

const CURSOR_IDLE_TIMEOUT_MS = 4000;

const WORLD_UP = new THREE.Vector3(0, 1, 0);
// When a bird's heading is nearly vertical, WORLD_UP is nearly parallel to
// it and crossVectors(WORLD_UP, direction) collapses toward zero length -
// normalizing that is numerically unstable and makes the basis (and the
// bird's rendered attitude) spin wildly frame to frame. ALT_UP is orthogonal
// to WORLD_UP, so blending toward it as the heading approaches vertical
// keeps the cross product well-conditioned at every heading.
const ALT_UP = new THREE.Vector3(0, 0, 1);

// Zero value and zero slope at the margin, growing quadratically past it -
// no kink where containment switches on, unlike a hard-edge threshold.
function softBoundsAxis(pos: number, extent: number): number {
  const marginStart = extent * BOUNDS_MARGIN;
  const abs = Math.abs(pos);
  if (abs <= marginStart) return 0;
  const t = (abs - marginStart) / (extent - marginStart);
  return -Math.sign(pos) * t * t;
}

// Body = elongated octahedron (one subdivision level for a rounded, not
// faceted/gem-like, silhouette) + a small head + a slim tail wedge, merged
// into one draw call. Slimmer and smaller-headed than a first pass reads as
// a sleek starling instead of a chunky blob.
function createBodyGeometry(): THREE.BufferGeometry {
  const body = new THREE.OctahedronGeometry(0.07, 1);
  body.scale(0.5, 0.62, 1.7);

  const head = new THREE.OctahedronGeometry(0.034, 1);
  head.translate(0, 0.006, -0.125);

  const tail = new THREE.ConeGeometry(0.03, 0.12, 4, 1, true).toNonIndexed();
  tail.rotateX(Math.PI / 2);
  tail.translate(0, 0, 0.175);

  const merged = mergeGeometries([body, head, tail], false);
  return merged ?? body;
}

// Wing root sits at the local origin so it can be flapped by rotating around
// Z once positioned at the shoulder hinge on the body. A tapered quad (root,
// leading tip, trailing tip, trailing root) reads as a slim swept pointed
// wing rather than a single flat bat-like membrane triangle.
function createWingGeometry(side: 1 | -1): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    0, 0, 0,
    0.17 * side, 0.008, -0.008,
    0.12 * side, -0.004, 0.04,
    0.028 * side, 0, 0.032,
  ]);
  const indices = side === 1 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface Bird {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  smoothedAccel: THREE.Vector3;
  prevDirection: THREE.Vector3;
  visualQuaternion: THREE.Quaternion;
  bank: number;
  wingPhase: number;
  flapEnvelope: number;
  scale: number;
  color: THREE.Color;
}

function createBird(): Bird {
  const position = new THREE.Vector3(
    (Math.random() - 0.5) * BOUNDS.x,
    (Math.random() - 0.5) * BOUNDS.y,
    (Math.random() - 0.5) * BOUNDS.z
  );
  const angle = Math.random() * Math.PI * 2;
  const velocity = new THREE.Vector3(Math.cos(angle), (Math.random() - 0.5) * 0.4, Math.sin(angle))
    .normalize()
    .multiplyScalar(MIN_SPEED + Math.random() * 0.4);
  return {
    position,
    velocity,
    smoothedAccel: new THREE.Vector3(),
    prevDirection: velocity.clone().normalize(),
    visualQuaternion: new THREE.Quaternion(),
    bank: 0,
    wingPhase: Math.random() * Math.PI * 2,
    flapEnvelope: 0,
    scale: 0.3 + Math.random() * 0.16,
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
  };
}

export function initBirdSwarm(canvas: HTMLCanvasElement): () => void {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / Math.max(canvas.clientHeight, 1), 0.1, 1000);
  camera.position.z = 5;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const bodyGeometry = createBodyGeometry();
  const wingLGeometry = createWingGeometry(-1);
  const wingRGeometry = createWingGeometry(1);

  // Unlit, like the original particle cloud, so the flame palette renders
  // at full saturation regardless of scene lighting/tone mapping. Instance
  // colors work via setColorAt below without needing material.vertexColors
  // (that flag expects a per-vertex geometry `color` attribute, which would
  // read as black and zero out the instance color).
  const material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });

  const bodyMesh = new THREE.InstancedMesh(bodyGeometry, material, BIRD_COUNT);
  const wingLMesh = new THREE.InstancedMesh(wingLGeometry, material, BIRD_COUNT);
  const wingRMesh = new THREE.InstancedMesh(wingRGeometry, material, BIRD_COUNT);
  scene.add(bodyMesh, wingLMesh, wingRMesh);

  const birds: Bird[] = Array.from({ length: BIRD_COUNT }, createBird);

  birds.forEach((bird, i) => {
    bodyMesh.setColorAt(i, bird.color);
    wingLMesh.setColorAt(i, bird.color);
    wingRMesh.setColorAt(i, bird.color);
  });
  if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
  if (wingLMesh.instanceColor) wingLMesh.instanceColor.needsUpdate = true;
  if (wingRMesh.instanceColor) wingRMesh.instanceColor.needsUpdate = true;

  // Shared dummy hierarchy: wing hinges are children of the body so a single
  // position/orientation update on the body carries the wings with it, and
  // flapping is just a local Z rotation of each wing dummy.
  const dummyBody = new THREE.Object3D();
  const dummyWingL = new THREE.Object3D();
  const dummyWingR = new THREE.Object3D();
  dummyWingL.position.set(-0.032, 0.012, -0.018);
  dummyWingR.position.set(0.032, 0.012, -0.018);
  dummyBody.add(dummyWingL);
  dummyBody.add(dummyWingR);

  const raycaster = new THREE.Raycaster();
  const seekPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const pointerNDC = new THREE.Vector2();
  const cursorTarget = new THREE.Vector3();
  const autoTarget = new THREE.Vector3();
  let hasCursorTarget = false;
  let lastPointerMove = 0;

  function onPointerMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    if (raycaster.ray.intersectPlane(seekPlane, cursorTarget)) {
      hasCursorTarget = true;
      lastPointerMove = performance.now();
    }
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionScale = reduceMotionQuery.matches ? 0.25 : 1;
  const onMotionChange = (event: MediaQueryListEvent) => {
    motionScale = event.matches ? 0.25 : 1;
  };
  reduceMotionQuery.addEventListener('change', onMotionChange);

  const updateSize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  };
  window.addEventListener('resize', updateSize);

  const clock = new THREE.Clock();
  let flapClock = 0;
  let frameId = 0;

  const accel = new THREE.Vector3();
  const separation = new THREE.Vector3();
  const alignment = new THREE.Vector3();
  const cohesion = new THREE.Vector3();
  const seek = new THREE.Vector3();
  const globalAlign = new THREE.Vector3();
  const flockAvgVelocity = new THREE.Vector3();
  const boundsForce = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const refUp = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const zAxis = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();

  // Reused scratch buffers for the topological (k-nearest) neighbor search,
  // so the hot loop never allocates.
  const neighborDistSq = new Float32Array(BIRD_COUNT);

  function animate() {
    frameId = requestAnimationFrame(animate);
    updateSize();

    const rawDelta = Math.min(clock.getDelta(), 0.05);
    const delta = rawDelta * motionScale;
    flapClock += rawDelta * motionScale;

    let target: THREE.Vector3;
    if (hasCursorTarget && performance.now() - lastPointerMove < CURSOR_IDLE_TIMEOUT_MS) {
      target = cursorTarget;
    } else {
      const t = flapClock * 0.12;
      target = autoTarget.set(Math.sin(t) * 2.4, Math.cos(t * 1.3) * 1.4, Math.sin(t * 0.6) * 1.4);
    }

    const accelLerp = 1 - Math.exp(-ACCEL_SMOOTH_RATE * rawDelta);
    const orientLerp = 1 - Math.exp(-ORIENT_SMOOTH_RATE * rawDelta);
    const bankLerp = 1 - Math.exp(-BANK_SMOOTH_RATE * rawDelta);
    const envelopeLerp = 1 - Math.exp(-ENVELOPE_RATE * rawDelta);

    flockAvgVelocity.set(0, 0, 0);
    for (let i = 0; i < BIRD_COUNT; i++) flockAvgVelocity.add(birds[i].velocity);
    flockAvgVelocity.divideScalar(BIRD_COUNT);

    for (let i = 0; i < BIRD_COUNT; i++) {
      const bird = birds[i];
      accel.set(0, 0, 0);
      separation.set(0, 0, 0);
      alignment.set(0, 0, 0);
      cohesion.set(0, 0, 0);
      let separationCount = 0;
      let neighborCount = 0;

      for (let j = 0; j < BIRD_COUNT; j++) {
        neighborDistSq[j] = j === i ? Infinity : bird.position.distanceToSquared(birds[j].position);
      }

      for (let k = 0; k < K_NEAREST; k++) {
        let nearestIdx = -1;
        let nearestDistSq = SENSE_RANGE_SQ;
        for (let j = 0; j < BIRD_COUNT; j++) {
          if (neighborDistSq[j] < nearestDistSq) {
            nearestDistSq = neighborDistSq[j];
            nearestIdx = j;
          }
        }
        if (nearestIdx === -1) break;
        neighborDistSq[nearestIdx] = Infinity;

        const other = birds[nearestIdx];
        alignment.add(other.velocity);
        cohesion.add(other.position);
        neighborCount++;

        if (nearestDistSq < SEPARATION_RADIUS * SEPARATION_RADIUS) {
          const dist = Math.sqrt(nearestDistSq);
          if (dist > 0.0001) {
            // Floor the distance used for the inverse falloff so repulsion
            // strength stays bounded as birds pass very close to one
            // another - an unbounded 1/dist^2 term lets whichever neighbor
            // is currently closest completely dominate the summed
            // direction, which can flip abruptly as relative distances
            // cross over.
            scratch.copy(bird.position).sub(other.position).normalize().divideScalar(Math.max(dist, 0.2));
            separation.add(scratch);
            separationCount++;
          }
        }
      }

      if (neighborCount > 0) {
        alignment.divideScalar(neighborCount).setLength(MAX_SPEED).sub(bird.velocity).clampLength(0, MAX_FORCE);
        accel.addScaledVector(alignment, ALIGNMENT_WEIGHT);

        cohesion.divideScalar(neighborCount).sub(bird.position).setLength(MAX_SPEED).sub(bird.velocity).clampLength(0, MAX_FORCE);
        accel.addScaledVector(cohesion, COHESION_WEIGHT);
      }
      if (flockAvgVelocity.lengthSq() > 1e-6) {
        globalAlign.copy(flockAvgVelocity).setLength(MAX_SPEED).sub(bird.velocity).clampLength(0, MAX_FORCE);
        accel.addScaledVector(globalAlign, GLOBAL_ALIGNMENT_WEIGHT);
      }
      if (separationCount > 0) {
        separation.divideScalar(separationCount).setLength(MAX_SPEED).sub(bird.velocity).clampLength(0, MAX_FORCE);
        accel.addScaledVector(separation, SEPARATION_WEIGHT);
      }

      seek.copy(target).sub(bird.position);
      if (seek.length() > 0.6) {
        seek.setLength(MAX_SPEED).sub(bird.velocity).clampLength(0, MAX_FORCE);
        accel.addScaledVector(seek, SEEK_WEIGHT);
      }

      boundsForce.set(
        softBoundsAxis(bird.position.x, BOUNDS.x),
        softBoundsAxis(bird.position.y, BOUNDS.y),
        softBoundsAxis(bird.position.z, BOUNDS.z)
      );
      accel.addScaledVector(boundsForce, BOUNDS_WEIGHT);

      // Low-pass filter the steering acceleration itself so birds carry
      // momentum through direction changes instead of snapping onto a new
      // heading the instant a steering force appears or disappears.
      bird.smoothedAccel.lerp(accel, accelLerp);
      bird.velocity.addScaledVector(bird.smoothedAccel, delta);
      const speed = bird.velocity.length();
      if (speed > MAX_SPEED) {
        bird.velocity.multiplyScalar(MAX_SPEED / speed);
      } else if (speed < MIN_SPEED) {
        // Turn rate for a given force is inversely proportional to speed, so
        // whenever nearby forces roughly cancel (birds passing close to one
        // another - separation pushing one way, cohesion/alignment pulling
        // another) a bird's speed can dip low and its raw heading becomes
        // hypersensitive to tiny force fluctuations - the "spinning near
        // other birds" artifact. Real fliers never stall like this, so blend
        // toward the last stable heading (more so the lower the speed) while
        // holding speed at the floor, instead of trusting a shaky direction.
        const dirWeight = speed > 1e-4 ? THREE.MathUtils.clamp(speed / MIN_SPEED, 0, 1) : 0;
        scratch.copy(bird.velocity).normalize().multiplyScalar(dirWeight);
        scratch.addScaledVector(bird.prevDirection, 1 - dirWeight).normalize();
        bird.velocity.copy(scratch).multiplyScalar(MIN_SPEED);
      }

      bird.position.addScaledVector(bird.velocity, delta);

      direction.copy(bird.velocity).normalize();
      const turn = direction.x - bird.prevDirection.x;
      bird.prevDirection.copy(direction);

      const targetBank = THREE.MathUtils.clamp(-turn * 8, -0.6, 0.6);
      bird.bank += (targetBank - bird.bank) * bankLerp;

      const verticalness = Math.abs(direction.y);
      const upBlend = THREE.MathUtils.smoothstep(verticalness, 0.6, 0.92);
      refUp.copy(WORLD_UP).lerp(ALT_UP, upBlend).normalize();
      // Nose points along local -Z, so zAxis (local +Z) is "backward". Build
      // right/up from zAxis (not from `direction` directly) so the basis
      // stays right-handed - getting this backwards silently produces a
      // mirrored (determinant -1) matrix, which setFromRotationMatrix can't
      // turn into a valid unit quaternion and was the real source of the
      // per-frame spinning/jerkiness.
      zAxis.copy(direction).negate();
      right.crossVectors(refUp, zAxis).normalize();
      up.crossVectors(zAxis, right).normalize();
      up.applyAxisAngle(direction, bird.bank);
      right.crossVectors(up, zAxis).normalize();
      basis.makeBasis(right, up, zAxis);
      quaternion.setFromRotationMatrix(basis);
      bird.visualQuaternion.slerp(quaternion, orientLerp);

      dummyBody.position.copy(bird.position);
      dummyBody.quaternion.copy(bird.visualQuaternion);
      dummyBody.scale.setScalar(bird.scale);

      // Flap only to climb; ease toward a flat, wings-apart glide otherwise.
      const targetEnvelope = THREE.MathUtils.smoothstep(bird.velocity.y, 0, ASCEND_THRESHOLD);
      bird.flapEnvelope += (targetEnvelope - bird.flapEnvelope) * envelopeLerp;

      const wingSpeedFactor = 0.7 + bird.flapEnvelope * 0.6;
      bird.wingPhase += rawDelta * motionScale * FLAP_SPEED * wingSpeedFactor;

      // Two-harmonic blend gives a smooth (fully continuous) but asymmetric
      // wingbeat - a quicker downstroke, a gentler recovery - without any of
      // the sharp derivative snap a sign()/pow() shaping would introduce.
      const wave = Math.sin(bird.wingPhase) - 0.3 * Math.sin(2 * bird.wingPhase);
      const flap = (wave / 1.3) * FLAP_AMPLITUDE * bird.flapEnvelope * motionScale;
      dummyWingL.rotation.z = -flap;
      dummyWingR.rotation.z = flap;

      dummyBody.updateMatrixWorld(true);
      bodyMesh.setMatrixAt(i, dummyBody.matrixWorld);
      wingLMesh.setMatrixAt(i, dummyWingL.matrixWorld);
      wingRMesh.setMatrixAt(i, dummyWingR.matrixWorld);
    }

    bodyMesh.instanceMatrix.needsUpdate = true;
    wingLMesh.instanceMatrix.needsUpdate = true;
    wingRMesh.instanceMatrix.needsUpdate = true;

    renderer.render(scene, camera);
  }

  animate();

  return function cleanup() {
    cancelAnimationFrame(frameId);
    window.removeEventListener('resize', updateSize);
    window.removeEventListener('pointermove', onPointerMove);
    reduceMotionQuery.removeEventListener('change', onMotionChange);
    bodyGeometry.dispose();
    wingLGeometry.dispose();
    wingRGeometry.dispose();
    material.dispose();
    renderer.dispose();
  };
}
