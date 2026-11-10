/**
 * El editor de Trazo del panel Estudio es opcional: no viene en el instalador
 * de Orquest. Se baja cuando el usuario lo pide, de lo que Trazo publica en
 * cada versión (un zip con `editor/` y `skills/` y un manifiesto), y se
 * actualiza igual, sin reinstalar Orquest. Antes de usarlo se revisa su sha256
 * y su firma con la llave de Trazo (la misma de sus actualizaciones, minisign);
 * si algo falla, se queda el que había.
 */
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, sep } from 'node:path'
import { blake2b } from '@noble/hashes/blake2.js'
import { RuleError } from './board.js'
import { readZip } from './design.js'
import { T } from './i18n.js'
import { isNewer } from './update.js'

/** La versión de la interfaz Host (`window.__TRAZO_HOST__`) que habla Orquest. */
export const HOST_API = 1
export const MANIFEST_URL = 'https://github.com/artuino0/trazo-releases/releases/latest/download/trazo-orquest.json'
/** Llave pública de Trazo (`plugins.updater.pubkey` de su tauri.conf.json): firma sus versiones. */
export const TRAZO_PUBKEY =
  'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDU5MTk3N0RFMkQyNDI2MzIKUldReUppUXQzbmNaV1ptRmIrYTBUSXhxNGI4THZ2K2R5YkZENHRlQjF5Z2N4VU9ZdDdEeHVEejIK'

/** Lo que Trazo publica junto al zip. */
export interface EditorManifest {
  version: string
  /** Interfaz Host que pide el editor: si es mayor que `HOST_API`, hace falta un Orquest más nuevo. */
  hostApi: number
  url: string
  sha256: string
  /** El `.sig` de `tauri signer sign` (minisign en base64). */
  firma: string
  /** Lo que pesa el zip, para decírselo al usuario antes de bajarlo. */
  bytes?: number
}

export interface InstalledEditor {
  version: string
  /** Carpeta con `editor/` y `skills/`. */
  root: string
}

const CURRENT = 'actual.json'

/** El editor instalado en `home` (`<userData>/trazo`), si está completo. */
export async function installedEditor(home: string): Promise<InstalledEditor | null> {
  try {
    const { version } = JSON.parse(await readFile(join(home, CURRENT), 'utf8')) as { version?: string }
    if (!version || !/^[\w.-]+$/.test(version)) return null
    const root = join(home, version)
    return existsSync(join(root, 'editor', 'index.html')) ? { version, root } : null
  } catch {
    return null
  }
}

export function parseManifest(raw: unknown): EditorManifest {
  const m = (raw ?? {}) as Partial<EditorManifest>
  const ok =
    typeof m.version === 'string' && /^[\w.-]+$/.test(m.version) &&
    typeof m.hostApi === 'number' &&
    typeof m.url === 'string' && m.url.startsWith('https://') &&
    typeof m.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(m.sha256) &&
    typeof m.firma === 'string'
  if (!ok) throw new RuleError(T`El manifiesto del editor de Trazo no es válido.`)
  return { version: m.version!, hostApi: m.hostApi!, url: m.url!, sha256: m.sha256!.toLowerCase(), firma: m.firma!, bytes: typeof m.bytes === 'number' ? m.bytes : undefined }
}

/** Pregunta qué versión publicó Trazo. Sin red o si tarda, el motivo; nunca frena a la app. */
export async function fetchManifest(url = MANIFEST_URL, fetcher: typeof fetch = fetch): Promise<EditorManifest> {
  let res: Response
  try {
    res = await fetcher(url, { signal: AbortSignal.timeout(10_000) })
  } catch {
    throw new RuleError(T`No se pudo consultar el editor de Trazo: revisa tu conexión.`)
  }
  // 404: la última versión de Trazo no trae el editor para Orquest (aún no lo publica).
  if (res.status === 404) throw new RuleError(T`Trazo todavía no publica el editor para Orquest. Prueba más tarde.`)
  if (!res.ok) throw new RuleError(T`No se pudo consultar el editor de Trazo (${res.status}).`)
  return parseManifest(await res.json().catch(() => null))
}

/** Lo que el panel necesita para ofrecer bajarlo o actualizarlo. */
export interface EditorOffer {
  version: string
  bytes?: number
  /** Este Orquest lo puede usar (su `hostApi` no es mayor). */
  compatible: boolean
  /** Le gana al instalado (o no hay ninguno). */
  newer: boolean
}

export function offerFor(m: EditorManifest, installed: InstalledEditor | null): EditorOffer {
  return { version: m.version, bytes: m.bytes, compatible: m.hostApi <= HOST_API, newer: !installed || isNewer(m.version, installed.version) }
}

// ── Firma minisign (como la revisa el actualizador de Tauri) ────────────────
const b64lines = (text: string) => Buffer.from(text, 'base64').toString('utf8').split(/\r?\n/)

/**
 * `data` lo firmó la llave `pubkey`. Las dos vienen como las da Tauri: el
 * archivo de minisign entero en base64. Firma «ED»: ed25519 sobre el
 * blake2b-512 del archivo; «Ed»: sobre el archivo tal cual. También se revisa
 * la firma del comentario de confianza, que va pegada a la otra.
 */
export function verifyMinisign(data: Buffer, signature: string, pubkey: string): boolean {
  try {
    const key = Buffer.from(b64lines(pubkey)[1] ?? '', 'base64')
    const lines = b64lines(signature)
    const sig = Buffer.from(lines[1] ?? '', 'base64')
    const trusted = lines[2] ?? ''
    const global = Buffer.from(lines[3] ?? '', 'base64')
    if (key.length !== 42 || sig.length !== 74 || global.length !== 64 || !trusted.startsWith('trusted comment: ')) return false
    if (key.toString('latin1', 0, 2) !== 'Ed' || !key.subarray(2, 10).equals(sig.subarray(2, 10))) return false
    const alg = sig.toString('latin1', 0, 2)
    if (alg !== 'ED' && alg !== 'Ed') return false
    const pk = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: key.subarray(10).toString('base64url') }, format: 'jwk' })
    // Electron trae BoringSSL, sin blake2b: va en JavaScript.
    const message = alg === 'ED' ? blake2b(data) : data
    const raw = sig.subarray(10)
    return verify(null, message, pk, raw) && verify(null, Buffer.concat([raw, Buffer.from(trusted.slice(17))]), pk, global)
  } catch {
    return false
  }
}

// ── Bajar e instalar ─────────────────────────────────────────────────────────
export interface InstallOptions {
  /** `<userData>/trazo`. */
  home: string
  fetcher?: typeof fetch
  /** Llave con que se revisa la firma; de fábrica, la de Trazo. */
  pubkey?: string
  onProgress?(received: number, total: number): void
}

async function download(url: string, fetcher: typeof fetch, onProgress?: (r: number, t: number) => void): Promise<Buffer> {
  let res: Response
  try {
    res = await fetcher(url, { signal: AbortSignal.timeout(300_000) })
  } catch {
    throw new RuleError(T`No se pudo bajar el editor de Trazo: revisa tu conexión.`)
  }
  if (!res.ok || !res.body) throw new RuleError(T`No se pudo bajar el editor de Trazo (${res.status}).`)
  const total = Number(res.headers.get('content-length')) || 0
  const parts: Buffer[] = []
  let received = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(Buffer.from(value))
    received += value.length
    onProgress?.(received, total)
  }
  return Buffer.concat(parts)
}

/** Las rutas del zip, sin salirse de la carpeta. */
function safeName(name: string): string | null {
  if (!name || name.endsWith('/') || name.includes('\\') || name.startsWith('/') || /^[a-z]:/i.test(name)) return null
  if (name.split('/').some((p) => p === '..' || p === '.' || p === '')) return null
  return name
}

/**
 * Baja la versión del manifiesto, la revisa y la deja como la actual. Se
 * descomprime aparte y se cambia de golpe: a medias nunca queda nada.
 */
export async function installEditor(m: EditorManifest, o: InstallOptions): Promise<InstalledEditor> {
  if (m.hostApi > HOST_API) throw new RuleError(T`Esta versión de Trazo (${m.version}) necesita un Orquest más nuevo: actualiza Orquest primero.`)
  const zip = await download(m.url, o.fetcher ?? fetch, o.onProgress)
  if (createHash('sha256').update(zip).digest('hex') !== m.sha256) throw new RuleError(T`El editor de Trazo llegó dañado (no coincide su sha256). No se instaló.`)
  if (!verifyMinisign(zip, m.firma, o.pubkey ?? TRAZO_PUBKEY)) throw new RuleError(T`La firma del editor de Trazo no es válida. No se instaló.`)
  let files: Map<string, Buffer>
  try {
    files = readZip(zip)
  } catch {
    throw new RuleError(T`El editor de Trazo no vino como zip. No se instaló.`)
  }
  if (!files.has('editor/index.html')) throw new RuleError(T`Al editor de Trazo le falta editor/index.html. No se instaló.`)

  const root = join(o.home, m.version)
  const tmp = join(o.home, `.${m.version}-${randomBytes(4).toString('hex')}`)
  try {
    for (const [name, data] of files) {
      const rel = safeName(name)
      if (!rel) continue
      const full = normalize(join(tmp, rel))
      if (!full.startsWith(tmp + sep)) continue
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, data)
    }
    await rm(root, { recursive: true, force: true })
    await rename(tmp, root)
  } catch (e) {
    await rm(tmp, { recursive: true, force: true })
    throw e
  }
  const current = join(o.home, `${CURRENT}.tmp`)
  await writeFile(current, JSON.stringify({ version: m.version, hostApi: m.hostApi }))
  await rename(current, join(o.home, CURRENT))
  // Las versiones anteriores ya no sirven.
  for (const n of await readdir(o.home).catch(() => [] as string[])) {
    if (n !== m.version && n !== CURRENT) await rm(join(o.home, n), { recursive: true, force: true }).catch(() => {})
  }
  return { version: m.version, root }
}
