// Solo para ver la oficina y los paneles en el navegador sin abrir la app:
//   npx vite src/renderer   →   /preview.html   paneles con un estudio de mentira
//                               /oficina.html   oficina de píxel (demo)
//                               /demo.html      oficina anterior y modo creativo
// La app se arma con electron.vite.config.ts, que no lee este archivo.
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'
import { detectAll } from '../core/detect.js'

/** Para que la vista previa muestre las CLIs de verdad de esta máquina: la misma detección que usa la app. */
const detectar: Plugin = {
  name: 'orquest-detectar',
  configureServer(server) {
    server.middlewares.use('/__orquest/clis', (_req, res) => {
      detectAll().then(
        (clis) => res.setHeader('content-type', 'application/json').end(JSON.stringify(clis)),
        (err) => {
          res.statusCode = 500
          res.end(String(err))
        },
      )
    })
  },
}

export default defineConfig({
  plugins: [vue(), detectar],
  // La oficina de píxel pide sus sprites en /sprites/…
  publicDir: fileURLToPath(new URL('../../assets/herdr-oficina', import.meta.url)),
})
