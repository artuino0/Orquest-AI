// Pone al día la oficina de demostración que la página web incrusta (web/oficina/).
// No compila nada: copia la oficina de píxel de la app tal cual (es HTML, CSS y
// JS planos) y deja sus datos en un archivo para que abra hasta con doble clic.
// Lo que genera sí va en git: web/ se sube completa a cualquier hospedaje.
// Uso, cuando cambie la oficina o su arte: node scripts/web.mjs
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const src = resolve('src/renderer')
const art = resolve('assets/herdr-oficina')
const out = resolve('web/oficina')

await rm(out, { recursive: true, force: true })
await mkdir(resolve(out, 'oficina'), { recursive: true })

// El motor, la jornada de mentira y los estilos, sin tocar.
for (const file of ['app.js', 'demo.js', 'styles.css']) await cp(resolve(src, 'oficina', file), resolve(out, 'oficina', file))
// Las imágenes, en las mismas rutas que piden.
for (const dir of ['sprites', 'escena']) await cp(resolve(art, dir), resolve(out, dir), { recursive: true })

// Los datos que la oficina pediría por red, ya cargados: así no depende de un servidor.
const json = async (path) => JSON.parse(await readFile(resolve(art, path), 'utf8'))
const datos = { sprites: await json('sprites/sprites.json'), escena: await json('escena/escena.json'), mapa: await json('escena/mapa.json') }
await writeFile(resolve(out, 'oficina', 'datos.js'), `// Generado por scripts/web.mjs: sprites, escena y mapa de la oficina.\nwindow.OFICINA.datos = ${JSON.stringify(datos)}\n`)

// La página: la de la app, con las letras desde Google Fonts y los guiones en orden.
const page = (await readFile(resolve(src, 'oficina.html'), 'utf8'))
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '<meta name="robots" content="noindex">\n<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono&family=Pixelify+Sans:wght@400;700&display=swap" rel="stylesheet">\n')
  .replace(/<!-- inicio\.js[^\n]*\n<script[^>]*><\/script>/, [
    '<!-- ?marco=0: sin encabezado ni lista de eventos, para ir incrustada -->',
    `<script>if (new URLSearchParams(location.search).get('marco') === '0') document.documentElement.classList.add('en-app')</script>`,
    '<script src="oficina/demo.js"></script>',
    '<script src="oficina/datos.js"></script>',
    '<script src="oficina/app.js"></script>',
  ].join('\n'))
if (!page.includes('oficina/datos.js')) throw new Error('oficina.html cambió: no se encontró dónde poner los guiones.')
await writeFile(resolve(out, 'oficina.html'), page)
console.log(`Oficina de demostración al día en ${out}`)
