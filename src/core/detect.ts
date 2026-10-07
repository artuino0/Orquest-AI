import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { PROVIDERS, type ProviderAdapter, type ProviderId } from './providers.js'

const run = promisify(execFile)

export interface CliStatus {
  id: ProviderId
  name: string
  installed: boolean
  binary?: string
  version?: string
  /** true/false si se pudo comprobar; null si el proveedor no tiene forma conocida. */
  session: boolean | null
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Busca un ejecutable en el PATH sin depender de `which`. */
export async function findBinary(name: string, pathEnv = process.env.PATH ?? ''): Promise<string | undefined> {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  for (const dir of pathEnv.split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext)
      if (await exists(candidate)) return candidate
    }
  }
  return undefined
}

export async function detectProvider(p: ProviderAdapter, home = homedir()): Promise<CliStatus> {
  let binary: string | undefined
  for (const b of p.binaries) {
    binary = await findBinary(b)
    if (binary) break
  }
  if (!binary) return { id: p.id, name: p.name, installed: false, session: null }

  let version: string | undefined
  try {
    const { stdout } = await run(binary, p.versionArgs, { timeout: 5000 })
    version = stdout.trim().split('\n')[0]
  } catch {
    // Instalada pero no respondió a --version; se reporta sin versión.
  }

  let session: boolean | null = null
  if (p.sessionPaths.length) {
    session = false
    for (const rel of p.sessionPaths) {
      if (await exists(join(home, rel))) {
        session = true
        break
      }
    }
  }
  return { id: p.id, name: p.name, installed: true, binary, version, session }
}

/** Revisa todas las CLIs conocidas. Sin al menos una usable, no se puede contratar. */
export async function detectAll(home?: string): Promise<CliStatus[]> {
  return Promise.all(Object.values(PROVIDERS).map((p) => detectProvider(p, home)))
}

export function canHire(statuses: CliStatus[]): boolean {
  return statuses.some((s) => s.installed && s.session !== false)
}
