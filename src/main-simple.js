// Simple test version
import * as THREE from 'three';

console.log('[Test] Starting simple particle test...');

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x030508, 1);
document.getElementById('app').appendChild(renderer.domElement);

console.log('[Test] Renderer created');

// Scene
const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(
  65,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, 6);

console.log('[Test] Scene and camera ready');

// Create particles with simple material
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(1000 * 3);
const colors = new Float32Array(1000 * 3);

for (let i = 0; i < 1000; i++) {
  // Random positions in a sphere
  const r = 2;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.random() * Math.PI;
  
  positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  positions[i * 3 + 1] = r * Math.cos(phi);
  positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  
  // White color
  colors[i * 3] = 1;
  colors[i * 3 + 1] = 1;
  colors[i * 3 + 2] = 1;
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

// Use simple PointsMaterial instead of shader
const material = new THREE.PointsMaterial({
  size: 0.05,
  vertexColors: true,
  transparent: true,
  opacity: 0.8
});

const particles = new THREE.Points(geometry, material);
scene.add(particles);

console.log('[Test] Particles created and added to scene');
console.log('Particle count:', 1000);
console.log('Scene children:', scene.children.length);

// Animation
function animate() {
  requestAnimationFrame(animate);
  
  particles.rotation.y += 0.001;
  
  renderer.render(scene, camera);
}

console.log('[Test] Starting animation loop');
animate();

// Hide loading overlay
setTimeout(() => {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');
  console.log('[Test] Loading overlay hidden');
}, 500);
