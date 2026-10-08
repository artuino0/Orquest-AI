import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [vue({})],
    // Los sprites van como archivo: la CSP no deja cargar imágenes incrustadas (data:).
    build: { assetsInlineLimit: 0 },
  },
})
