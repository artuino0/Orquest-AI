import { execFile } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { PROVIDERS, type Effort, type ProviderAdapter, type ProviderId } from './providers.js'

export interface CliStatus {
  id: ProviderId
  name: string
  installed: boolean
  binary?: string
  /** Número de versión, sin el nombre de la CLI. */
  version?: string
  /** true/false si se pudo comprobar; null si el proveedor no tiene forma conocida. */
  session: boolean | null
  /** Con qué cuenta o plan está la sesión, si la CLI lo dice. */
  account?: string
  /** Modelos que la propia CLI ofrece (alias, su listado o el de su configuración). Vacío = se escribe a mano. */
  models?: string[]
  /** Esfuerzos que recibe por argumento. Vacío = no recibe. */
  efforts?: Effort[]
  /** Qué hacer para iniciar sesión. */
  login?: string
  /** Cómo instalarla. */
  install?: { command?: string; url: string }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Existe y, si es carpeta, tiene algo dentro: una carpeta de credenciales vacía no es sesión. */
async function holdsSomething(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory() ? (await readdir(path)).length > 0 : true
  } catch {
    return false
  }
}

/** Busca un ejecutable en el PATH sin depender de `which`. */
export async function findBinary(name: string, pathEnv = process.env.PATH ?? ''): Promise<string | undefined> {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat'] : ['']
  for (const dir of pathEnv.split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext)
      if (await exists(candidate)) return candidate
    }
  }
  return undefined
}

export interface CliOutput {
  stdout: string
  stderr: string
  /** Código de salida; -1 si no se pudo ejecutar o se pasó de tiempo. */
  code: number
}

/**
 * Corre una CLI y devuelve lo que contestó, sin lanzar. En Windows las CLIs
 * instaladas con npm son lanzadores .cmd, que Node no ejecuta directo: van por
 * el intérprete del sistema.
 */
export function runCli(binary: string, args: string[], timeoutMs = 8000): Promise<CliOutput> {
  const batch = process.platform === 'win32' && /\.(cmd|bat)$/i.test(binary)
  const file = batch ? (process.env.ComSpec ?? 'cmd.exe') : binary
  // /s con comillas alrededor de todo: la ruta puede traer espacios.
  const argv = batch ? ['/d', '/s', '/c', `""${binary}" ${args.join(' ')}"`] : args
  return new Promise((done) => {
    execFile(file, argv, { timeout: timeoutMs, windowsHide: true, windowsVerbatimArguments: batch }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0
      done({ stdout: String(stdout), stderr: String(stderr), code })
    })
  })
}

/** "codex-cli 0.48.0" → "0.48.0". Si no trae número, la primera línea tal cual. */
function versionOf(out: string): string | undefined {
  const line = out.trim().split('\n')[0]?.trim()
  if (!line) return undefined
  return /\d+\.\d+(\.\d+)?([-.+][\w.]+)?/.exec(line)?.[0] ?? line
}

/** Nombres que casan con `pattern` dentro de un archivo grande (el programa de una CLI), sin cargarlo entero. */
function scanFile(file: string, pattern: RegExp): Promise<string[]> {
  return new Promise((done) => {
    const found = new Set<string>()
    let tail = ''
    createReadStream(file, { encoding: 'latin1', highWaterMark: 1 << 20 })
      .on('data', (chunk) => {
        const text = tail + chunk
        for (const m of text.matchAll(pattern)) found.add(m[0])
        tail = text.slice(-64) // un nombre puede quedar partido entre dos trozos
      })
      .on('end', () => done([...found]))
      .on('error', () => done([]))
  })
}

/** Qué modelos ofrece una CLI instalada, según su fuente (ver ModelSource). */
async function modelsOf(p: ProviderAdapter, binary: string, home: string): Promise<string[]> {
  const found = [...(p.models.list ?? [])]
  for (const f of p.models.files ?? []) {
    try {
      found.push(...f.read(await readFile(join(home, f.path), 'utf8')))
    } catch {
      // Sin ese archivo, esa fuente no dice nada.
    }
  }
  if (p.models.scan) {
    for (const file of p.models.scan.files(binary)) {
      // Solo el programa de verdad (pesa megas); un lanzador de texto no trae nada.
      const size = await stat(file).then((s) => s.size, () => 0)
      if (size < 1 << 20) continue
      found.push(...p.models.scan.read(await scanFile(file, p.models.scan.pattern)))
      break
    }
  }
  if (p.models.command) {
    // Algunas lo piden a su servidor: se les da más tiempo que a --version.
    const out = await runCli(binary, p.models.command.args, 20000)
    if (out.code === 0) found.push(...p.models.command.read(out.stdout))
  }
  return [...new Set(found)].slice(0, 300)
}

export async function detectProvider(p: ProviderAdapter, home = homedir()): Promise<CliStatus> {
  const base = { id: p.id, name: p.name, login: p.login, install: p.install, efforts: p.efforts }
  let binary: string | undefined
  for (const b of p.binaries) {
    binary = await findBinary(b)
    if (binary) break
  }
  if (!binary) return { ...base, installed: false, session: null }

  // Instalada pero muda ante --version: se reporta sin versión.
  const v = await runCli(binary, p.versionArgs)
  const version = versionOf(v.stdout) ?? versionOf(v.stderr)

  let session: boolean | null = null
  let account: string | undefined
  if (p.sessionCheck) {
    const out = await runCli(binary, p.sessionCheck.args)
    // Si ni siquiera corrió, no dice nada sobre la sesión: se mira el archivo.
    if (out.code !== -1) {
      const r = p.sessionCheck.read(out)
      session = r.ok
      account = r.account
    }
  }
  if (session === null && p.sessionPaths.length) {
    session = false
    for (const rel of p.sessionPaths) {
      if (await holdsSomething(join(home, rel))) {
        session = true
        break
      }
    }
  }
  return { ...base, installed: true, binary, version, session, ...(account && { account }) }
}

/**
 * Qué modelos ofrece cada CLI lista. Va aparte de detectAll porque algunas se
 * lo preguntan a su servidor y tardan: Inicio no espera por esto.
 */
export async function detectModels(clis: CliStatus[], home = homedir()): Promise<Partial<Record<ProviderId, string[]>>> {
  const ready = clis.filter((c) => c.installed && c.binary && c.session !== false)
  const lists = await Promise.all(ready.map((c) => modelsOf(PROVIDERS[c.id], c.binary!, home)))
  return Object.fromEntries(ready.map((c, i) => [c.id, lists[i]]))
}

/** Revisa todas las CLIs conocidas. Sin al menos una usable, no se puede contratar. */
export async function detectAll(home?: string): Promise<CliStatus[]> {
  return Promise.all(Object.values(PROVIDERS).map((p) => detectProvider(p, home)))
}

/** Lista: instalada y sin prueba de que le falte sesión. */
export const isReady = (s: CliStatus) => s.installed && s.session !== false

export function canHire(statuses: CliStatus[]): boolean {
  return statuses.some(isReady)
}
