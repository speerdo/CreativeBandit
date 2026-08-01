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
  acid: '#FFE800',
} as const;

const UFO_COUNT = 4;

/*
 * The play area is derived from the actual camera frustum on every resize,
 * not hard-coded. A fixed box only works for one viewport shape: at 1024x768
 * the visible half-width is about 5.6 units, so the old fixed x=5.0 let a
 * 2.15-scaled rocket sail clean off the side, while on an ultrawide it kept
 * the craft penned into the middle third.
 *
 * CRAFT_CLEARANCE is the rocket's own reach (body radius at scale, plus the
 * overshoot the soft containment allows) held back from each edge, so the
 * hull stays on screen even though the exhaust plume may clip. Checked
 * against nine viewport shapes from 768x900 to 3440x1200.
 */
const BOUNDS = { x: 5.0, y: 2.0 };
const CRAFT_CLEARANCE = 2.0;
const BOUNDS_X_RANGE = { min: 1.3, max: 5.6 };
const BOUNDS_Y_RANGE = { min: 1.2, max: 2.0 };

/*
 * Flight character is set by the ratio between these two, not by either
 * alone: a craft holding speed v under a lateral force f turns with radius
 * v^2 / f. At 3.2 and 2.6 that is about 3.9 units - wider than the play area
 * is tall, so the rocket sweeps in long arcs and loops instead of darting.
 * Raising MAX_FORCE tightens it back into short bursts.
 */
const MAX_SPEED = 3.2;
const MAX_FORCE = 2.6;
// Speed is held near cruise rather than eased down on approach. Arrive-style
// damping is what made the old motion read as stop-start.
const MIN_SPEED = 2.5;
const ACCEL_SMOOTH_RATE = 4.5;
const CURSOR_IDLE_TIMEOUT_MS = 4000;

// Containment starts easing in this far from the edge, as a fraction of each
// half-extent, and ramps in quadratically - zero value and zero slope at the
// margin, so the craft curves back instead of bouncing off an invisible wall.
const BOUNDS_MARGIN = 0.68;
const BOUNDS_FORCE = 16;

/*
 * Flattens the loops into wide horizontal ovals: a spring pulling the craft
 * back toward the horizon, plus damping on vertical speed.
 *
 * The damping term is the important half. A bare spring is an oscillator and
 * *adds* vertical motion - measured over two simulated minutes it left the
 * vertical spread essentially unchanged. With damping, mean |vx|/|vy| goes
 * from 0.74 to 5.5 and the vertical spread drops from 1.33 to 0.46, while
 * horizontal travel stays free.
 */
const Y_FLATTEN = 1.6;
const Y_DAMPING = 1.0;

// Idle flight aims at randomised waypoints rather than tracing a fixed
// lissajous, so the path never settles into a visibly repeating figure. A new
// waypoint is picked on arrival, or when the dwell expires - whichever first.
// Fractions of the play area rather than absolute units, so the wander fills
// whatever space the viewport actually gives it. The x centre is biased right
// to keep the craft clear of the hero copy.
const WAYPOINT_X_CENTRE_FRAC = 0.3;
const WAYPOINT_X_SPREAD_FRAC = 0.62;
const WAYPOINT_Y_SPREAD_FRAC = 0.4;
const WAYPOINT_ARRIVE = 1.2;
const WAYPOINT_HOLD_MIN = 3.5;
const WAYPOINT_HOLD_MAX = 6;

// Pot-shots aimed up the convoy at the rocket. Purely cosmetic - bolts are
// their own objects and never touch the flight solver, so they cannot perturb
// either the rocket's path or the convoy's spacing.
//
// Bolt speed has to clear the rocket's cruise (3.2) by a decent margin, or a
// shot fired from the back of the queue never catches what it is aimed at and
// just trails along behind looking broken.
const BOLT_POOL = 12;
const BOLT_SPEED = 5.4;
const BOLT_LIFE = 1.5;
const BOLT_INTERVAL_MIN = 2.5;
const BOLT_INTERVAL_MAX = 7;

// Seconds each UFO trails the rocket along its own past path. Sampling a
// time-stamped trail (rather than each UFO chasing the one ahead) keeps the
// convoy evenly spaced no matter how hard the rocket turns, and cannot
// oscillate the way a chain of pursuers can.
//
/*
 * The lag breathes: each saucer drifts further back, then reels itself in.
 * A fixed lag reads as a rigid tow-rope.
 *
 * The swing has to stay small relative to the base spacing, and the phases
 * close together. An earlier pass used 0.34 spacing with a 0.3 swing and
 * phases 1.25 apart, which let neighbours converge to the same lag and
 * actually swap places - three of the four ended up stacked on one another.
 * At 0.34 spacing, 0.22 swing and 0.35 phase the worst-case gap is +0.26s,
 * about 0.84 world units at cruise against a saucer 0.52 wide.
 */
const UFO_LAG_BASE = [0.85, 1.19, 1.53, 1.87];
const UFO_LAG_SWING = 0.22;
const UFO_LAG_PHASE = 0.35;
const UFO_LAG_RATE = 0.45;
// Must exceed the largest lag plus its swing (2.09), or the tail saucer runs
// off the end of the trail and snaps back to its start.
const TRAIL_SECONDS = 2.8;

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

// Zero value and zero slope at the margin, growing quadratically past it, so
// there is no kink where containment switches on.
function softBoundsAxis(pos: number, extent: number): number {
  const marginStart = extent * BOUNDS_MARGIN;
  const abs = Math.abs(pos);
  if (abs <= marginStart) return 0;
  const t = (abs - marginStart) / (extent - marginStart);
  return -Math.sign(pos) * t * t;
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
  // Large enough that the cockpit - and the cat in it - is legible at hero
  // size. At 2.15 the porthole is roughly 45px across on a 800px-tall canvas.
  rocket.scale.setScalar(2.15);
  scene.add(rocket);

  const ufos = Array.from({ length: UFO_COUNT }, () => {
    const ufo = createUfo();
    ufo.scale.setScalar(1.3);
    scene.add(ufo);
    return ufo;
  });

  // Laser bolts, pre-allocated and recycled so firing never allocates.
  const bolts = Array.from({ length: BOLT_POOL }, () => {
    const mesh = flat(polygon([[-0.018, 0.07], [0.018, 0.07], [0.018, -0.07], [-0.018, -0.07]]), INK.acid, -0.2);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, life: 0, vx: 0, vy: 0 };
  });
  const nextFire = Array.from(
    { length: UFO_COUNT },
    () => BOLT_INTERVAL_MIN + Math.random() * (BOLT_INTERVAL_MAX - BOLT_INTERVAL_MIN)
  );

  const position = new THREE.Vector3(BOUNDS.x * 0.3, 0, 0);
  const velocity = new THREE.Vector3(MAX_SPEED * 0.9, 0, 0);
  const smoothedAccel = new THREE.Vector3();

  // Time-stamped ring of past rocket positions, for the UFOs to trail along.
  //
  // Seeded with a straight run-in behind the starting position rather than
  // left empty. The furthest saucer lags nearly two seconds, so an empty
  // trail would pin the whole convoy on top of the rocket's start point and
  // let them peel off one by one as it filled - a visible mess on load.
  const trail: TrailSample[] = [];
  const SEED_STEP = 0.05;
  for (let t = -TRAIL_SECONDS; t <= 0; t += SEED_STEP) {
    trail.push({
      t,
      x: position.x + velocity.x * t,
      y: position.y + velocity.y * t,
    });
  }

  const raycaster = new THREE.Raycaster();
  const seekPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const pointerNDC = new THREE.Vector2();
  const cursorTarget = new THREE.Vector3();
  const autoTarget = new THREE.Vector3(BOUNDS.x * 0.6, 0.4, 0);
  let waypointHold = WAYPOINT_HOLD_MIN;
  let hasCursorTarget = false;
  let lastPointerMove = 0;

  function pickWaypoint() {
    autoTarget.set(
      BOUNDS.x * WAYPOINT_X_CENTRE_FRAC +
        (Math.random() * 2 - 1) * BOUNDS.x * WAYPOINT_X_SPREAD_FRAC,
      (Math.random() * 2 - 1) * BOUNDS.y * WAYPOINT_Y_SPREAD_FRAC,
      0
    );
    waypointHold = WAYPOINT_HOLD_MIN + Math.random() * (WAYPOINT_HOLD_MAX - WAYPOINT_HOLD_MIN);
  }

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

  const clampTo = (v: number, r: { min: number; max: number }) =>
    Math.min(Math.max(v, r.min), r.max);

  function fitBoundsToFrustum() {
    const halfH = Math.tan(((camera.fov / 2) * Math.PI) / 180) * camera.position.z;
    const halfW = halfH * camera.aspect;
    BOUNDS.x = clampTo(halfW - CRAFT_CLEARANCE, BOUNDS_X_RANGE);
    BOUNDS.y = clampTo(halfH - CRAFT_CLEARANCE, BOUNDS_Y_RANGE);
  }

  /*
   * Track the last CSS size we handed to the renderer, rather than reading it
   * back off the canvas. `setSize(w, h, false)` writes `canvas.width` in
   * DEVICE pixels (w * pixelRatio), so comparing it against `clientWidth` in
   * CSS pixels never matches on a HiDPI display - the resize path then ran on
   * every frame, and assigning `canvas.width` reallocates the drawing buffer
   * each time.
   */
  let lastWidth = -1;
  let lastHeight = -1;

  const updateSize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    fitBoundsToFrustum();
  };
  fitBoundsToFrustum();
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
      // Retarget on arrival or when the dwell runs out, whichever comes
      // first. Without the timeout the craft can orbit a waypoint it never
      // quite reaches and stay stuck on it.
      waypointHold -= delta;
      const reached =
        Math.hypot(autoTarget.x - position.x, autoTarget.y - position.y) < WAYPOINT_ARRIVE;
      if (reached || waypointHold <= 0) pickWaypoint();
      target = autoTarget;
    }

    // Full-cruise pursuit, with no easing on approach. The rocket overshoots
    // its target and has to swing back around, which is what produces the
    // looping flight path rather than a settle-and-dart.
    desired.set(target.x - position.x, target.y - position.y, 0);
    const distance = desired.length();
    if (distance > 1e-5) desired.multiplyScalar(MAX_SPEED / distance);

    steer.subVectors(desired, velocity);
    if (steer.length() > MAX_FORCE) steer.setLength(MAX_FORCE);

    // Squash the loops toward the horizontal. Spring pulls back to the
    // horizon, damping bleeds off vertical speed so it settles instead of
    // oscillating.
    steer.y += -position.y * Y_FLATTEN - velocity.y * Y_DAMPING;

    // Containment steers rather than clamps, so the craft banks away from an
    // edge and keeps its arc instead of stopping dead against it.
    steer.x += softBoundsAxis(position.x, BOUNDS.x) * BOUNDS_FORCE;
    steer.y += softBoundsAxis(position.y, BOUNDS.y) * BOUNDS_FORCE;

    const accelLerp = 1 - Math.exp(-ACCEL_SMOOTH_RATE * rawDelta);
    smoothedAccel.lerp(steer, accelLerp);
    velocity.addScaledVector(smoothedAccel, delta);

    // Hold speed inside a narrow band. Without a floor the craft can stall
    // when steering opposes its heading, and a stalled rocket looks broken.
    const speed = velocity.length();
    if (speed > MAX_SPEED) velocity.setLength(MAX_SPEED);
    else if (speed < MIN_SPEED && speed > 1e-5) velocity.setLength(MIN_SPEED);

    position.addScaledVector(velocity, delta);

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
      // Breathing lag: each saucer falls further back, then hauls itself in.
      const lag =
        (UFO_LAG_BASE[i] ?? 1.87) +
        Math.sin(elapsed * UFO_LAG_RATE + i * UFO_LAG_PHASE) * UFO_LAG_SWING;
      if (!sampleTrail(lag, sample)) return;
      // Small perpendicular weave so the convoy is not a rigid conga line.
      const wobble = Math.sin(elapsed * 1.7 + i * 1.9) * 0.22;
      ufo.position.set(sample.x, sample.y + wobble, -0.15 - i * 0.05);
      // Saucers stay level; only a slight tilt into the direction of travel.
      ufo.rotation.z = Math.sin(elapsed * 1.3 + i) * 0.12;

      // Pot-shot, straight down like an Invaders bolt.
      nextFire[i] -= delta;
      if (nextFire[i] <= 0) {
        nextFire[i] =
          BOLT_INTERVAL_MIN + Math.random() * (BOLT_INTERVAL_MAX - BOLT_INTERVAL_MIN);
        const free = bolts.find((b) => b.life <= 0);
        if (free) {
          // Aim up the convoy at the rocket, using its position at the
          // moment of firing. The bolt then flies straight - it is a dumb
          // projectile, not a homing missile, so the rocket's own turning
          // makes most shots miss, which is the joke.
          const aimX = position.x - ufo.position.x;
          const aimY = position.y - ufo.position.y;
          const len = Math.hypot(aimX, aimY) || 1;
          free.vx = (aimX / len) * BOLT_SPEED;
          free.vy = (aimY / len) * BOLT_SPEED;
          free.life = BOLT_LIFE;
          free.mesh.position.set(ufo.position.x, ufo.position.y, -0.2);
          // Bolt geometry is drawn along Y, so square it to the heading.
          free.mesh.rotation.z = Math.atan2(free.vy, free.vx) - Math.PI / 2;
          free.mesh.visible = true;
        }
      }
    });

    for (const bolt of bolts) {
      if (bolt.life <= 0) continue;
      bolt.life -= delta;
      bolt.mesh.position.x += bolt.vx * delta;
      bolt.mesh.position.y += bolt.vy * delta;
      // Blink on the way down, so it reads as an 8-bit bolt rather than a
      // smooth falling tick.
      bolt.mesh.visible = Math.sin(bolt.life * 42) > -0.35;
      const strayed =
        Math.abs(bolt.mesh.position.x) > BOUNDS.x + 2 ||
        Math.abs(bolt.mesh.position.y) > BOUNDS.y + 2;
      if (bolt.life <= 0 || strayed) {
        bolt.life = 0;
        bolt.mesh.visible = false;
      }
    }

    renderer.render(scene, camera);
  }

  /*
   * Only run while the hero is actually on screen. rAF already stops for a
   * hidden TAB, but not for a canvas that has been scrolled past, so without
   * this the solver and a full WebGL draw keep going for the whole session on
   * a page the hero occupies only the top of.
   *
   * The first delta after a resume is clamped by the same Math.min in
   * animate(), so the craft picks up where it left off rather than jumping.
   */
  let running = false;

  function start() {
    if (running) return;
    running = true;
    clock.getDelta(); // discard time accumulated while parked
    frameId = requestAnimationFrame(animate);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frameId);
    frameId = 0;
  }

  const visibility = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) start();
    else stop();
  });
  visibility.observe(canvas);

  return function cleanup() {
    stop();
    visibility.disconnect();
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
