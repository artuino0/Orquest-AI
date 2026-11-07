import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { inside, startEditorServer, studioPage, type EditorServer } from '../src/core/trazoserver.js'

let server: EditorServer | undefined
afterEach(async () => server?.close())

const INDEX = '<html><head>\n<script type="module" crossorigin src="/assets/main.js"></script>\n<link rel="stylesheet" href="/assets/a.css">\n</head><body></body></html>'

async function folders() {
  const base = await mkdtemp(join(tmpdir(), 'orquest-trazo-'))
  const editor = join(base, 'editor')
  const own = join(base, 'propio')
  await mkdir(join(editor, 'assets'), { recursive: true })
  await mkdir(own)
  await writeFile(join(editor, 'index.html'), INDEX)
  await writeFile(join(editor, 'assets', 'main.js'), 'console.log(1)')
  await writeFile(join(own, 'puente.js'), 'window.__TRAZO_HOST__ = {}')
  await writeFile(join(own, 'tema.css'), 'body{}')
  await writeFile(join(base, 'secreto.txt'), 'no')
  return { editor, own }
}

describe('el servidor del editor de Trazo', () => {
  it('el puente va antes del editor y la piel después de su hoja', () => {
    const page = studioPage(INDEX)
    expect(page.indexOf('/orquest/puente.js')).toBeLessThan(page.indexOf('/assets/main.js'))
    expect(page.indexOf('/orquest/tema.css')).toBeGreaterThan(page.indexOf('/assets/a.css'))
  })

  it('no se sale de su carpeta', () => {
    expect(inside('/a/editor', '/assets/x.js')).toBe(join('/a/editor', 'assets', 'x.js'))
    expect(inside('/a/editor', '/../secreto.txt')).toBeNull()
    expect(inside('/a/editor', '/%2e%2e/secreto.txt')).toBeNull()
    expect(inside('/a/editor', '/%E0%A4%A')).toBeNull()
  })

  it('sirve la página, los assets y lo de Orquest', async () => {
    const { editor, own } = await folders()
    server = await startEditorServer(editor, own)
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/estudio\.html$/)
    const page = await fetch(server.url)
    expect(page.headers.get('content-type')).toContain('text/html')
    expect(await page.text()).toContain('/orquest/puente.js')
    const base = server.url.replace('/estudio.html', '')
    const js = await fetch(`${base}/assets/main.js`)
    expect(js.headers.get('content-type')).toContain('javascript')
    expect(await (await fetch(`${base}/orquest/tema.css`)).text()).toBe('body{}')
    expect((await fetch(`${base}/assets/%2e%2e/%2e%2e/secreto.txt`)).status).toBe(404)
    expect((await fetch(`${base}/no-existe.js`)).status).toBe(404)
    expect((await fetch(server.url, { method: 'POST' })).status).toBe(405)
  })
})
