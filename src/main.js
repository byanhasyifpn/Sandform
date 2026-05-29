// ============================================================
//  SANDFORM — Hand Tracking Particle System (v4)
//  Interactive sculpture · dual-hand scale · persistent idle
// ============================================================

import * as THREE from 'three';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// ────────────────────────────────────────────────────────────
//  1. CONSTANTS & CONFIG
// ────────────────────────────────────────────────────────────

const PARTICLE_COUNT = 6500;

const POSITION_LERP = 0.09;
const COLOR_LERP    = 0.05;
const MORPH_LERP    = 0.08;
const CAMERA_LERP   = 0.03;
const SCALE_LERP    = 0.07;
const ROTATION_DAMP = 0.92;

const GESTURE_CONFIG = {
  open_palm:  { name: 'Sphere',   color: new THREE.Color(0x33bbff), shape: 'sphere'  },
  fist:       { name: 'Cube',     color: new THREE.Color(0xff5522), shape: 'cube'    },
  pinch:      { name: 'Heart',    color: new THREE.Color(0xff2d9b), shape: 'heart'   },
  peace:      { name: 'Saturn',   color: new THREE.Color(0xaa77ff), shape: 'saturn'  },
  pointing:   { name: 'Helix',    color: new THREE.Color(0x00e8ff), shape: 'helix'   },
  thumbs_up:  { name: 'Diamond',  color: new THREE.Color(0xffcc33), shape: 'diamond' },
};

const viewport = {
  scaleFactor: 0.95,
  cameraZ: 4.8,
  baseCameraZ: 4.8,
  particleSize: 0.058,
  shapeScale: 1.15,
  handMoveScale: 1.0,
  moveRangeX: 3.2,
  moveRangeY: 2.6,
};

function updateViewportMetrics() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const minDim = Math.min(w, h);
  const aspect = w / h;

  const isMobile = minDim < 520;
  const isTablet = minDim < 900 && !isMobile;
  const isLandscapeMobile = isMobile && aspect > 1.2;

  let scaleFactor;
  if (isMobile) {
    scaleFactor = isLandscapeMobile ? 0.72 : 0.78;
  } else if (isTablet) {
    scaleFactor = 0.88;
  } else {
    scaleFactor = Math.max(0.9, Math.min(1.08, 0.96 * (minDim / 850)));
  }

  let cameraZ;
  if (isMobile) {
    cameraZ = isLandscapeMobile ? 5.8 : 5.5;
  } else if (isTablet) {
    cameraZ = 5.0;
  } else {
    cameraZ = 4.75 + Math.max(0, (1100 - minDim) * 0.0008);
  }

  const particleSize = isMobile ? 0.068 : isTablet ? 0.062 : 0.056;

  viewport.scaleFactor = scaleFactor;
  viewport.cameraZ = cameraZ;
  viewport.baseCameraZ = cameraZ;
  viewport.particleSize = particleSize;
  viewport.shapeScale = Math.max(1.05, minDim / 650);
  viewport.handMoveScale = isMobile ? 0.7 : isTablet ? 0.88 : 1.0;
  viewport.moveRangeX = isMobile ? 2.0 : isTablet ? 2.6 : 3.2;
  viewport.moveRangeY = isMobile ? 1.6 : isTablet ? 2.1 : 2.6;
}

updateViewportMetrics();

// ────────────────────────────────────────────────────────────
//  2. SCENE SETUP
// ────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x030508, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x030508, 0.014);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, viewport.cameraZ);

const cameraTarget = new THREE.Vector3(0, 0, viewport.cameraZ);
const cameraLookAt = new THREE.Vector3(0, 0, 0);

scene.add(new THREE.AmbientLight(0x1a2a4a, 1.2));

const pointLight1 = new THREE.PointLight(0x00aaff, 5, 20);
pointLight1.position.set(3, 3, 3);
scene.add(pointLight1);

const pointLight2 = new THREE.PointLight(0xff4400, 3.5, 15);
pointLight2.position.set(-3, -2, 2);
scene.add(pointLight2);

const rimLight = new THREE.PointLight(0xffffff, 2.5, 25);
rimLight.position.set(0, 0, -5);
scene.add(rimLight);

// ────────────────────────────────────────────────────────────
//  3. PARTICLE SYSTEM
// ────────────────────────────────────────────────────────────

const geometry = new THREE.BufferGeometry();
const positions       = new Float32Array(PARTICLE_COUNT * 3);
const targetPositions = new Float32Array(PARTICLE_COUNT * 3);
const colors          = new Float32Array(PARTICLE_COUNT * 3);
const randomSeeds     = new Float32Array(PARTICLE_COUNT * 3);
const helixPhases     = new Float32Array(PARTICLE_COUNT);

for (let i = 0; i < PARTICLE_COUNT; i++) {
  const i3 = i * 3;
  positions[i3] = positions[i3 + 1] = positions[i3 + 2] = 0;
  targetPositions[i3] = targetPositions[i3 + 1] = targetPositions[i3 + 2] = 0;
  colors[i3] = 0.3; colors[i3 + 1] = 0.45; colors[i3 + 2] = 0.7;
  randomSeeds[i3]     = Math.random() * Math.PI * 2;
  randomSeeds[i3 + 1] = Math.random() * Math.PI * 2;
  randomSeeds[i3 + 2] = Math.random() * Math.PI * 2;
  helixPhases[i] = Math.random() * Math.PI * 2;
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const material = new THREE.PointsMaterial({
  size: viewport.particleSize,
  vertexColors: true,
  transparent: true,
  opacity: 0.9,
  sizeAttenuation: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

// Group: translasi 2D + rotasi di pusat geometri shape
const sculptureGroup = new THREE.Group();
scene.add(sculptureGroup);

const particles = new THREE.Points(geometry, material);
sculptureGroup.add(particles);
sculptureGroup.scale.setScalar(viewport.scaleFactor);

const ambientGeometry = new THREE.BufferGeometry();
const ambientCount = 80;
const ambientPositions = new Float32Array(ambientCount * 3);
for (let i = 0; i < ambientCount; i++) {
  ambientPositions[i * 3]     = (Math.random() - 0.5) * 16;
  ambientPositions[i * 3 + 1] = (Math.random() - 0.5) * 16;
  ambientPositions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 3;
}
ambientGeometry.setAttribute('position', new THREE.BufferAttribute(ambientPositions, 3));
const ambientParticles = new THREE.Points(
  ambientGeometry,
  new THREE.PointsMaterial({
    size: 0.014, color: 0x3366aa, transparent: true, opacity: 0.18,
    sizeAttenuation: true, blending: THREE.AdditiveBlending,
  })
);
scene.add(ambientParticles);

// ────────────────────────────────────────────────────────────
//  4. SHAPE UTILITIES
// ────────────────────────────────────────────────────────────

const S = () => viewport.shapeScale;

function heartCurve2D(t) {
  const sinT = Math.sin(t);
  return [
    Math.pow(sinT, 3),
    (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16,
  ];
}

function push(pos, x, y, z) { pos.push(x, y, z); }

// ────────────────────────────────────────────────────────────
//  5. SHAPE GENERATORS
// ────────────────────────────────────────────────────────────

function generateSphere(count, radius = 1.65 * S()) {
  const pos = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const rAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const r = radius * (0.996 + (i % 4) * 0.001);
    push(pos, r * Math.cos(theta) * rAtY, r * y, r * Math.sin(theta) * rAtY);
  }
  return pos;
}

function generateCube(count, half = 1.45 * S()) {
  const pos = [];
  const edges = [
    (t) => [half * (2 * t - 1), -half, -half], (t) => [half * (2 * t - 1), -half, half],
    (t) => [-half, -half, half * (2 * t - 1)], (t) => [half, -half, half * (2 * t - 1)],
    (t) => [half * (2 * t - 1), half, -half], (t) => [half * (2 * t - 1), half, half],
    (t) => [-half, half, half * (2 * t - 1)], (t) => [half, half, half * (2 * t - 1)],
    (t) => [-half, half * (2 * t - 1), -half], (t) => [half, half * (2 * t - 1), -half],
    (t) => [-half, half * (2 * t - 1), half], (t) => [half, half * (2 * t - 1), half],
  ];
  const cornerCount = Math.floor(count * 0.1);
  const perEdge = Math.floor((count - cornerCount) / edges.length);
  const jitter = 0.01 * S();

  for (const edgeFn of edges) {
    for (let i = 0; i < perEdge; i++) {
      const t = i / Math.max(1, perEdge - 1);
      const p = edgeFn(t);
      push(pos, p[0] + (Math.random() - 0.5) * jitter, p[1] + (Math.random() - 0.5) * jitter, p[2] + (Math.random() - 0.5) * jitter);
    }
  }
  const corners = [[-1,-1,-1],[1,-1,-1],[-1,-1,1],[1,-1,1],[-1,1,-1],[1,1,-1],[-1,1,1],[1,1,1]];
  for (let i = 0; i < cornerCount; i++) {
    const c = corners[i % 8];
    push(pos, c[0] * half, c[1] * half, c[2] * half);
  }
  return pos.slice(0, count * 3);
}

function generateHeart(count, scale = 1.45 * S()) {
  const pos = [];
  const outlineCount = Math.floor(count * 0.75);
  const layerCount = Math.floor(count * 0.15);
  const fillCount = count - outlineCount - layerCount;
  const norm = scale * 0.92;
  const yOffset = -0.1 * scale;

  for (let i = 0; i < outlineCount; i++) {
    const t = (i / outlineCount) * Math.PI * 2;
    const [hx, hy] = heartCurve2D(t);
    const layer = [-0.12, 0, 0.12][i % 3];
    const d = Math.sqrt(Math.max(0.25, 1 - layer * layer * 2));
    push(pos, hx * norm * d, hy * norm * d + yOffset, layer * norm * 0.32);
  }
  for (let i = 0; i < layerCount; i++) {
    const t = (i / layerCount) * Math.PI * 2;
    const [hx, hy] = heartCurve2D(t);
    push(pos, hx * norm * 0.84, hy * norm * 0.84 + yOffset, Math.sin(t * 2) * 0.07 * norm);
  }
  for (let i = 0; i < fillCount; i++) {
    const t = (i / fillCount) * Math.PI * 2;
    const [hx, hy] = heartCurve2D(t);
    const r = 0.4 + (i % 6) / 6 * 0.4;
    push(pos, hx * norm * r, hy * norm * r + yOffset, 0);
  }
  return pos.slice(0, count * 3);
}

/**
 * Saturn — solid planet sphere + dense tilted ring with depth bands
 */
function generateSaturn(count) {
  const pos = [];
  const planetR = 0.82 * S();
  const ringInner = 1.18 * S();
  const ringMid = 1.55 * S();
  const ringOuter = 2.05 * S();
  const tilt = (27 * Math.PI) / 180;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  const planetCount = Math.floor(count * 0.26);
  const ringCount = count - planetCount;

  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < planetCount; i++) {
    const y = 1 - (i / Math.max(1, planetCount - 1)) * 2;
    const rAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const r = planetR * (0.997 + (i % 3) * 0.002);
    push(pos, r * Math.cos(theta) * rAtY, r * y, r * Math.sin(theta) * rAtY);
  }

  const innerBand = Math.floor(ringCount * 0.12);
  const mainBand = Math.floor(ringCount * 0.76);
  const outerBand = ringCount - innerBand - mainBand;

  function addRingParticle(angle, radius, bandIdx) {
    const thickness =
      bandIdx === 0 ? 0.008 * S() :
      bandIdx === 1 ? 0.028 * S() : 0.014 * S();
    const layer = (bandIdx + (Math.floor(angle * 40) % 3)) * 0.003 * S();
    const x = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);
    const yLocal = (Math.random() - 0.5) * thickness + layer;
    push(pos, x, yLocal * cosT - z * sinT * 0.02, z * cosT + yLocal * sinT);
  }

  for (let i = 0; i < innerBand; i++) {
    const angle = (i / innerBand) * Math.PI * 2;
    const radius = ringInner + (i / innerBand) * (ringMid - ringInner) * 0.3;
    addRingParticle(angle, radius, 0);
  }

  for (let i = 0; i < mainBand; i++) {
    const angle = (i / mainBand) * Math.PI * 2;
    const t = i / mainBand;
    const radius = ringInner + t * (ringOuter - ringInner);
    addRingParticle(angle, radius, 1);
    if (i % 2 === 0) addRingParticle(angle + 0.04, radius * 0.998, 1);
  }

  for (let i = 0; i < outerBand; i++) {
    const angle = (i / outerBand) * Math.PI * 2;
    const radius = ringMid + (i / outerBand) * (ringOuter - ringMid);
    addRingParticle(angle, radius, 2);
  }

  return pos.slice(0, count * 3);
}

function generateDoubleHelix(count, radius = 0.78 * S(), height = 2.9 * S(), turns = 4.2, tubeR = 0.12 * S()) {
  const pos = [];
  const samplesPerPoint = 4;
  const strandBudget = Math.floor(count * 0.9);
  const pointsPerStrand = Math.floor(strandBudget / 2 / samplesPerPoint);

  for (let strand = 0; strand < 2; strand++) {
    const phase = strand * Math.PI;
    for (let i = 0; i < pointsPerStrand; i++) {
      const t = i / Math.max(1, pointsPerStrand - 1);
      const angle = t * Math.PI * 2 * turns + phase;
      const y = (t - 0.5) * height;
      const cx = radius * Math.cos(angle);
      const cz = radius * Math.sin(angle);
      for (let s = 0; s < samplesPerPoint; s++) {
        const ta = (s / samplesPerPoint) * Math.PI * 2;
        push(pos, cx + tubeR * Math.cos(ta), y, cz + tubeR * Math.sin(ta));
      }
    }
  }

  const rungCount = Math.floor(turns * 10);
  const rungSamples = Math.max(4, Math.floor((count - pos.length / 3) / rungCount));
  for (let r = 0; r < rungCount && pos.length / 3 < count; r++) {
    const t = r / Math.max(1, rungCount - 1);
    const a1 = t * Math.PI * 2 * turns;
    const y = (t - 0.5) * height;
    const x1 = radius * Math.cos(a1), z1 = radius * Math.sin(a1);
    const x2 = radius * Math.cos(a1 + Math.PI), z2 = radius * Math.sin(a1 + Math.PI);
    for (let s = 0; s <= rungSamples; s++) {
      const f = s / rungSamples;
      push(pos, x1 + (x2 - x1) * f, y, z1 + (z2 - z1) * f);
      if (pos.length / 3 >= count) break;
    }
  }
  return pos.slice(0, count * 3);
}

function generateDiamond(count, size = 1.6 * S()) {
  const pos = [];
  const top = [0, size, 0];
  const bot = [0, -size * 0.55, 0];
  const eq = [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2;
    return [size * 0.85 * Math.cos(a), 0, size * 0.85 * Math.sin(a)];
  });
  const edges = [];
  eq.forEach((v) => edges.push([top, v]));
  eq.forEach((v) => edges.push([bot, v]));
  for (let i = 0; i < 4; i++) edges.push([eq[i], eq[(i + 1) % 4]]);

  const facetCount = Math.floor(count * 0.1);
  const perEdge = Math.floor((count - facetCount) / edges.length);
  const jitter = 0.008 * S();

  for (const [a, b] of edges) {
    for (let i = 0; i < perEdge; i++) {
      const t = i / Math.max(1, perEdge - 1);
      push(pos,
        a[0] + (b[0] - a[0]) * t + (Math.random() - 0.5) * jitter,
        a[1] + (b[1] - a[1]) * t + (Math.random() - 0.5) * jitter,
        a[2] + (b[2] - a[2]) * t + (Math.random() - 0.5) * jitter
      );
    }
  }
  [top, bot, ...eq].forEach((v, i) => { if (i < facetCount) push(pos, v[0], v[1], v[2]); });
  return pos.slice(0, count * 3);
}

const SHAPE_GENERATORS = {
  sphere: () => generateSphere(PARTICLE_COUNT),
  cube: () => generateCube(PARTICLE_COUNT),
  heart: () => generateHeart(PARTICLE_COUNT),
  saturn: () => generateSaturn(PARTICLE_COUNT),
  helix: () => generateDoubleHelix(PARTICLE_COUNT),
  diamond: () => generateDiamond(PARTICLE_COUNT),
};

// ────────────────────────────────────────────────────────────
//  6. GESTURE DETECTION
// ────────────────────────────────────────────────────────────

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isFingerUp(lm, tip, mcp) {
  return lm[tip].y < lm[mcp].y;
}

function detectGesture(landmarks) {
  const lm = landmarks;
  const thumbUp = lm[4].x < lm[3].x;
  const indexUp = isFingerUp(lm, 8, 5);
  const middleUp = isFingerUp(lm, 12, 9);
  const ringUp = isFingerUp(lm, 16, 13);
  const pinkyUp = isFingerUp(lm, 20, 17);
  const fingersUp = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;

  const pinchDist = dist(lm[4], lm[8]);
  const handSize = dist(lm[0], lm[9]);
  if (pinchDist < handSize * 0.4 && !middleUp && !ringUp && !pinkyUp) return 'pinch';
  if (fingersUp === 4) return 'open_palm';
  if (fingersUp === 0 && !thumbUp) return 'fist';
  if (indexUp && middleUp && !ringUp && !pinkyUp) return 'peace';
  if (indexUp && !middleUp && !ringUp && !pinkyUp) return 'pointing';
  if (thumbUp && fingersUp === 0) return 'thumbs_up';
  return 'none';
}

// ────────────────────────────────────────────────────────────
//  7. STATE & INTERACTION
// ────────────────────────────────────────────────────────────

let currentGesture = 'open_palm';
let currentShape = 'sphere';
let handPresent = false;
let currentColor = new THREE.Color(0x33bbff);
let targetColor = new THREE.Color(0x33bbff);

const objectPosition = new THREE.Vector3(0, 0, 0);
const targetObjectPos = new THREE.Vector3(0, 0, 0);
const rotationVelocity = new THREE.Vector2(0, 0);
const targetRotationVel = new THREE.Vector2(0, 0);

let objectScale = viewport.scaleFactor;
let targetScale = viewport.scaleFactor;
let userScaleMultiplier = 1.0;

let lastPinchDistance = 0;
let lastTwoHandDistance = 0;
let lastHandCenter = null;
let lastTwoHandAngle = null;
let idlePhase = 0;

function applyShape(shapeName) {
  if (!SHAPE_GENERATORS[shapeName]) return;
  currentShape = shapeName;
  const newPositions = SHAPE_GENERATORS[shapeName]();
  for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
    targetPositions[i] = newPositions[i] ?? targetPositions[i];
  }
}

function setGesture(gesture) {
  if (gesture === 'none' || gesture === currentGesture) return;
  currentGesture = gesture;

  const config = GESTURE_CONFIG[gesture];
  if (!config) return;

  targetColor.copy(config.color);
  applyShape(config.shape);

  const el = document.getElementById('gesture-name');
  if (el) el.textContent = config.name;

  document.querySelectorAll('.guide-item').forEach((e) => e.classList.remove('active'));
  const activeItem = document.querySelector(`[data-gesture="${gesture}"]`);
  if (activeItem) activeItem.classList.add('active');
}

/** Pusat telapak — stabil untuk tracking 2D */
function getPalmCenter(landmarks) {
  const ids = [0, 5, 9, 13, 17];
  let x = 0, y = 0;
  for (const id of ids) {
    x += landmarks[id].x;
    y += landmarks[id].y;
  }
  return { x: x / ids.length, y: y / ids.length };
}

/** Normalisasi posisi tangan (0–1) → offset dunia XY, mirror webcam */
function handNormToWorld(nx, ny, hs) {
  return {
    x: (0.5 - nx) * viewport.moveRangeX * hs,
    y: (0.5 - ny) * viewport.moveRangeY * hs,
  };
}

function processHandInteraction(landmarksList) {
  const hs = viewport.handMoveScale;
  const primary = landmarksList[0];

  let palmX, palmY;
  if (landmarksList.length >= 2) {
    const c1 = getPalmCenter(primary);
    const c2 = getPalmCenter(landmarksList[1]);
    palmX = (c1.x + c2.x) * 0.5;
    palmY = (c1.y + c2.y) * 0.5;
  } else {
    const c = getPalmCenter(primary);
    palmX = c.x;
    palmY = c.y;
  }

  const world = handNormToWorld(palmX, palmY, hs);
  targetObjectPos.set(world.x, world.y, 0);

  const center = { x: palmX, y: palmY };
  if (lastHandCenter) {
    const dx = center.x - lastHandCenter.x;
    const dy = center.y - lastHandCenter.y;
    // Rotasi hanya dari gerakan melingkar (bukan translasi lurus)
    const moveMag = Math.sqrt(dx * dx + dy * dy);
    if (moveMag > 0.002) {
      targetRotationVel.x += dx * 2.0;
      targetRotationVel.y += dy * 1.8;
    }
  }
  lastHandCenter = { x: center.x, y: center.y };

  const gesture = detectGesture(primary);
  if (gesture !== 'none') setGesture(gesture);

  const pinchDist = dist(primary[4], primary[8]);
  const handSize = dist(primary[0], primary[9]);

  if (landmarksList.length >= 2) {
    const h2 = landmarksList[1];
    const twoDist = dist(primary[9], h2[9]);
    if (lastTwoHandDistance > 0) {
      const ratio = twoDist / lastTwoHandDistance;
      userScaleMultiplier = THREE.MathUtils.clamp(
        userScaleMultiplier * (1 + (ratio - 1) * 1.8),
        0.55,
        1.85
      );
    }
    lastTwoHandDistance = twoDist;

    const angle = Math.atan2(h2[9].y - primary[9].y, h2[9].x - primary[9].x);
    if (lastTwoHandAngle !== null) {
      let delta = angle - lastTwoHandAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      targetRotationVel.x += delta * 2.2;
    }
    lastTwoHandAngle = angle;
    lastPinchDistance = 0;
  } else {
    lastTwoHandDistance = 0;
    lastTwoHandAngle = null;

    if (pinchDist < handSize * 0.55) {
      if (lastPinchDistance > 0) {
        const dc = pinchDist - lastPinchDistance;
        userScaleMultiplier = THREE.MathUtils.clamp(
          userScaleMultiplier + dc * 3.5,
          0.55,
          1.85
        );
      }
      lastPinchDistance = pinchDist;
    } else {
      lastPinchDistance = 0;
    }
  }

  targetScale = viewport.scaleFactor * userScaleMultiplier;
}

function resetInteractionTracking() {
  lastHandCenter = null;
  lastPinchDistance = 0;
  lastTwoHandDistance = 0;
  lastTwoHandAngle = null;
}

// ────────────────────────────────────────────────────────────
//  8. MEDIAPIPE
// ────────────────────────────────────────────────────────────

let handLandmarker = null;

async function initMediaPipe() {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    });
    return true;
  } catch (err) {
    console.error('[SandForm] MediaPipe init failed:', err);
    return false;
  }
}

// ────────────────────────────────────────────────────────────
//  9. WEBCAM
// ────────────────────────────────────────────────────────────

const videoEl = document.getElementById('webcam');

async function initWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    videoEl.srcObject = stream;
    await new Promise((res) => { videoEl.onloadeddata = res; });
    return true;
  } catch (err) {
    console.error('[SandForm] Webcam failed:', err);
    return false;
  }
}

// ────────────────────────────────────────────────────────────
//  10. ANIMATION LOOP
// ────────────────────────────────────────────────────────────

let lastVideoTime = -1;
let noHandMsg = null;

function createNoHandMsg() {
  const el = document.createElement('div');
  el.id = 'no-hand-msg';
  el.textContent = 'Show your hand to the camera';
  document.getElementById('app').appendChild(el);
  return el;
}

function animate(timestamp) {
  requestAnimationFrame(animate);
  const time = timestamp * 0.001;
  idlePhase = time;

  if (handLandmarker && videoEl.readyState >= 2) {
    const videoTime = videoEl.currentTime;
    if (videoTime !== lastVideoTime) {
      lastVideoTime = videoTime;
      const result = handLandmarker.detectForVideo(videoEl, timestamp);

      if (result.landmarks && result.landmarks.length > 0) {
        handPresent = true;
        processHandInteraction(result.landmarks);
        if (noHandMsg) noHandMsg.style.opacity = '0';
      } else {
        handPresent = false;
        resetInteractionTracking();
        if (noHandMsg) noHandMsg.style.opacity = '0.65';
      }
    }
  }

  // Idle: shape tetap, floating + slow rotation (tanpa morph ke scatter)
  if (!handPresent) {
    const floatY = Math.sin(idlePhase * 0.55) * 0.12;
    const floatX = Math.cos(idlePhase * 0.38) * 0.06;
    targetObjectPos.set(floatX, floatY, 0);
    targetObjectPos.lerp(new THREE.Vector3(0, 0, 0), 0.008);

    targetRotationVel.x += Math.sin(idlePhase * 0.25) * 0.0006;
    targetRotationVel.y += 0.0012;

    const breathe = 1 + Math.sin(idlePhase * 0.45) * 0.025;
    targetScale = viewport.scaleFactor * userScaleMultiplier * breathe;
  }

  objectPosition.lerp(targetObjectPos, POSITION_LERP);
  sculptureGroup.position.copy(objectPosition);
  currentColor.lerp(targetColor, COLOR_LERP);

  rotationVelocity.x += (targetRotationVel.x - rotationVelocity.x) * 0.12;
  rotationVelocity.y += (targetRotationVel.y - rotationVelocity.y) * 0.12;
  targetRotationVel.x *= 0.85;
  targetRotationVel.y *= 0.85;

  const posAttr = geometry.attributes.position;
  const colAttr = geometry.attributes.color;
  const isHelix = currentShape === 'helix';
  const isHeart = currentShape === 'heart';
  const isSaturn = currentShape === 'saturn';
  const noiseAmp = isHelix ? 0.004 : 0.005;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    const seed = randomSeeds[i3];
    const seed1 = randomSeeds[i3 + 1];
    const seed2 = randomSeeds[i3 + 2];

    let tx = targetPositions[i3];
    let ty = targetPositions[i3 + 1];
    let tz = targetPositions[i3 + 2];

    if (!handPresent) {
      const bob = Math.sin(idlePhase * 0.7 + seed) * 0.012;
      tx += bob;
      ty += Math.cos(idlePhase * 0.6 + seed1) * 0.012;
      tz += Math.sin(idlePhase * 0.65 + seed2) * 0.01;
    }

    if (isHelix) {
      const phase = helixPhases[i];
      const flow = Math.sin(idlePhase * 1.4 + phase + ty * 2) * 0.022;
      tx += flow * Math.cos(phase);
      tz += flow * Math.sin(phase);
    }

    const nx = Math.sin(idlePhase * 0.7 + seed) * noiseAmp;
    const ny = Math.cos(idlePhase * 0.55 + seed1) * noiseAmp;
    const nz = Math.sin(idlePhase * 0.6 + seed2) * noiseAmp;

    positions[i3]     += (tx - positions[i3])     * MORPH_LERP + nx;
    positions[i3 + 1] += (ty - positions[i3 + 1]) * MORPH_LERP + ny;
    positions[i3 + 2] += (tz - positions[i3 + 2]) * MORPH_LERP + nz;

    let brightness = 0.9 + Math.sin(idlePhase * 1.0 + seed) * 0.08;
    let cr = currentColor.r, cg = currentColor.g, cb = currentColor.b;

    if (isHeart) {
      brightness = 0.92 + Math.sin(idlePhase * 1.3 + seed) * 0.08;
      cr = Math.min(1, cr * 1.05 + 0.04);
      cg *= 0.78; cb = Math.min(1, cb * 0.9 + 0.05);
    }
    if (isSaturn) {
      const band = Math.sin(seed * 3 + idlePhase * 0.5);
      cr = Math.min(1, cr * (0.95 + band * 0.08));
      cg = Math.min(1, cg * (0.9 + band * 0.06));
      cb = Math.min(1, cb * (1.0 + band * 0.1));
    }
    if (!handPresent) {
      brightness = 0.82 + Math.sin(idlePhase * 0.7 + seed) * 0.1;
    }

    colAttr.array[i3]     = cr * brightness;
    colAttr.array[i3 + 1] = cg * brightness;
    colAttr.array[i3 + 2] = cb * brightness;
  }

  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;

  objectScale += (targetScale - objectScale) * SCALE_LERP;
  sculptureGroup.scale.setScalar(objectScale);

  sculptureGroup.rotation.y += rotationVelocity.x;
  sculptureGroup.rotation.x += rotationVelocity.y;
  rotationVelocity.x *= ROTATION_DAMP;
  rotationVelocity.y *= ROTATION_DAMP;

  if (!handPresent) {
    sculptureGroup.rotation.y += 0.002;
    sculptureGroup.rotation.x += Math.sin(idlePhase * 0.2) * 0.0004;
  }

  const ambientPosAttr = ambientGeometry.attributes.position;
  for (let i = 0; i < ambientCount; i++) {
    const i3 = i * 3;
    ambientPosAttr.array[i3 + 1] += Math.sin(idlePhase * 0.5 + i) * 0.001;
    ambientPosAttr.array[i3]     += Math.cos(idlePhase * 0.3 + i) * 0.0005;
  }
  ambientPosAttr.needsUpdate = true;
  ambientParticles.rotation.y = idlePhase * 0.012;

  cameraTarget.x = Math.sin(idlePhase * 0.1) * 0.08;
  cameraTarget.y = Math.cos(idlePhase * 0.08) * 0.05;
  cameraTarget.z = viewport.baseCameraZ + Math.sin(idlePhase * 0.05) * 0.06;
  camera.position.lerp(cameraTarget, CAMERA_LERP);
  cameraLookAt.lerp(objectPosition, 0.06);
  camera.lookAt(cameraLookAt);

  pointLight1.position.set(
    sculptureGroup.position.x + Math.sin(idlePhase * 0.5) * 2,
    sculptureGroup.position.y + Math.cos(idlePhase * 0.4) * 1.5,
    3
  );
  pointLight1.color.copy(currentColor);
  pointLight1.intensity = isHeart ? 5.5 : isSaturn ? 5.2 : 4.5;

  renderer.render(scene, camera);
}

// ────────────────────────────────────────────────────────────
//  11. RESIZE
// ────────────────────────────────────────────────────────────

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  updateViewportMetrics();
  material.size = viewport.particleSize;
  cameraTarget.z = viewport.cameraZ;
  targetScale = viewport.scaleFactor * userScaleMultiplier;
  objectScale = targetScale;
  sculptureGroup.scale.setScalar(objectScale);

  if (currentShape && SHAPE_GENERATORS[currentShape]) {
    applyShape(currentShape);
  }
}

window.addEventListener('resize', onResize);

// ────────────────────────────────────────────────────────────
//  12. INIT
// ────────────────────────────────────────────────────────────

async function init() {
  const loadingOverlay = document.getElementById('loading-overlay');
  noHandMsg = createNoHandMsg();

  applyShape('sphere');
  targetColor.copy(GESTURE_CONFIG.open_palm.color);
  currentColor.copy(targetColor);

  const [mpReady, camReady] = await Promise.all([initMediaPipe(), initWebcam()]);

  if (!mpReady || !camReady) {
    document.querySelector('.loader-sub').textContent = mpReady
      ? 'Camera access denied. Please allow camera.'
      : 'Failed to load hand tracking.';
    return;
  }

  loadingOverlay.classList.add('hidden');
  requestAnimationFrame(animate);
  console.log('[SandForm] ✦ Ready! Show your hand.');
}

init();
