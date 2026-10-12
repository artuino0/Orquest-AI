// Pone al día lo que la página web trae generado. No compila nada:
//  - web/oficina/: la oficina de píxel de la app, copiada tal cual (es HTML, CSS y JS
//    planos), con sus datos en un archivo para que abra hasta con doble clic.
//  - web/en/index.html: la página en inglés, armada desde web/index.html.
// Lo que genera sí va en git: web/ se sube completa a cualquier hospedaje.
// Uso, cuando cambie la oficina, su arte o el texto de la página: node scripts/web.mjs
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

// ── La página en inglés (web/en/index.html): la misma de web/index.html con sus textos
// cambiados por los de scripts/web-en.mjs. Si un texto se queda sin inglés, falla aquí.
const { EN, IGUALES } = await import('./web-en.mjs')
const URL_ES = 'https://orquest.dydasites.com/'
const es = (await readFile(resolve('web/index.html'), 'utf8')).replace(/\r\n/g, '\n')
let en = es
  .replace('<html lang="es">', '<html lang="en">')
  .replace('<a class="idioma" href="en/" hreflang="en" data-idioma="en" title="English">EN</a>', '<a class="idioma" href="../" hreflang="es" data-idioma="es" title="Español">ES</a>')
  .replace(`<link rel="canonical" href="${URL_ES}">`, `<link rel="canonical" href="${URL_ES}en/">`)
  .replace(`<meta property="og:url" content="${URL_ES}">`, `<meta property="og:url" content="${URL_ES}en/">`)
  .replace(`"url": "${URL_ES}"`, `"url": "${URL_ES}en/"`)
  .replace('oficina/oficina.html?marco=0"', 'oficina/oficina.html?marco=0&amp;lang=en"')
  // Los enlaces de pago de Stripe abren su página en el idioma de la que los lleva.
  .replaceAll('locale=es"', 'locale=en"')
// Primero los textos largos: uno corto puede ser el principio de otro.
for (const [de, a] of Object.entries(EN).sort((x, y) => y[0].length - x[0].length)) {
  if (!en.includes(de)) throw new Error(`web-en.mjs trae un texto que ya no está en la página: ${de}`)
  en = en.replaceAll(de, a)
}
// Lo que se pide por ruta vive una carpeta arriba.
en = en.replace(/\b(href|src|data-src)="(?!https?:|#|\.\.\/|data:|mailto:)([^"]+)"/g, '$1="../$2"').replace(/url\((?!['"]?(?:https?:|\.\.\/|data:))/g, 'url(../')

// Ningún texto visible puede quedar igual que en español, salvo nombres propios.
const visibles = (html) => [...html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<!--[\s\S]*?-->/g, '').matchAll(/>([^<>]+)</g)].map((m) => m[1].trim())
const antes = visibles(es)
const despues = visibles(en)
const sinTraducir = antes.filter((texto, i) => /\p{L}/u.test(texto) && texto === despues[i] && !IGUALES.has(texto))
if (antes.length !== despues.length || sinTraducir.length) throw new Error(`La página en inglés deja textos en español:\n- ${sinTraducir.join('\n- ')}`)

await mkdir(resolve('web/en'), { recursive: true })
await writeFile(resolve('web/en/index.html'), en)
console.log('Página en inglés al día en web/en/index.html')
