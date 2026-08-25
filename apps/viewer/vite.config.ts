import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base keeps the static build deployable at any path,
  // including GitHub Pages project sites (ADR-0011).
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
})
