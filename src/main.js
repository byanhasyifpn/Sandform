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

const HAND_FILTER    = 0.22;
const POS_STIFFNESS  = 0.13;
const POS_DAMP       = 0.78;
const COLOR_LERP     = 0.038;
const MORPH_STIFF    = 0.042;
const MORPH_DAMP     = 0.76;
const CAMERA_LERP    = 0.028;
const SCALE_LERP     = 0.055;
const ROTATION_DAMP  = 0.9;
const TARGET_DEADZONE = 0.018;

const GESTURE_CONFIG = {
  open_palm:  { name: 'Sphere',   color: new THREE.Color(0x8eb8ff), shape: 'sphere'  },
  fist:       { name: 'Butterfly',     color: new THREE.Color(0xff9a78), shape: 'butterfly'    },
  pinch:      { name: 'Heart',    color: new THREE.Color(0xf3a8c8), shape: 'heart'   },
  peace:      { name: 'Saturn',   color: new THREE.Color(0xc4b0ff), shape: 'saturn'  },
  pointing:   { name: 'Helix',    color: new THREE.Color(0x8fd6c8), shape: 'helix'   },
  thumbs_up:  { name: 'Cat',  color: new THREE.Color(0xffd89a), shape: 'cat' },
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
renderer.setClearColor(0x14161f, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x14161f, 0.012);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, viewport.cameraZ);

const cameraTarget = new THREE.Vector3(0, 0, viewport.cameraZ);
const cameraLookAt = new THREE.Vector3(0, 0, 0);

scene.add(new THREE.AmbientLight(0xc8b8d8, 0.85));

const pointLight1 = new THREE.PointLight(0x8eb8ff, 3.8, 20);
pointLight1.position.set(3, 3, 3);
scene.add(pointLight1);

const pointLight2 = new THREE.PointLight(0xf3a8c8, 2.6, 15);
pointLight2.position.set(-3, -2, 2);
scene.add(pointLight2);

const rimLight = new THREE.PointLight(0xfff5fb, 1.8, 25);
rimLight.position.set(0, 0, -5);
scene.add(rimLight);

// ────────────────────────────────────────────────────────────
//  3. PARTICLE SYSTEM
// ────────────────────────────────────────────────────────────

const geometry = new THREE.BufferGeometry();
const positions       = new Float32Array(PARTICLE_COUNT * 3);
const targetPositions = new Float32Array(PARTICLE_COUNT * 3);
const morphVelocity   = new Float32Array(PARTICLE_COUNT * 3);
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
  opacity: 0.86,
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
    size: 0.014, color: 0xc4b0ff, transparent: true, opacity: 0.16,
    sizeAttenuation: true, blending: THREE.AdditiveBlending,
  })
);
scene.add(ambientParticles);

// ────────────────────────────────────────────────────────────
//  4. SHAPE UTILITIES
// ────────────────────────────────────────────────────────────

const S = () => viewport.shapeScale;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function push(pos, x, y, z) { pos.push(x, y, z); }

function padToCount(pos, count) {
  const have = Math.floor(pos.length / 3);
  if (have === 0) return pos;
  while (pos.length / 3 < count) {
    const i = (Math.floor(pos.length / 3) % have) * 3;
    push(pos, pos[i], pos[i + 1], pos[i + 2]);
  }
  return pos.slice(0, count * 3);
}

function addFibonacciSphere(pos, count, radius) {
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const rAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN_ANGLE * i;
    push(pos, radius * Math.cos(theta) * rAtY, radius * y, radius * Math.sin(theta) * rAtY);
  }
}

function addFibonacciDisk(pos, count, radius, cx = 0, cy = 0, z = 0) {
  for (let i = 0; i < count; i++) {
    const r = radius * Math.sqrt((i + 0.5) / Math.max(1, count));
    const theta = GOLDEN_ANGLE * i;
    push(pos, cx + r * Math.cos(theta), cy + r * Math.sin(theta), z);
  }
}

function addCircle(pos, count, radius, y, tiltX = 0) {
  const c = Math.cos(tiltX);
  const s = Math.sin(tiltX);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x = radius * Math.cos(a);
    const z = radius * Math.sin(a);
    push(pos, x, y * c - z * s, y * s + z * c);
  }
}

function addEdge(pos, a, b, n) {
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const t = 0.5 - 0.5 * Math.cos(u * Math.PI);
    push(pos,
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    );
  }
}

function heartCurve2D(t) {
  const sinT = Math.sin(t);
  return [
    16 * Math.pow(sinT, 3),
    13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
  ];
}

function heartSamples(n) {
  const steps = n * 8;
  let length = 0;
  let prev = heartCurve2D(0);
  const pts = [{ t: 0, x: prev[0], y: prev[1], len: 0 }];
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const [x, y] = heartCurve2D(t);
    length += Math.hypot(x - prev[0], y - prev[1]);
    pts.push({ t, x, y, len: length });
    prev = [x, y];
  }
  const out = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const target = (i / n) * length;
    while (j < pts.length && pts[j].len < target) j++;
    const a = pts[j - 1];
    const b = pts[Math.min(j, pts.length - 1)];
    const span = b.len - a.len || 1;
    const f = (target - a.len) / span;
    out.push([a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f]);
  }
  return out;
}

// Fay's butterfly curve: r = e^sin(t) - 2cos(4t) + sin^5((2t-π)/24)
function butterflyCurve2D(t) {
  const r =
    Math.exp(Math.sin(t)) -
    2 * Math.cos(4 * t) +
    Math.pow(Math.sin((2 * t - Math.PI) / 24), 5);
  return [Math.sin(t) * r, Math.cos(t) * r];
}

function butterflySamples(n) {
  const tMax = 24 * Math.PI;
  const steps = Math.max(64, n * 5);
  let length = 0;
  let prev = butterflyCurve2D(0);
  const pts = [{ t: 0, x: prev[0], y: prev[1], len: 0 }];
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * tMax;
    const [x, y] = butterflyCurve2D(t);
    length += Math.hypot(x - prev[0], y - prev[1]);
    pts.push({ t, x, y, len: length });
    prev = [x, y];
  }
  const out = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const target = (i / n) * length;
    while (j < pts.length && pts[j].len < target) j++;
    const a = pts[j - 1];
    const b = pts[Math.min(j, pts.length - 1)];
    const span = b.len - a.len || 1;
    const f = (target - a.len) / span;
    out.push([a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f]);
  }
  return out;
}

// ────────────────────────────────────────────────────────────
//  5. SHAPE GENERATORS
// ────────────────────────────────────────────────────────────

function generateSphere(count) {
  const pos = [];
  const radius = 1.62 * S();
  const ringShare = Math.floor(count * 0.18);
  const shellCount = count - ringShare;
  addFibonacciSphere(pos, shellCount, radius);

  const rings = 4;
  const perRing = Math.floor(ringShare / rings);
  const lats = [-0.62, -0.22, 0.22, 0.62];
  for (let r = 0; r < rings; r++) {
    const y = lats[r] * radius;
    const ringR = Math.sqrt(Math.max(0, radius * radius - y * y));
    addCircle(pos, perRing, ringR, y, 0);
  }
  return padToCount(pos, count);
}

function generateButterfly(count) {
  const pos = [];
  const scale = 0.3 * S();

  const outlineLayers = [
    { inset: 1.00, z: 0.00, n: 0.40 },
    { inset: 0.95, z: 0.07, n: 0.14 },
    { inset: 0.95, z: -0.07, n: 0.14 },
    { inset: 0.88, z: 0.13, n: 0.08 },
    { inset: 0.88, z: -0.13, n: 0.08 },
  ];

  let used = 0;
  for (const layer of outlineLayers) {
    const n = Math.floor(count * layer.n);
    const pts = butterflySamples(n);
    for (const [x, y] of pts) {
      push(pos, x * scale * layer.inset, y * scale * layer.inset, layer.z * S());
    }
    used += n;
  }

  // body (down the pinched middle of the curve) + antennae
  const bodyCount = Math.floor(count * 0.05);
  const bodyTop = [0, 1.55 * scale, 0];
  const bodyBottom = [0, -1.35 * scale, 0];
  addEdge(pos, bodyTop, bodyBottom, bodyCount);
  used += bodyCount;

  const antennaCount = Math.floor(count * 0.02);
  const perAntenna = Math.max(1, Math.floor(antennaCount / 2));
  addEdge(pos, bodyTop, [0.35 * scale, 2.15 * scale, 0], perAntenna);
  addEdge(pos, bodyTop, [-0.35 * scale, 2.15 * scale, 0], perAntenna);
  used += perAntenna * 2;

  // scattered inner-wing fill for volume
  const fillCount = Math.max(0, count - used);
  if (fillCount > 0) {
    const fillPts = butterflySamples(fillCount);
    for (let i = 0; i < fillCount; i++) {
      const inset = 0.25 + (i % 8) / 8 * 0.55;
      const z = ((i % 5) - 2) * 0.03 * S();
      push(pos, fillPts[i][0] * scale * inset, fillPts[i][1] * scale * inset, z);
    }
  }
  return padToCount(pos, count);
}

function generateHeart(count) {
  const pos = [];
  const scale = 0.092 * S();
  const samples = heartSamples(Math.max(240, Math.floor(count * 0.12)));
  let cx = 0, cy = 0;
  for (const [x, y] of samples) { cx += x; cy += y; }
  cx /= samples.length;
  cy /= samples.length;

  const outlineLayers = [
    { inset: 1.00, z: 0.00, n: 0.42 },
    { inset: 0.94, z:  0.09, n: 0.14 },
    { inset: 0.94, z: -0.09, n: 0.14 },
    { inset: 0.86, z:  0.16, n: 0.08 },
    { inset: 0.86, z: -0.16, n: 0.08 },
  ];

  let used = 0;
  for (const layer of outlineLayers) {
    const n = Math.floor(count * layer.n);
    const pts = heartSamples(n);
    for (const [x, y] of pts) {
      push(
        pos,
        (x - cx) * scale * layer.inset,
        (y - cy) * scale * layer.inset,
        layer.z * S()
      );
    }
    used += n;
  }

  const fillCount = count - used;
  const fillPts = heartSamples(fillCount);
  for (let i = 0; i < fillCount; i++) {
    const inset = 0.28 + (i % 8) / 8 * 0.52;
    const z = ((i % 5) - 2) * 0.028 * S();
    push(
      pos,
      (fillPts[i][0] - cx) * scale * inset,
      (fillPts[i][1] - cy) * scale * inset,
      z
    );
  }
  return padToCount(pos, count);
}

function generateSaturn(count) {
  const pos = [];
  const planetR = 0.78 * S();
  const tilt = (26 * Math.PI) / 180;
  const planetCount = Math.floor(count * 0.28);
  addFibonacciSphere(pos, planetCount, planetR);

  const ringCount = count - planetCount;
  const bands = [
    { inner: 1.12 * S(), outer: 1.48 * S(), share: 0.46 },
    { inner: 1.62 * S(), outer: 2.02 * S(), share: 0.54 },
  ];

  for (const band of bands) {
    const n = Math.floor(ringCount * band.share);
    const rings = 7;
    const perRing = Math.floor(n / rings);
    for (let r = 0; r < rings; r++) {
      const t = r / Math.max(1, rings - 1);
      const radius = band.inner + t * (band.outer - band.inner);
      addCircle(pos, perRing, radius, 0, tilt);
    }
  }
  return padToCount(pos, count);
}

function generateDoubleHelix(count) {
  const pos = [];
  const radius = 0.72 * S();
  const height = 2.85 * S();
  const turns = 3.5;
  const tubeR = 0.13 * S();
  const tubeSides = 8;
  const strandShare = Math.floor(count * 0.86);
  const steps = Math.floor(strandShare / (2 * tubeSides));

  for (let strand = 0; strand < 2; strand++) {
    const phase = strand * Math.PI;
    for (let i = 0; i < steps; i++) {
      const t = i / Math.max(1, steps - 1);
      const angle = t * Math.PI * 2 * turns + phase;
      const y = (t - 0.5) * height;
      const cx = radius * Math.cos(angle);
      const cz = radius * Math.sin(angle);
      const nx = Math.cos(angle);
      const nz = Math.sin(angle);
      for (let s = 0; s < tubeSides; s++) {
        const ta = (s / tubeSides) * Math.PI * 2;
        const ox = tubeR * (Math.cos(ta) * nx);
        const oy = tubeR * Math.sin(ta);
        const oz = tubeR * (Math.cos(ta) * nz);
        push(pos, cx + ox, y + oy, cz + oz);
      }
    }
  }

  const rungCount = Math.floor(turns * 9);
  const rungSamples = Math.max(6, Math.floor((count - pos.length / 3) / rungCount));
  for (let r = 0; r < rungCount && pos.length / 3 < count; r++) {
    const t = (r + 0.5) / rungCount;
    const a1 = t * Math.PI * 2 * turns;
    const y = (t - 0.5) * height;
    const x1 = radius * Math.cos(a1);
    const z1 = radius * Math.sin(a1);
    const x2 = radius * Math.cos(a1 + Math.PI);
    const z2 = radius * Math.sin(a1 + Math.PI);
    for (let s = 0; s < rungSamples; s++) {
      const f = s / Math.max(1, rungSamples - 1);
      push(pos, x1 + (x2 - x1) * f, y, z1 + (z2 - z1) * f);
      if (pos.length / 3 >= count) break;
    }
  }
  return padToCount(pos, count);
}

function generateCat(count) {
  const pos = [];
  const s = S();
  const headR = 1.05 * s;
  const headCy = -0.05 * s;

  // head fill
  const headFillCount = Math.floor(count * 0.36);
  addFibonacciDisk(pos, headFillCount, headR, 0, headCy, 0);

  // head outline
  const headOutlineCount = Math.floor(count * 0.12);
  for (let i = 0; i < headOutlineCount; i++) {
    const a = (i / headOutlineCount) * Math.PI * 2;
    push(pos, headR * Math.cos(a), headCy + headR * Math.sin(a), 0.02 * s);
  }

  // ears (two triangles)
  const earSize = 0.55 * s;
  const earBaseY = headCy + headR * 0.72;
  const leftEarTip   = [-0.62 * s, earBaseY + earSize, 0];
  const leftEarBaseA = [-0.95 * s, earBaseY, 0];
  const leftEarBaseB = [-0.25 * s, earBaseY, 0];
  const rightEarTip   = [0.62 * s, earBaseY + earSize, 0];
  const rightEarBaseA = [0.95 * s, earBaseY, 0];
  const rightEarBaseB = [0.25 * s, earBaseY, 0];

  const earShare = Math.floor(count * 0.14);
  const perEarEdge = Math.floor(earShare / 6);
  addEdge(pos, leftEarTip, leftEarBaseA, perEarEdge);
  addEdge(pos, leftEarTip, leftEarBaseB, perEarEdge);
  addEdge(pos, leftEarBaseA, leftEarBaseB, perEarEdge);
  addEdge(pos, rightEarTip, rightEarBaseA, perEarEdge);
  addEdge(pos, rightEarTip, rightEarBaseB, perEarEdge);
  addEdge(pos, rightEarBaseA, rightEarBaseB, perEarEdge);

  // eyes (two small filled dots)
  const eyeR = 0.12 * s;
  const eyeY = headCy + 0.12 * s;
  const eyeCount = Math.floor(count * 0.06);
  const perEye = Math.max(1, Math.floor(eyeCount / 2));
  addFibonacciDisk(pos, perEye, eyeR, -0.38 * s, eyeY, 0.05 * s);
  addFibonacciDisk(pos, perEye, eyeR, 0.38 * s, eyeY, 0.05 * s);

  // nose (small triangle)
  const noseTop = [0, headCy - 0.08 * s, 0.05 * s];
  const noseL = [-0.07 * s, headCy - 0.2 * s, 0.05 * s];
  const noseR = [0.07 * s, headCy - 0.2 * s, 0.05 * s];
  const noseShare = Math.floor(count * 0.03);
  const perNose = Math.max(1, Math.floor(noseShare / 3));
  addEdge(pos, noseTop, noseL, perNose);
  addEdge(pos, noseTop, noseR, perNose);
  addEdge(pos, noseL, noseR, perNose);

  // mouth (simple W)
  const mouthCenter = [0, headCy - 0.28 * s, 0.03 * s];
  const mouthL = [-0.22 * s, headCy - 0.18 * s, 0.03 * s];
  const mouthR = [0.22 * s, headCy - 0.18 * s, 0.03 * s];
  const mouthShare = Math.floor(count * 0.04);
  const perMouth = Math.max(1, Math.floor(mouthShare / 2));
  addEdge(pos, mouthL, mouthCenter, perMouth);
  addEdge(pos, mouthCenter, mouthR, perMouth);

  // whiskers (3 per side), using whatever budget remains
  const whiskersPerSide = 3;
  const whiskerShare = Math.max(0, count - Math.floor(pos.length / 3));
  const perWhisker = Math.max(1, Math.floor(whiskerShare / (whiskersPerSide * 2)));
  const whiskerY = [headCy - 0.02 * s, headCy - 0.08 * s, headCy - 0.14 * s];
  for (let w = 0; w < whiskersPerSide; w++) {
    addEdge(pos, [-0.15 * s, whiskerY[w], 0.01 * s], [-1.15 * s, whiskerY[w] - 0.03 * s, 0.01 * s], perWhisker);
    addEdge(pos, [0.15 * s, whiskerY[w], 0.01 * s], [1.15 * s, whiskerY[w] - 0.03 * s, 0.01 * s], perWhisker);
  }

  return padToCount(pos, count);
}

const SHAPE_GENERATORS = {
  sphere: () => generateSphere(PARTICLE_COUNT),
  butterfly: () => generateButterfly(PARTICLE_COUNT),
  heart: () => generateHeart(PARTICLE_COUNT),
  saturn: () => generateSaturn(PARTICLE_COUNT),
  helix: () => generateDoubleHelix(PARTICLE_COUNT),
  cat: () => generateCat(PARTICLE_COUNT),
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
let currentColor = new THREE.Color(0x8eb8ff);
let targetColor = new THREE.Color(0x8eb8ff);

const objectPosition = new THREE.Vector3(0, 0, 0);
const targetObjectPos = new THREE.Vector3(0, 0, 0);
const smoothedTargetPos = new THREE.Vector3(0, 0, 0);
const objectVelocity = new THREE.Vector3(0, 0, 0);
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
  if (el) {
    el.textContent = config.name;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

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
  const jumpX = world.x - targetObjectPos.x;
  const jumpY = world.y - targetObjectPos.y;
  if (jumpX * jumpX + jumpY * jumpY > TARGET_DEADZONE * TARGET_DEADZONE) {
    targetObjectPos.set(world.x, world.y, 0);
  }

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

  smoothedTargetPos.lerp(targetObjectPos, HAND_FILTER);
  objectVelocity.x += (smoothedTargetPos.x - objectPosition.x) * POS_STIFFNESS;
  objectVelocity.y += (smoothedTargetPos.y - objectPosition.y) * POS_STIFFNESS;
  objectVelocity.z += (smoothedTargetPos.z - objectPosition.z) * POS_STIFFNESS;
  objectVelocity.multiplyScalar(POS_DAMP);
  objectPosition.add(objectVelocity);
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
  const noiseAmp = isHelix ? 0.0018 : 0.0022;

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

    const nx = Math.sin(idlePhase * 0.55 + seed) * noiseAmp;
    const ny = Math.cos(idlePhase * 0.42 + seed1) * noiseAmp;
    const nz = Math.sin(idlePhase * 0.48 + seed2) * noiseAmp;

    morphVelocity[i3]     += (tx - positions[i3])     * MORPH_STIFF;
    morphVelocity[i3 + 1] += (ty - positions[i3 + 1]) * MORPH_STIFF;
    morphVelocity[i3 + 2] += (tz - positions[i3 + 2]) * MORPH_STIFF;
    morphVelocity[i3]     *= MORPH_DAMP;
    morphVelocity[i3 + 1] *= MORPH_DAMP;
    morphVelocity[i3 + 2] *= MORPH_DAMP;

    positions[i3]     += morphVelocity[i3]     + nx;
    positions[i3 + 1] += morphVelocity[i3 + 1] + ny;
    positions[i3 + 2] += morphVelocity[i3 + 2] + nz;

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
  pointLight1.intensity = isHeart ? 4.2 : isSaturn ? 4.0 : 3.6;

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