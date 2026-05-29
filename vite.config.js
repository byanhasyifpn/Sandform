import { defineConfig } from 'vite';

export default defineConfig({
  // Optimasi dependency MediaPipe agar bisa di-bundle dengan benar
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
  server: {
    // Aktifkan HTTPS headers yang dibutuhkan webcam (COEP/COOP)
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy':   'same-origin',
    },
  },
});