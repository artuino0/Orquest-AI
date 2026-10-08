import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [vue({})],
    // La oficina de píxel pide sus sprites por ruta (/sprites/…, /escena/…).
    publicDir: resolve('assets/herdr-oficina'),
    build: {
      // Los sprites van como archivo: la CSP no deja cargar imágenes incrustadas (data:).
      assetsInlineLimit: 0,
      // Dos páginas: la app y la oficina de píxel, que la app muestra en un marco.
      rollupOptions: { input: { index: resolve('src/renderer/index.html'), oficina: resolve('src/renderer/oficina.html') } },
    },
  },
})
