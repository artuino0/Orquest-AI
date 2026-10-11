// Arma la oficina de demostración que la página web incrusta (web/oficina/):
// la misma oficina de píxel de la app, con su jornada de mentira, lista para
// servirse como archivos sueltos. Uso: node scripts/web.mjs
import { cp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'vite'

const out = resolve('web/oficina')
await rm(out, { recursive: true, force: true })
await build({
  configFile: false,
  root: resolve('src/renderer'),
  // Rutas relativas: la página puede vivir en una subcarpeta (GitHub Pages).
  base: './',
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir: out,
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: { input: resolve('src/renderer/oficina.html') },
  },
})
// La oficina pide sus imágenes y su mapa por ruta, junto a la página.
for (const dir of ['sprites', 'escena']) await cp(resolve('assets/herdr-oficina', dir), resolve(out, dir), { recursive: true })
console.log(`Oficina de demostración en ${out}`)
