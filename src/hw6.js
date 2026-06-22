// Computer Graphics - Exercise 6 - Interactive Bowling Game
// Builds on the HW05 scene and adds the gameplay: aiming, power meter,
// ball physics, pin collisions/toppling and 10-frame scoring.

import {OrbitControls} from './OrbitControls.js'

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

scene.background = new THREE.Color(0x1a1a2e);

function degrees_to_radians(degrees) {
  var pi = Math.PI;
  return degrees * (pi / 180);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// foul line at Z=0, lane goes toward -Z, bowler stands at +Z
const LANE_WIDTH = 3.5;
const LANE_LENGTH = 60;
const LANE_HEIGHT = 0.2;
const LANE_TOP = LANE_HEIGHT / 2;
const APPROACH_LEN = 15;
const MARK_Y = LANE_TOP + 0.005;
const LANE_HALF = LANE_WIDTH / 2;

const BALL_R = 0.45;
const PIN_R = 0.13;
const PIN_REACH = 1.1;        // a falling pin can hit pins this close (they sit 1.0 apart)
const PROP_ALIGN = 0.55;      // how directly a pin must be in the fall path to get knocked
const READY_Z = 0.5;          // where the ball waits to be thrown
const GUTTER_Y = 0.0;
const PIN_DECK_END_Z = -60.5;

const MIN_SPEED = 30;
const MAX_SPEED = 50;
const FRICTION = 0.35;
const STOP_SPEED = 2.0;
const CURVE_ACCEL = 2.0;      // how hard the spin curves the ball

const AIM_STEP = 0.12;
const SPIN_STEP = 0.2;
const AIM_LIMIT = LANE_HALF - BALL_R;
const POWER_SPEED = 1.5;
const TOPPLE_TIME = 0.4;      // time for a pin to fall over
const RESOLVE_HOLD = 1.5;     // wait this long by the pins before clearing the ball

// pin positions (x, z), standard triangle
const PIN_HOMES = [
  [0.0, -57.0],     // 1 (head pin)
  [-0.5, -57.866],  // 2
  [0.5, -57.866],   // 3
  [-1.0, -58.732],  // 4
  [0.0, -58.732],   // 5
  [1.0, -58.732],   // 6
  [-1.5, -59.598],  // 7
  [-0.5, -59.598],  // 8
  [0.5, -59.598],   // 9
  [1.5, -59.598],   // 10
];

// ----- scene (from HW05) -----
function setupLighting() {
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));

  const sun = new THREE.DirectionalLight(0xffffff, 0.7);
  sun.position.set(8, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // make the shadow box big enough for the whole lane
  const c = sun.shadow.camera;
  c.left = -15; c.right = 15; c.top = 20; c.bottom = -70; c.near = 0.5; c.far = 120;
  sun.target.position.set(0, 0, -30);
  scene.add(sun);
  scene.add(sun.target);

  const spot = new THREE.SpotLight(0xffffff, 0.5, 0, degrees_to_radians(40), 0.4);
  spot.position.set(0, 18, -55);
  spot.target.position.set(0, 0, -58);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  scene.add(spot);
  scene.add(spot.target);
}

function createBowlingLane() {
  const mat = new THREE.MeshPhongMaterial({ color: 0xdeb887, shininess: 100, specular: 0x553311 });
  const lane = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH, LANE_HEIGHT, LANE_LENGTH), mat);
  lane.position.set(0, 0, -LANE_LENGTH / 2);
  lane.receiveShadow = true;
  scene.add(lane);
}

function createApproach() {
  const mat = new THREE.MeshPhongMaterial({ color: 0xc79a6b, shininess: 50, specular: 0x332211 });
  const approach = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH, LANE_HEIGHT, APPROACH_LEN), mat);
  approach.position.set(0, 0, APPROACH_LEN / 2);
  approach.receiveShadow = true;
  scene.add(approach);
}

function createGutters() {
  const width = 0.6;
  const mat = new THREE.MeshPhongMaterial({ color: 0x2b2b33, shininess: 30 });
  const x = LANE_WIDTH / 2 + width / 2;
  for (const side of [-1, 1]) {
    const gutter = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, LANE_LENGTH), mat);
    gutter.position.set(side * x, -0.1, -LANE_LENGTH / 2);
    gutter.receiveShadow = true;
    gutter.castShadow = true;
    scene.add(gutter);
  }
}

function createBumpers() {
  const mat = new THREE.MeshPhongMaterial({ color: 0xff6600, shininess: 80 });
  const bumperRadius = 0.07;
  const gutterCenterX = LANE_WIDTH / 2 + 0.3;
  for (const side of [-1, 1]) {
    const bumper = new THREE.Mesh(new THREE.CylinderGeometry(bumperRadius, bumperRadius, LANE_LENGTH, 16), mat);
    bumper.rotation.x = Math.PI / 2;
    bumper.position.set(side * gutterCenterX, 0.05 + bumperRadius, -LANE_LENGTH / 2);
    bumper.castShadow = true;
    bumper.receiveShadow = true;
    scene.add(bumper);
  }
}

function createFoulLine() {
  const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x222222 });
  const line = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH, 0.02, 0.18), mat);
  line.position.set(0, MARK_Y, 0);
  line.receiveShadow = true;
  scene.add(line);
}

function createApproachDots() {
  const mat = new THREE.MeshPhongMaterial({ color: 0x222222 });
  function row(z, count, spacing) {
    const start = -((count - 1) * spacing) / 2;
    for (let i = 0; i < count; i++) {
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16), mat);
      dot.position.set(start + i * spacing, MARK_Y, z);
      dot.receiveShadow = true;
      scene.add(dot);
    }
  }
  row(2.5, 7, 0.45);
  row(5.5, 5, 0.45);
}

function createLaneArrows() {
  const mat = new THREE.MeshPhongMaterial({ color: 0x5a2d0c, shininess: 40 });
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.35);
  shape.lineTo(-0.18, -0.2);
  shape.lineTo(0.18, -0.2);
  shape.lineTo(0, 0.35);
  for (const x of [-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5]) {
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(x, MARK_Y, -12 - (1.5 - Math.abs(x)) * 2);
    arrow.receiveShadow = true;
    scene.add(arrow);
  }
}

function createPinDeck() {
  const mat = new THREE.MeshPhongMaterial({ color: 0x6b4423, shininess: 90, specular: 0x888888 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH, 0.04, 4.5), mat);
  deck.position.set(0, LANE_TOP + 0.01, -58.3);
  deck.receiveShadow = true;
  scene.add(deck);
}

function createPin() {
  const pin = new THREE.Group();
  const profile = [
    [0.0, 0.0], [0.1, 0.0], [0.12, 0.06], [0.1, 0.12], [0.13, 0.22],
    [0.165, 0.38], [0.16, 0.5], [0.12, 0.68], [0.075, 0.82], [0.07, 0.88],
    [0.09, 0.96], [0.105, 1.05], [0.1, 1.12], [0.07, 1.2], [0.0, 1.25],
  ];
  const points = profile.map((p) => new THREE.Vector2(p[0], p[1]));

  const body = new THREE.Mesh(
    new THREE.LatheGeometry(points, 32),
    new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 70, specular: 0x333333 }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  pin.add(body);

  // red stripes on the neck
  const stripeMat = new THREE.MeshPhongMaterial({ color: 0xcc0000, shininess: 70 });
  for (const band of [{ y: 0.78, r: 0.085 }, { y: 0.92, r: 0.095 }]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(band.r, 0.018, 12, 32), stripeMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = band.y;
    ring.castShadow = true;
    pin.add(ring);
  }
  return pin;
}

const pins = [];
function createPins() {
  for (const [x, z] of PIN_HOMES) {
    const pin = createPin();
    pin.position.set(x, LANE_TOP, z);
    pin.userData = { home: { x, z }, standing: true, toppling: false, fallDir: null, fallAngle: 0, propagated: false };
    pins.push(pin);
    scene.add(pin);
  }
}

let ball;
let sweeperBar;
function createBall() {
  const group = new THREE.Group();
  const radius = BALL_R;

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 48),
    new THREE.MeshPhongMaterial({ color: 0x1565c0, shininess: 120, specular: 0xffffff, reflectivity: 1.0 }),
  );
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  group.add(sphere);

  // finger holes
  const holeMat = new THREE.MeshPhongMaterial({ color: 0x0a0a0a, shininess: 10 });
  for (const [x, z] of [[-0.09, 0.04], [0.09, 0.04], [0.0, -0.14]]) {
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 16), holeMat);
    const surfaceY = Math.sqrt(radius * radius - x * x - z * z);
    hole.position.set(x, surfaceY - 0.08, z);
    group.add(hole);
  }

  group.userData = { vel: new THREE.Vector3() };
  group.position.set(0, LANE_TOP + radius, READY_Z);
  scene.add(group);
  ball = group;
}

function countStandingPins() {
  return pins.reduce((n, p) => n + (p.userData.standing ? 1 : 0), 0);
}

function standUpAllPins() {
  for (const p of pins) {
    p.position.set(p.userData.home.x, LANE_TOP, p.userData.home.z);
    p.rotation.set(0, 0, 0);
    p.userData.standing = true;
    p.userData.toppling = false;
    p.userData.fallDir = null;
    p.userData.fallAngle = 0;
    p.userData.propagated = false;
  }
}

setupLighting();
createBowlingLane();
createApproach();
createGutters();
createBumpers();
createFoulLine();
createApproachDots();
createLaneArrows();
createPinDeck();
createPins();
createBall();
createSweeper();

// ----- camera + orbit controls -----
camera.position.set(0, 5, 12);
camera.lookAt(0, 1, -30);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, -30);
controls.update();
let isOrbitEnabled = true;
let followCam = true;

function setCameraPreset(preset) {
  const presets = [
    { pos: [0,  5,  12], target: [0, 1, -30] }, // bowler
    { pos: [0, 45, -30], target: [0, 0, -30] }, // overhead
    { pos: [0,  3, -70], target: [0, 1, -30] }, // pin-end
    { pos: [12, 4, 14], target: [0, 1, 8] },    // side
  ];
  const p = presets[preset - 1];
  if (!p) return;
  camera.position.set(...p.pos);
  controls.target.set(...p.target);
  controls.update();
}

const tmpVec = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();

// trail the ball down the lane while it rolls
function updateFollowCam() {
  tmpVec.set(ball.position.x * 0.4, 3.2, ball.position.z + 7);
  camera.position.lerp(tmpVec, 0.18);
  tmpTarget.set(ball.position.x * 0.4, 0.6, ball.position.z - 12);
  camera.lookAt(tmpTarget);
}

// look at the pins while the roll resolves so you can see what fell
function updatePinWatchCam() {
  tmpVec.set(ball.position.x * 0.2, 4.5, -50);
  camera.position.lerp(tmpVec, 0.12);
  camera.lookAt(0, 1.2, -58.3);
}

// ----- UI elements -----
const orbitState = document.getElementById('orbit-state');
const followState = document.getElementById('follow-state');
const spinState = document.getElementById('spin-state');
const phaseHint = document.getElementById('phase-hint');
const powerEl = document.getElementById('powermeter');
const powerFill = document.getElementById('power-fill');
const announceEl = document.getElementById('announce');
const grandTotalEl = document.getElementById('grand-total');
const frameEls = Array.from(document.querySelectorAll('#scorecard .frame'));

// ----- game state -----
const Phase = { AIMING: 'aiming', POWER: 'power', ROLLING: 'rolling', RESOLVING: 'resolving', PINSETTER: 'pinsetter', GAMEOVER: 'gameover' };
const gs = {
  phase: Phase.AIMING,
  frameIndex: 0,
  rollInFrame: 0,
  rolls: [],            // every ball thrown so far (pins knocked), used for scoring
  tenthBalls: [],       // balls thrown in the 10th frame
  aimX: 0,
  spin: 0,
  power: 0,
  powerDir: 1,
  standingBefore: 10,   // pins standing when the current ball was thrown
};
const clock = new THREE.Clock();

let rollInGutter = false;
let crashPlayed = false;
let resolveTimer = 0;
let resolved = false;
let pendingPins = 0;
let standingPinsBeforeRoll = []; // snapshot used to restore pins on a gutter ball

const PHASE_HINTS = {
  [Phase.AIMING]: 'Aim with ←/→, spin with ↑/↓, then press Space.',
  [Phase.POWER]: 'Press Space to lock power and release!',
  [Phase.ROLLING]: 'Rolling…',
  [Phase.RESOLVING]: 'Counting pins…',
  [Phase.PINSETTER]: 'Clearing pins…',
  [Phase.GAMEOVER]: 'Game over - press R for a new game.',
};

function setPhase(p) {
  gs.phase = p;
  powerEl.classList.toggle('idle', p !== Phase.POWER);
  phaseHint.textContent = PHASE_HINTS[p];
  updateActiveFrame();
}

function updateActiveFrame() {
  frameEls.forEach((el, i) =>
    el.classList.toggle('active', i === gs.frameIndex && gs.phase !== Phase.GAMEOVER));
}

// ----- scoring -----
function markPins(pins, isFirstBall) {
  if (pins === 0) return '-';
  if (pins === 10 && isFirstBall) return 'X';
  return String(pins);
}

// the 10th frame has three boxes, handle them separately
function tenthFrameMarks(a, b, c) {
  const out = ['', '', ''];
  if (a === undefined) return out;
  out[0] = (a === 10) ? 'X' : markPins(a, true);
  if (b === undefined) return out;

  if (a === 10) {
    out[1] = (b === 10) ? 'X' : markPins(b, true);
  } else if (a + b === 10) {
    out[1] = '/';
  } else {
    out[1] = markPins(b, false);
  }
  if (c === undefined) return out;

  if (a === 10) {
    if (b === 10) out[2] = (c === 10) ? 'X' : markPins(c, true);
    else if (b + c === 10) out[2] = '/';
    else out[2] = markPins(c, false);
  } else {
    out[2] = (c === 10) ? 'X' : markPins(c, true);
  }
  return out;
}

// go frame by frame and add the strike/spare bonuses from the next balls
function computeScorecard(rolls) {
  const frames = [];
  let i = 0, total = 0, totalKnown = true, complete = false;

  for (let f = 0; f < 10; f++) {
    if (i >= rolls.length) break;

    if (f < 9) {
      const first = rolls[i];
      if (first === 10) {
        // strike: 10 + next two balls
        const b1 = rolls[i + 1], b2 = rolls[i + 2];
        const frameScore = (b1 !== undefined && b2 !== undefined) ? 10 + b1 + b2 : null;
        if (totalKnown && frameScore !== null) total += frameScore; else totalKnown = false;
        frames.push({ rolls: ['', 'X'], cumulative: totalKnown ? total : null });
        i += 1;
      } else {
        const second = rolls[i + 1];
        if (second === undefined) {
          frames.push({ rolls: [markPins(first, true), ''], cumulative: null });
          break;
        }
        if (first + second === 10) {
          // spare: 10 + next ball
          const b1 = rolls[i + 2];
          const frameScore = (b1 !== undefined) ? 10 + b1 : null;
          if (totalKnown && frameScore !== null) total += frameScore; else totalKnown = false;
          frames.push({ rolls: [markPins(first, true), '/'], cumulative: totalKnown ? total : null });
        } else {
          // open frame
          if (totalKnown) total += first + second;
          frames.push({ rolls: [markPins(first, true), markPins(second, false)], cumulative: totalKnown ? total : null });
        }
        i += 2;
      }
    } else {
      // 10th frame, just add up the balls
      const a = rolls[i], b = rolls[i + 1], c = rolls[i + 2];
      const marks = tenthFrameMarks(a, b, c);
      let needed;
      if (a === 10) needed = 3;
      else if (b !== undefined && a + b === 10) needed = 3;
      else needed = 2;
      const thrown = [a, b, c].filter((v) => v !== undefined).length;
      if (thrown >= needed && totalKnown) {
        total += [a, b, c].reduce((s, v) => s + (v || 0), 0);
        frames.push({ rolls: marks, cumulative: total });
        complete = true;
      } else {
        frames.push({ rolls: marks, cumulative: null });
      }
    }
  }
  return { frames, total, complete };
}

function renderScorecard(card) {
  for (let i = 0; i < 10; i++) {
    const el = frameEls[i];
    const spans = el.querySelectorAll('.rolls span');
    const totalEl = el.querySelector('.total');
    const fr = card.frames[i];
    if (!fr) {
      spans.forEach((s) => (s.textContent = ''));
      totalEl.textContent = '';
      continue;
    }
    spans.forEach((s, j) => (s.textContent = fr.rolls[j] != null ? fr.rolls[j] : ''));
    totalEl.textContent = fr.cumulative != null ? fr.cumulative : '';
  }
  grandTotalEl.textContent = 'Total: ' + card.total;
}

// ----- announcements -----
let announceTimer = null;
function showAnnounce(text, persist) {
  announceEl.textContent = text;
  announceEl.classList.add('show');
  if (announceTimer) clearTimeout(announceTimer);
  if (!persist) announceTimer = setTimeout(() => announceEl.classList.remove('show'), 1500);
}
function hideAnnounce() {
  if (announceTimer) clearTimeout(announceTimer);
  announceEl.classList.remove('show');
}

// ----- sound (Web Audio, no files) -----
let audioCtx = null, noiseBuffer = null, rollSource = null, rollGain = null;
function initAudio() {
  if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const len = Math.floor(audioCtx.sampleRate * 1.0);
    noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  } catch (e) { audioCtx = null; }
}
function startRoll() {
  if (!audioCtx) return;
  stopRoll();
  rollSource = audioCtx.createBufferSource();
  rollSource.buffer = noiseBuffer;
  rollSource.loop = true;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 180;
  rollGain = audioCtx.createGain();
  rollGain.gain.value = 0;
  rollSource.connect(lp).connect(rollGain).connect(audioCtx.destination);
  rollSource.start();
  rollGain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.1);
}
function stopRoll() {
  if (!audioCtx || !rollSource) return;
  try {
    rollGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
    rollSource.stop(audioCtx.currentTime + 0.15);
  } catch (e) {}
  rollSource = null;
}
function playCrash() {
  if (!audioCtx) return;
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffer;
  const hp = audioCtx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 700;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.5, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
  src.connect(hp).connect(g).connect(audioCtx.destination);
  src.start();
  src.stop(audioCtx.currentTime + 0.4);
}
function playChime(freqs, dur) {
  if (!audioCtx) return;
  freqs.forEach((f, i) => {
    const o = audioCtx.createOscillator();
    o.type = 'sine'; o.frequency.value = f;
    const g = audioCtx.createGain();
    const t0 = audioCtx.currentTime + i * 0.08;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.25, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  });
}
const playStrike = () => playChime([523.25, 659.25, 783.99, 1046.5], 0.5);
const playSpare = () => playChime([523.25, 659.25], 0.4);

// ----- aim guide line -----
const AIM_PTS = 40;
const aimGuide = new THREE.Line(
  new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(AIM_PTS * 3), 3)),
  new THREE.LineBasicMaterial({ color: 0x5dade2 }),
);
aimGuide.visible = false;
scene.add(aimGuide);

function launchVelocity(power) {
  return new THREE.Vector3(0, 0, -(MIN_SPEED + power * (MAX_SPEED - MIN_SPEED)));
}

// draw the predicted path (same maths as the rolling ball) so the hook is visible
function updateAimGuide() {
  const show = gs.phase === Phase.AIMING || gs.phase === Phase.POWER;
  aimGuide.visible = show;
  if (!show) return;
  const pos = aimGuide.geometry.attributes.position.array;
  let x = gs.aimX, z = READY_Z;
  // during POWER phase show the path for the live power level; otherwise use a mid-power preview
  const previewPower = gs.phase === Phase.POWER ? gs.power : 0.6;
  const v = launchVelocity(previewPower);
  let vx = v.x, vz = v.z;
  const dt = 0.03;
  let lastX = x, lastZ = z;
  for (let i = 0; i < AIM_PTS; i++) {
    if (z > -56) {
      lastX = x; lastZ = z;
      vx += gs.spin * CURVE_ACCEL * dt;
      const f = Math.max(0, 1 - FRICTION * dt);
      vx *= f; vz *= f;
      x += vx * dt; z += vz * dt;
    } else { x = lastX; z = lastZ; }
    pos[i * 3] = x;
    pos[i * 3 + 1] = MARK_Y + 0.03;
    pos[i * 3 + 2] = z;
  }
  aimGuide.geometry.attributes.position.needsUpdate = true;
}

// ----- power meter -----
function updatePowerMeter(dt) {
  gs.power += gs.powerDir * POWER_SPEED * dt;
  if (gs.power >= 1) { gs.power = 1; gs.powerDir = -1; }
  if (gs.power <= 0) { gs.power = 0; gs.powerDir = 1; }
  renderPowerMeter();
}
function renderPowerMeter() {
  powerFill.style.width = (gs.power * 100).toFixed(1) + '%';
  powerFill.style.background = gs.power < 0.5 ? '#2ecc71' : gs.power < 0.8 ? '#f1c40f' : '#e74c3c';
}

// ----- ball physics -----
const axis = new THREE.Vector3();

function releaseBall() {
  gs.power = Math.max(0.05, gs.power);
  ball.userData.vel.copy(launchVelocity(gs.power));
  ball.position.set(gs.aimX, LANE_TOP + BALL_R, READY_Z);
  ball.rotation.set(0, 0, 0);
  rollInGutter = false;
  crashPlayed = false;
  resolveTimer = 0;
  gs.standingBefore = countStandingPins();
  // snapshot which pins are standing so we can restore them on a gutter ball
  standingPinsBeforeRoll = pins.filter((p) => p.userData.standing);
  startRoll();
  setPhase(Phase.ROLLING);
}

function updateRolling(dt) {
  const v = ball.userData.vel;

  // spin curves the ball sideways
  if (!rollInGutter) v.x += gs.spin * CURVE_ACCEL * dt;

  // friction
  v.multiplyScalar(Math.max(0, 1 - FRICTION * dt));

  ball.position.addScaledVector(v, dt);

  // spin the ball so it looks like it's rolling
  const speed = v.length();
  if (speed > 1e-3) {
    axis.set(v.z, 0, -v.x).normalize();
    ball.rotateOnWorldAxis(axis, (speed / BALL_R) * dt);
  }

  // gutter ball
  if (!rollInGutter && Math.abs(ball.position.x) > LANE_HALF) {
    rollInGutter = true;
    const s = Math.sign(ball.position.x);
    ball.position.x = s * (LANE_HALF + 0.15);
    v.x = 0;
    gs.spin = 0;
  }
  if (rollInGutter) ball.position.y = GUTTER_Y;

  resolvePinCollisions();

  // roll is over when ball passes the pin deck or slows to a stop
  // gutter balls are allowed to continue rolling to the end — do NOT stop immediately on gutter entry
  if (ball.position.z < PIN_DECK_END_Z || speed < STOP_SPEED) {
    enterResolving();
  }
}

function enterResolving() {
  ball.userData.vel.set(0, 0, 0);
  stopRoll();
  resolveTimer = 0;
  resolved = false;
  setPhase(Phase.RESOLVING);
}

// ----- pinsetter / sweeper animation -----
const PINSETTER_DURATION = 1.1;  // seconds for the sweeper to cross the pin deck
let pinsetterTimer = 0;

function createSweeper() {
  const mat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, shininess: 50 });
  sweeperBar = new THREE.Mesh(
    new THREE.BoxGeometry(LANE_WIDTH + 0.3, 0.7, 0.18),
    mat,
  );
  sweeperBar.position.set(0, LANE_TOP + 0.55, -55.5);
  sweeperBar.castShadow = true;
  sweeperBar.receiveShadow = true;
  sweeperBar.visible = false;
  scene.add(sweeperBar);
}

function enterPinsetter() {
  pinsetterTimer = 0;
  sweeperBar.position.set(0, LANE_TOP + 0.55, -55.5);
  sweeperBar.visible = true;
  // Return the ball to the approach while the sweeper runs
  ball.userData.vel.set(0, 0, 0);
  ball.rotation.set(0, 0, 0);
  ball.position.set(0, LANE_TOP + BALL_R, READY_Z);
  setPhase(Phase.PINSETTER);
}

function updatePinsetter(dt) {
  pinsetterTimer += dt;
  const t = Math.min(pinsetterTimer / PINSETTER_DURATION, 1.0);

  // sweep bar travels from z=-55.5 to z=-62 (past all pins)
  sweeperBar.position.z = -55.5 - t * 7.5;

  // slide fallen pins backward and sink them below the deck
  for (const p of pins) {
    if (!p.userData.standing) {
      p.position.z -= 2.5 * dt;
      p.position.y -= 1.2 * dt;
    }
  }

  if (t >= 1.0) {
    sweeperBar.visible = false;
    advance(pendingPins);
  }
}

// ----- collisions / toppling -----
function startTopple(pin, dirX, dirZ) {
  if (!pin.userData.standing || pin.userData.toppling) return;
  pin.userData.toppling = true;
  const len = Math.hypot(dirX, dirZ) || 1;
  pin.userData.fallDir = new THREE.Vector2(dirX / len, dirZ / len);
  pin.userData.propagated = false;
  if (!crashPlayed) { playCrash(); crashPlayed = true; }
}

// ball vs pins: knock down anything the ball touches
function resolvePinCollisions() {
  if (rollInGutter) return;
  const bx = ball.position.x, bz = ball.position.z;
  for (const p of pins) {
    if (!p.userData.standing || p.userData.toppling) continue;
    const dx = p.position.x - bx, dz = p.position.z - bz;
    const dist = Math.hypot(dx, dz);
    if (dist < BALL_R + PIN_R) {
      startTopple(p, dist > 1e-3 ? dx : 0, dist > 1e-3 ? dz : -1);
      ball.userData.vel.multiplyScalar(0.99);
    }
  }
}

// a falling pin knocks the pins it falls onto
function propagate(faller) {
  const fd = faller.userData.fallDir;
  for (const p of pins) {
    if (!p.userData.standing || p.userData.toppling) continue;
    const dx = p.position.x - faller.position.x;
    const dz = p.position.z - faller.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > PIN_REACH || dist < 1e-3) continue;
    const dirx = dx / dist, dirz = dz / dist;
    if (dirx * fd.x + dirz * fd.y > PROP_ALIGN) startTopple(p, dirx, dirz);
  }
}

function updateTopples(dt) {
  const speed = (Math.PI / 2) / TOPPLE_TIME;
  for (const p of pins) {
    if (!p.userData.toppling) continue;
    p.userData.fallAngle = Math.min(Math.PI / 2, p.userData.fallAngle + speed * dt);
    const d = p.userData.fallDir;
    axis.set(d.y, 0, -d.x).normalize();
    p.setRotationFromAxisAngle(axis, p.userData.fallAngle);
    // once it's partway down, let it knock its neighbours
    if (!p.userData.propagated && p.userData.fallAngle > Math.PI / 5) {
      p.userData.propagated = true;
      propagate(p);
    }
    if (p.userData.fallAngle >= Math.PI / 2) {
      p.userData.toppling = false;
      p.userData.standing = false;
    }
  }
}

// ----- resolving + game flow -----
function updateResolving(dt) {
  // wait for the pins to finish falling
  if (pins.some((p) => p.userData.toppling)) return;

  if (!resolved) {
    resolved = true;
    resolveTimer = 0;

    if (rollInGutter) {
      // Per spec: a gutter ball knocks zero pins regardless of any clip before entering gutter.
      // Restore any pins that started toppling during the gutter roll.
      for (const p of standingPinsBeforeRoll) {
        if (!p.userData.standing) {
          p.position.set(p.userData.home.x, LANE_TOP, p.userData.home.z);
          p.rotation.set(0, 0, 0);
          p.userData.standing = true;
          p.userData.toppling = false;
          p.userData.fallDir = null;
          p.userData.fallAngle = 0;
          p.userData.propagated = false;
        }
      }
      pendingPins = 0;
      showAnnounce('GUTTER!');
    } else {
      const standingAfter = countStandingPins();
      pendingPins = gs.standingBefore - standingAfter;
      if (gs.standingBefore === 10 && pendingPins === 10) {
        showAnnounce('STRIKE!'); playStrike();
      } else if (gs.standingBefore < 10 && standingAfter === 0) {
        showAnnounce('SPARE!'); playSpare();
      }
    }
    recordRoll(pendingPins);
    return;
  }

  // let the ball sit by the pins for a moment, then trigger the pinsetter
  resolveTimer += dt;
  if (resolveTimer < RESOLVE_HOLD) return;
  // skip the sweeper animation for gutter balls — all pins are already standing
  if (rollInGutter) { advance(pendingPins); } else { enterPinsetter(); }
}

function recordRoll(pins) {
  gs.rolls.push(pins);
  renderScorecard(computeScorecard(gs.rolls));
}

function advance(pins) {
  if (gs.frameIndex < 9) {
    if (gs.rollInFrame === 0) {
      if (pins === 10) {
        nextFrame();               // strike, skip the second ball
      } else {
        gs.rollInFrame = 1;
        beginNextThrow(false);     // second ball at the same pins
      }
    } else {
      nextFrame();
    }
  } else {
    // 10th frame
    gs.tenthBalls.push(pins);
    const [a, b] = gs.tenthBalls;
    let done;
    if (gs.tenthBalls.length === 1) done = false;
    else if (gs.tenthBalls.length === 2) done = !((a === 10) || (a + b === 10));
    else done = true;

    if (done) {
      const card = computeScorecard(gs.rolls);
      setPhase(Phase.GAMEOVER);
      showAnnounce('GAME OVER', true);
      phaseHint.textContent = 'Final score: ' + card.total + '. Press R for a new game.';
    } else {
      gs.rollInFrame += 1;
      beginNextThrow(shouldResetRack());
    }
  }
}

function nextFrame() {
  gs.frameIndex += 1;
  gs.rollInFrame = 0;
  beginNextThrow(true);
}

// should we set up a full rack of 10 before the next ball?
function shouldResetRack() {
  if (gs.frameIndex < 9) return gs.rollInFrame === 0;
  // 10th frame
  if (gs.rollInFrame === 0) return true;
  const [a, b] = gs.tenthBalls;
  if (gs.rollInFrame === 1) return a === 10;
  if (a === 10) return b === 10;
  return true;
}

function resetBallToReady() {
  ball.userData.vel.set(0, 0, 0);
  ball.rotation.set(0, 0, 0);
  ball.position.set(gs.aimX, LANE_TOP + BALL_R, READY_Z);
}

function beginNextThrow(reset) {
  if (reset) standUpAllPins();
  gs.aimX = 0;
  setSpin(0);
  resetBallToReady();
  setPhase(Phase.AIMING);
  if (followCam) setCameraPreset(1);
}

function resetGame() {
  gs.frameIndex = 0;
  gs.rollInFrame = 0;
  gs.rolls.length = 0;
  gs.tenthBalls.length = 0;
  gs.aimX = 0;
  setSpin(0);
  gs.power = 0;
  gs.powerDir = 1;
  gs.standingBefore = 10;
  rollInGutter = false;
  resolved = false;
  sweeperBar.visible = false;
  standUpAllPins();
  resetBallToReady();
  renderScorecard(computeScorecard(gs.rolls));
  renderPowerMeter();
  hideAnnounce();
  stopRoll();
  setPhase(Phase.AIMING);
  if (followCam) setCameraPreset(1);
}

function setSpin(v) {
  gs.spin = clamp(v, -1, 1);
  if (!spinState) return;
  if (Math.abs(gs.spin) < 0.001) spinState.textContent = 'none';
  else spinState.textContent = (gs.spin > 0 ? 'right ' : 'left ') + Math.abs(gs.spin).toFixed(2);
}

// ----- input -----
function handleKeyDown(e) {
  initAudio(); // browsers won't play sound until the user presses a key

  const k = e.key;
  if (k === 'r' || k === 'R') { resetGame(); return; }
  if (k === 'o' || k === 'O') { isOrbitEnabled = !isOrbitEnabled; orbitState.textContent = isOrbitEnabled ? 'on' : 'off'; return; }
  if (k === 'f' || k === 'F') { followCam = !followCam; followState.textContent = followCam ? 'on' : 'off'; return; }
  if (k >= '1' && k <= '4') { setCameraPreset(parseInt(k)); return; }

  if (gs.phase === Phase.AIMING) {
    if (k === 'ArrowLeft') { gs.aimX = clamp(gs.aimX - AIM_STEP, -AIM_LIMIT, AIM_LIMIT); resetBallToReady(); e.preventDefault(); }
    else if (k === 'ArrowRight') { gs.aimX = clamp(gs.aimX + AIM_STEP, -AIM_LIMIT, AIM_LIMIT); resetBallToReady(); e.preventDefault(); }
    else if (k === 'ArrowUp') { setSpin(gs.spin + SPIN_STEP); e.preventDefault(); }
    else if (k === 'ArrowDown') { setSpin(gs.spin - SPIN_STEP); e.preventDefault(); }
    else if (k === ' ') { gs.power = 0; gs.powerDir = 1; setPhase(Phase.POWER); e.preventDefault(); }
  } else if (gs.phase === Phase.POWER) {
    if (k === ' ' && !e.repeat) { releaseBall(); e.preventDefault(); }
  }
}
document.addEventListener('keydown', handleKeyDown);

// ----- main loop -----
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05); // cap dt so the ball can't skip past pins

  if (gs.phase === Phase.POWER) updatePowerMeter(dt);
  if (gs.phase === Phase.ROLLING) updateRolling(dt);
  updateTopples(dt);
  if (gs.phase === Phase.RESOLVING) updateResolving(dt);
  if (gs.phase === Phase.PINSETTER) updatePinsetter(dt);
  updateAimGuide();

  if (followCam && gs.phase === Phase.ROLLING) {
    controls.enabled = false;
    updateFollowCam();
  } else if (followCam && (gs.phase === Phase.RESOLVING || gs.phase === Phase.PINSETTER)) {
    controls.enabled = false;
    updatePinWatchCam();
  } else {
    controls.enabled = isOrbitEnabled;
    controls.update();
  }

  renderer.render(scene, camera);
}

renderScorecard(computeScorecard(gs.rolls));
renderPowerMeter();
setPhase(Phase.AIMING);
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
