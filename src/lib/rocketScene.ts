import * as THREE from 'three';

/*
 * Hero scene: a rocket with the bandit cat aboard, zipping around with a
 * handful of UFOs strung out behind it.
 *
 * Built flat in the XY plane rather than in full 3D. The rocket only ever
 * rotates about Z, so its broadside - and therefore the cockpit window and
 * the cat in it - always faces the camera. A full 3D orientation basis (what
 * the previous bird flock used) would roll the window away from the viewer
 * every time the craft banked, which loses the whole point of the scene.
 * Flat vector shapes also sit closer to the risograph look than shaded
 * solids would.
 *
 * Everything is unlit MeshBasicMaterial in the ink palette, so it reads as
 * flat printed colour rather than as a lit 3D render.
 */

const INK = {
  base: '#0B0B0C',
  paper: '#EDE8DF',
  hot: '#FF4D14',
  cold: '#1B27E8',
  acid: '#D9F24A',
} as const;

const UFO_COUNT = 4;

// Half-extents of the play area at z=0. Chosen to sit inside the camera
// frustum (FOV 75 at z=5) with a margin, so the craft never sails off screen.
const BOUNDS = { x: 5.0, y: 2.7 };

// The hero's copy occupies the left of the grid, so the rocket's idle
// wander is biased right to keep it out from behind the type.
const WANDER_CENTRE_X = 1.5;

const MAX_SPEED = 3.4;
const MAX_FORCE = 6.5;
const ARRIVE_RADIUS = 1.1;
const ACCEL_SMOOTH_RATE = 5;
const CURSOR_IDLE_TIMEOUT_MS = 4000;

// Seconds each UFO trails the rocket along its own past path. Sampling a
// time-stamped trail (rather than each UFO chasing the one ahead) keeps the
// convoy evenly spaced no matter how hard the rocket turns, and cannot
// oscillate the way a chain of pursuers can.
const UFO_LAG = [0.34, 0.56, 0.78, 1.0];
const TRAIL_SECONDS = 1.4;

/*
 * Every plate is fully opaque, so these stay non-transparent on purpose:
 * flagging them transparent would move them into the depth-sorted transparent
 * pass, where near-coplanar parts can flicker in and out of order. Opaque
 * plates with distinct z values are resolved by the depth buffer instead.
 */
function flat(shape: THREE.Shape, color: string, z: number): THREE.Mesh {
  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = z;
  return mesh;
}

function polygon(points: [number, number][]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return shape;
}

function circle(cx: number, cy: number, r: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(cx, cy, r, 0, Math.PI * 2, false);
  return shape;
}

function ellipse(cx: number, cy: number, rx: number, ry: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false, 0);
  return shape;
}

/*
 * Rocket, nose pointing along +X so heading is a single atan2 about Z.
 * Parts are stacked in z so the plates read in the right order; the whole
 * group is scaled up by the caller.
 */
function createRocket(): { group: THREE.Group; plume: THREE.Mesh } {
  const group = new THREE.Group();

  // Fins first, behind the hull.
  group.add(flat(polygon([[-0.30, 0.09], [-0.44, 0.30], [-0.10, 0.11]]), INK.hot, 0));
  group.add(flat(polygon([[-0.30, -0.09], [-0.44, -0.30], [-0.10, -0.11]]), INK.hot, 0));

  // Hull.
  const hull = new THREE.Shape();
  hull.moveTo(-0.32, -0.13);
  hull.lineTo(0.18, -0.13);
  hull.quadraticCurveTo(0.34, -0.12, 0.52, 0);
  hull.quadraticCurveTo(0.34, 0.12, 0.18, 0.13);
  hull.lineTo(-0.32, 0.13);
  hull.quadraticCurveTo(-0.40, 0, -0.32, -0.13);
  group.add(flat(hull, INK.paper, 0.01));

  // Nose cap and tail band, in the hot ink.
  group.add(flat(polygon([[0.22, 0.125], [0.52, 0], [0.22, -0.125]]), INK.hot, 0.02));
  group.add(flat(polygon([[-0.34, 0.125], [-0.24, 0.125], [-0.24, -0.125], [-0.34, -0.125]]), INK.hot, 0.02));

  // Cockpit: blue ring, dark interior.
  group.add(flat(circle(0.02, 0, 0.105), INK.cold, 0.03));
  group.add(flat(circle(0.02, 0, 0.085), INK.base, 0.04));

  // The cat aboard - bone head, ears, orange bandana, two dark eyes. Sized
  // to still read as a face at hero scale rather than as a smudge.
  //
  // Ears are broad and near-upright: narrow triangles splayed outward read
  // as devil horns, not cat. Bases sit inside the head circle, which is
  // drawn over them.
  group.add(flat(polygon([[-0.030, 0.028], [-0.020, 0.074], [0.014, 0.046]]), INK.paper, 0.05));
  group.add(flat(polygon([[0.070, 0.028], [0.060, 0.074], [0.026, 0.046]]), INK.paper, 0.05));
  group.add(flat(circle(0.02, 0.005, 0.055), INK.paper, 0.05));
  // Bandana as a shallow trapezoid with a slight centre dip. A single
  // downward triangle reads as a pointed beard rather than a kerchief.
  group.add(
    flat(
      polygon([
        [-0.036, 0.0],
        [0.076, 0.0],
        [0.052, -0.040],
        [0.020, -0.052],
        [-0.012, -0.040],
      ]),
      INK.hot,
      0.06
    )
  );
  group.add(flat(circle(0.0, 0.024, 0.011), INK.base, 0.07));
  group.add(flat(circle(0.042, 0.024, 0.011), INK.base, 0.07));

  // Exhaust plume, scaled per-frame for flicker.
  const plume = flat(polygon([[-0.34, 0.085], [-0.78, 0], [-0.34, -0.085]]), INK.acid, 0.005);
  group.add(plume);

  return { group, plume };
}

function createUfo(): THREE.Group {
  const group = new THREE.Group();
  // Dome first, then the saucer body over its base.
  group.add(flat(ellipse(0, 0.05, 0.11, 0.10), INK.paper, 0));
  group.add(flat(ellipse(0, 0, 0.26, 0.075), INK.cold, 0.01));
  // Underside lights.
  group.add(flat(circle(-0.13, -0.02, 0.022), INK.acid, 0.02));
  group.add(flat(circle(0, -0.035, 0.022), INK.acid, 0.02));
  group.add(flat(circle(0.13, -0.02, 0.022), INK.acid, 0.02));
  return group;
}

interface TrailSample {
  t: number;
  x: number;
  y: number;
}

export function initRocketScene(canvas: HTMLCanvasElement): () => void {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    canvas.clientWidth / Math.max(canvas.clientHeight, 1),
    0.1,
    1000
  );
  camera.position.z = 5;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const { group: rocket, plume } = createRocket();
  rocket.scale.setScalar(1.45);
  scene.add(rocket);

  const ufos = Array.from({ length: UFO_COUNT }, () => {
    const ufo = createUfo();
    ufo.scale.setScalar(1.0);
    scene.add(ufo);
    return ufo;
  });

  const position = new THREE.Vector3(WANDER_CENTRE_X, 0, 0);
  const velocity = new THREE.Vector3(MAX_SPEED * 0.6, 0, 0);
  const smoothedAccel = new THREE.Vector3();

  // Time-stamped ring of past rocket positions, for the UFOs to trail along.
  const trail: TrailSample[] = [];

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

  // The loader in the hero already declines to import this module under
  // reduced motion, but the setting can change while the page is open.
  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionScale = reduceMotionQuery.matches ? 0.2 : 1;
  const onMotionChange = (event: MediaQueryListEvent) => {
    motionScale = event.matches ? 0.2 : 1;
  };
  reduceMotionQuery.addEventListener('change', onMotionChange);

  const updateSize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    }
  };
  window.addEventListener('resize', updateSize);

  const clock = new THREE.Clock();
  let elapsed = 0;
  let frameId = 0;

  const desired = new THREE.Vector3();
  const steer = new THREE.Vector3();
  const sample = new THREE.Vector3();

  function sampleTrail(age: number, out: THREE.Vector3): boolean {
    if (trail.length < 2) return false;
    const wanted = elapsed - age;
    if (wanted <= trail[0].t) {
      out.set(trail[0].x, trail[0].y, 0);
      return true;
    }
    // Walk back from the newest sample; the trail is short, so this stays
    // cheap and avoids keeping a separate index per follower.
    for (let i = trail.length - 1; i > 0; i--) {
      if (trail[i - 1].t <= wanted && wanted <= trail[i].t) {
        const span = trail[i].t - trail[i - 1].t;
        const k = span > 1e-6 ? (wanted - trail[i - 1].t) / span : 0;
        out.set(
          trail[i - 1].x + (trail[i].x - trail[i - 1].x) * k,
          trail[i - 1].y + (trail[i].y - trail[i - 1].y) * k,
          0
        );
        return true;
      }
    }
    return false;
  }

  function animate() {
    frameId = requestAnimationFrame(animate);
    updateSize();

    const rawDelta = Math.min(clock.getDelta(), 0.05);
    const delta = rawDelta * motionScale;
    elapsed += delta;

    // Target: the cursor while it is fresh, otherwise a slow lissajous
    // wander biased to the right of the hero so the craft keeps clear of
    // the headline.
    let target: THREE.Vector3;
    if (hasCursorTarget && performance.now() - lastPointerMove < CURSOR_IDLE_TIMEOUT_MS) {
      target = cursorTarget;
    } else {
      const t = elapsed * 0.28;
      target = autoTarget.set(
        WANDER_CENTRE_X + Math.sin(t) * 2.6,
        Math.cos(t * 1.37) * 1.7,
        0
      );
    }

    // Arrive: ease the desired speed down inside ARRIVE_RADIUS so the rocket
    // settles onto a target instead of overshooting and jittering around it.
    desired.set(target.x - position.x, target.y - position.y, 0);
    const distance = desired.length();
    const rampedSpeed =
      distance < ARRIVE_RADIUS ? MAX_SPEED * (distance / ARRIVE_RADIUS) : MAX_SPEED;
    if (distance > 1e-5) desired.multiplyScalar(rampedSpeed / distance);

    steer.subVectors(desired, velocity);
    if (steer.length() > MAX_FORCE) steer.setLength(MAX_FORCE);

    const accelLerp = 1 - Math.exp(-ACCEL_SMOOTH_RATE * rawDelta);
    smoothedAccel.lerp(steer, accelLerp);
    velocity.addScaledVector(smoothedAccel, delta);
    if (velocity.length() > MAX_SPEED) velocity.setLength(MAX_SPEED);
    position.addScaledVector(velocity, delta);

    // Soft containment, so the craft turns back rather than clipping an edge.
    if (Math.abs(position.x) > BOUNDS.x) {
      position.x = Math.sign(position.x) * BOUNDS.x;
      velocity.x *= -0.5;
    }
    if (Math.abs(position.y) > BOUNDS.y) {
      position.y = Math.sign(position.y) * BOUNDS.y;
      velocity.y *= -0.5;
    }

    rocket.position.set(position.x, position.y, 0);

    // Single Z rotation keeps the cockpit broadside to the camera.
    const heading = Math.atan2(velocity.y, velocity.x);
    rocket.rotation.z = heading;

    // Exhaust flickers with throttle: longer under hard acceleration.
    const throttle = Math.min(velocity.length() / MAX_SPEED, 1);
    const flicker = 0.75 + Math.sin(elapsed * 34) * 0.12 + Math.sin(elapsed * 61) * 0.06;
    plume.scale.set(throttle * flicker, 0.85 + throttle * 0.3, 1);

    trail.push({ t: elapsed, x: position.x, y: position.y });
    while (trail.length > 2 && trail[0].t < elapsed - TRAIL_SECONDS) trail.shift();

    ufos.forEach((ufo, i) => {
      if (!sampleTrail(UFO_LAG[i] ?? 1.2, sample)) return;
      // Small perpendicular weave so the convoy is not a rigid conga line.
      const wobble = Math.sin(elapsed * 1.7 + i * 1.9) * 0.22;
      ufo.position.set(sample.x, sample.y + wobble, -0.15 - i * 0.05);
      // Saucers stay level; only a slight tilt into the direction of travel.
      ufo.rotation.z = Math.sin(elapsed * 1.3 + i) * 0.12;
    });

    renderer.render(scene, camera);
  }

  animate();

  return function cleanup() {
    cancelAnimationFrame(frameId);
    window.removeEventListener('resize', updateSize);
    window.removeEventListener('pointermove', onPointerMove);
    reduceMotionQuery.removeEventListener('change', onMotionChange);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
    renderer.dispose();
  };
}
