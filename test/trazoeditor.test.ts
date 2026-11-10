import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fetchManifest, HOST_API, installedEditor, installEditor, offerFor, parseManifest, verifyMinisign, type EditorManifest } from '../src/core/trazoeditor.js'
import { zip } from './trazozip.js'

/** Una llave de minisign de prueba, con la forma en que Tauri da llave y firmas (el archivo entero en base64). */
function keys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const id = randomBytes(8)
  const pk = Buffer.from(publicKey.export({ format: 'jwk' }).x!, 'base64url')
  const b64 = (lines: string[]) => Buffer.from(lines.join('\n') + '\n').toString('base64')
  return {
    pubkey: b64(['untrusted comment: minisign public key', Buffer.concat([Buffer.from('Ed'), id, pk]).toString('base64')]),
    sign(data: Buffer) {
      const sig = sign(null, createHash('blake2b512').update(data).digest(), privateKey)
      const trusted = 'timestamp:1\tfile:trazo-web.zip'
      const global = sign(null, Buffer.concat([sig, Buffer.from(trusted)]), privateKey)
      return b64(['untrusted comment: signature', Buffer.concat([Buffer.from('ED'), id, sig]).toString('base64'), `trusted comment: ${trusted}`, global.toString('base64')])
    },
  }
}

const editorZip = (version = '0.2.8') => zip({ 'editor/index.html': `<html>${version}</html>`, 'editor/estudio.html': '<html></html>', 'skills/diseno-trazo/SKILL.md': '# Skill', 'editor/': '' })

function published(data: Buffer, k: ReturnType<typeof keys>, extra: Partial<EditorManifest> = {}): EditorManifest {
  return { version: '0.2.8', hostApi: 1, url: 'https://ejemplo.com/trazo-web-0.2.8.zip', sha256: createHash('sha256').update(data).digest('hex'), firma: k.sign(data), ...extra }
}
const serving = (data: Buffer): typeof fetch => (async () => new Response(new Uint8Array(data), { headers: { 'content-length': String(data.length) } })) as typeof fetch

describe('editor de Trazo opcional', () => {
  it('la firma es de la llave y del archivo', () => {
    const k = keys()
    const data = editorZip()
    const sig = k.sign(data)
    expect(verifyMinisign(data, sig, k.pubkey)).toBe(true)
    expect(verifyMinisign(Buffer.concat([data, Buffer.from('x')]), sig, k.pubkey)).toBe(false)
    expect(verifyMinisign(data, sig, keys().pubkey)).toBe(false)
    expect(verifyMinisign(data, 'basura', k.pubkey)).toBe(false)
  })

  it('el manifiesto se revisa y dice si este Orquest lo puede usar', () => {
    const ok = { version: '0.2.8', hostApi: 1, url: 'https://x/y.zip', sha256: 'a'.repeat(64), firma: 'f', bytes: 1500000 }
    expect(parseManifest(ok).bytes).toBe(1500000)
    expect(() => parseManifest({ ...ok, url: 'http://x/y.zip' })).toThrow(/no es válido/)
    expect(() => parseManifest({ ...ok, version: '../x' })).toThrow(/no es válido/)
    expect(offerFor(parseManifest(ok), null)).toEqual({ version: '0.2.8', bytes: 1500000, compatible: true, newer: true })
    expect(offerFor(parseManifest({ ...ok, hostApi: HOST_API + 1 }), { version: '0.2.8', root: '' })).toMatchObject({ compatible: false, newer: false })
  })

  it('consultar: sin manifiesto publicado lo dice claro; otro error, con su código; sin red, que revises la conexión', async () => {
    const ok = { version: '0.5.2', hostApi: 1, url: 'https://x/y.zip', sha256: 'b'.repeat(64), firma: 'f' }
    const answer = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch
    await expect(fetchManifest('https://x/m.json', answer(404))).rejects.toThrow(/todavía no publica el editor/)
    await expect(fetchManifest('https://x/m.json', answer(503))).rejects.toThrow(/\(503\)/)
    await expect(fetchManifest('https://x/m.json', (async () => { throw new Error('offline') }) as typeof fetch)).rejects.toThrow(/conexión/)
    await expect(fetchManifest('https://x/m.json', answer(200, ok))).resolves.toMatchObject({ version: '0.5.2' })
  })

  it('se baja, se revisa y queda como el actual; la versión anterior se quita', async () => {
    const home = await mkdtemp(join(tmpdir(), 'orquest-trazo-'))
    const k = keys()
    expect(await installedEditor(home)).toBeNull()
    const old = editorZip('0.2.7')
    await installEditor(published(old, k, { version: '0.2.7' }), { home, fetcher: serving(old), pubkey: k.pubkey })
    const seen: number[] = []
    const data = editorZip()
    const got = await installEditor(published(data, k), { home, fetcher: serving(data), pubkey: k.pubkey, onProgress: (r) => seen.push(r) })
    expect(got).toEqual({ version: '0.2.8', root: join(home, '0.2.8') })
    expect(await installedEditor(home)).toEqual(got)
    expect(await readFile(join(got.root, 'editor', 'index.html'), 'utf8')).toBe('<html>0.2.8</html>')
    expect(existsSync(join(got.root, 'skills', 'diseno-trazo', 'SKILL.md'))).toBe(true)
    expect((await readdir(home)).sort()).toEqual(['0.2.8', 'actual.json'])
    expect(seen.at(-1)).toBe(data.length)
  })

  it('dañado, sin firma buena, sin editor o para un Orquest más nuevo: no se instala y queda el que había', async () => {
    const home = await mkdtemp(join(tmpdir(), 'orquest-trazo-'))
    const k = keys()
    const data = editorZip()
    await installEditor(published(data, k), { home, fetcher: serving(data), pubkey: k.pubkey })
    const next = editorZip('0.2.9')
    const m = published(next, k, { version: '0.2.9' })
    await expect(installEditor({ ...m, sha256: 'b'.repeat(64) }, { home, fetcher: serving(next), pubkey: k.pubkey })).rejects.toThrow(/sha256/)
    await expect(installEditor(m, { home, fetcher: serving(next), pubkey: keys().pubkey })).rejects.toThrow(/firma/)
    await expect(installEditor({ ...m, hostApi: HOST_API + 1 }, { home, fetcher: serving(next), pubkey: k.pubkey })).rejects.toThrow(/Orquest más nuevo/)
    const empty = zip({ 'otra/cosa.txt': 'x' })
    await expect(installEditor(published(empty, k, { version: '0.2.9' }), { home, fetcher: serving(empty), pubkey: k.pubkey })).rejects.toThrow(/index.html/)
    expect((await installedEditor(home))?.version).toBe('0.2.8')
    expect((await readdir(home)).sort()).toEqual(['0.2.8', 'actual.json'])
  })

  it('las rutas del zip no salen de su carpeta', async () => {
    const home = await mkdtemp(join(tmpdir(), 'orquest-trazo-'))
    const k = keys()
    const data = zip({ 'editor/index.html': 'ok', '../fuera-editor.txt': 'no', '/abs.txt': 'no', 'editor/../../fuera2.txt': 'no' })
    await installEditor(published(data, k), { home, fetcher: serving(data), pubkey: k.pubkey })
    expect(existsSync(join(home, '..', 'fuera-editor.txt'))).toBe(false)
    expect(existsSync(join(home, 'fuera2.txt'))).toBe(false)
    expect((await readdir(join(home, '0.2.8'))).sort()).toEqual(['editor'])
  })
})
