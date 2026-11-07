/**
 * Sirve el editor de Trazo para el panel Estudio. El build trae sus archivos
 * con rutas absolutas (`/assets/…`), así que va en su propio servidor local
 * (127.0.0.1, puerto libre), que la CSP de la app ya deja incrustar. Solo
 * entrega archivos: lo que el editor necesita de Orquest (abrir, guardar, el
 * diseñador) lo pide al panel por `postMessage` (`renderer/trazo/puente.js`).
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.md': 'text/markdown; charset=utf-8',
}

/** La página del editor con el puente de Orquest antes de que cargue y su piel encima de la de Trazo. */
export function studioPage(index: string): string {
  return index
    .replace(/<script\b[^>]*type="module"/, (m) => `<script src="/orquest/puente.js"></script>\n    ${m}`)
    .replace('</head>', '  <link rel="stylesheet" href="/orquest/tema.css">\n  </head>')
}

/** Una ruta pedida dentro de `root`, o null si se sale (`..`, rutas absolutas). */
export function inside(root: string, path: string): string | null {
  let rel: string
  try {
    rel = decodeURIComponent(path.split('?')[0])
  } catch {
    return null
  }
  // root también se normaliza: en Windows '/a/editor' queda '\a\editor' al unirse.
  const base = normalize(root)
  const full = normalize(join(base, rel))
  return full === base || full.startsWith(base.endsWith(sep) ? base : base + sep) ? full : null
}

export interface EditorServer {
  /** La página del editor, lista para el iframe. */
  url: string
  close(): Promise<void>
}

/** `editor`: carpeta del build de Trazo. `own`: la de Orquest con `puente.js` y `tema.css`. */
export async function startEditorServer(editor: string, own: string): Promise<EditorServer> {
  const root = normalize(editor)
  const ownRoot = normalize(own)
  const server = createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end()
      return
    }
    try {
      let body: Buffer | string
      let type: string
      if (path === '/' || path === '/estudio.html') {
        body = studioPage(await readFile(join(root, 'index.html'), 'utf8'))
        type = TYPES['.html']
      } else {
        const own = path.startsWith('/orquest/')
        const file = own ? inside(ownRoot, path.slice('/orquest'.length)) : inside(root, path)
        if (!file) {
          res.writeHead(404).end()
          return
        }
        body = await readFile(file)
        type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
      }
      // Lo de Orquest cambia con la app y el editor con su versión: que nada quede pegado.
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      res.end(req.method === 'HEAD' ? undefined : body)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/estudio.html`,
    close: () => new Promise((ok) => server.close(() => ok())),
  }
}
