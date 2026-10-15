/**
 * Cuentas de un mismo proveedor.
 *
 * Una CLI guarda su sesión en una carpeta del usuario (`~/.codex`). Si hay otra
 * carpeta hermana con su propia sesión (`~/.codex2`), es otra cuenta: lanzando
 * la CLI con la variable que le dice dónde vive, las dos pueden trabajar al
 * mismo tiempo. Aquí se listan, se dice con qué entorno se lanza cada una y
 * cuánto lleva gastado de su límite.
 *
 * Nunca se leen los archivos de sesión: solo se mira si existen.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getProvider, type ProviderId } from './providers.js'
import { RuleError } from './board.js'
import { T } from './i18n.js'

/** Un tramo del límite: las últimas 5 horas, la semana… */
export interface UsageWindow {
  label: string
  minutes: number
  /** 0–100. */
  used: number
  /** Cuándo vuelve a cero (ms), si se sabe. */
  resetsAt?: number
}

export interface AccountUsage {
  windows: UsageWindow[]
  /** De cuándo es el dato (ms). */
  at: number
}

export interface Account {
  provider: ProviderId
  /** Nombre de su carpeta (`.codex2`). Es lo que se guarda en el tablero; la principal no lleva. */
  dir: string
  /** true si es la carpeta de siempre de la CLI. */
  main: boolean
  /** "Principal", o lo que distingue a la carpeta ("2", "trabajo"). */
  label: string
  usage?: AccountUsage
}

interface Home {
  base: string
  /** Archivo que prueba que ahí hay una sesión iniciada. */
  marker: string
  /** Variable con la que la CLI cambia de carpeta. */
  env: string
}

const HOMES: Partial<Record<ProviderId, Home>> = {
  codex: { base: '.codex', marker: 'auth.json', env: 'CODEX_HOME' },
  claude: { base: '.claude', marker: '.credentials.json', env: 'CLAUDE_CONFIG_DIR' },
}

/** Proveedores que saben trabajar con más de una cuenta. */
export const multiAccount = (provider: ProviderId): boolean => !!HOMES[provider]

/** `.codex2` → "2"; `.codex-trabajo` → "trabajo". Solo letras, números, guion y guion bajo: nada que salga de la carpeta del usuario. */
const suffix = (base: string, dir: string): string | undefined => {
  if (!dir.startsWith(base)) return undefined
  const rest = dir.slice(base.length)
  return /^[-_]?[A-Za-z0-9][A-Za-z0-9_-]*$/.test(rest) ? rest.replace(/^[-_]/, '') : undefined
}

/** Las cuentas que hay en esta máquina, la principal primero. */
export function listAccounts(home = homedir(), now = Date.now()): Account[] {
  let names: string[]
  try {
    names = readdirSync(home)
  } catch {
    return []
  }
  const out: Account[] = []
  for (const [provider, h] of Object.entries(HOMES) as [ProviderId, Home][]) {
    const found: Account[] = []
    for (const dir of names) {
      const main = dir === h.base
      const label = main ? T`Principal` : suffix(h.base, dir)
      if (label === undefined || !existsSync(join(home, dir, h.marker))) continue
      found.push({ provider, dir, main, label, usage: provider === 'codex' ? codexUsage(join(home, dir), now) : undefined })
    }
    out.push(...found.sort((a, b) => Number(b.main) - Number(a.main) || a.dir.localeCompare(b.dir)))
  }
  return out
}

/** Con qué entorno se lanza la CLI para que use esa cuenta. La principal no necesita nada. */
/** La variable con que una CLI elige su cuenta (CODEX_HOME, CLAUDE_CONFIG_DIR), si sabe usar otra. */
export const accountVar = (provider: ProviderId): string | undefined => HOMES[provider]?.env

export function accountEnv(provider: ProviderId, dir: string | undefined, home = homedir()): Record<string, string> {
  const h = HOMES[provider]
  if (!dir || dir === h?.base) return {}
  const name = getProvider(provider).name
  if (!h) throw new RuleError(T`${name} no sabe trabajar con otra cuenta; quita la cuenta del puesto.`)
  if (suffix(h.base, dir) === undefined || !existsSync(join(home, dir, h.marker))) {
    throw new RuleError(T`La cuenta "${dir}" de ${name} no está en esta máquina o no tiene sesión iniciada. Elige otra cuenta o inicia sesión en esa.`)
  }
  return { [h.env]: join(home, dir) }
}

const windowLabel = (minutes: number): string =>
  minutes === 300 ? T`5 horas` : minutes === 10080 ? T`Semana` : minutes % 1440 === 0 ? T`${minutes / 1440} días` : minutes % 60 === 0 ? T`${minutes / 60} horas` : T`${minutes} min`

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
/** Segundos o milisegundos desde 1970, o una fecha escrita → ms. */
const when = (v: unknown): number | undefined => {
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isNaN(t) ? undefined : t
  }
  const n = num(v)
  return n === undefined ? undefined : n < 1e11 ? n * 1000 : n
}

/** Un tramo ya vencido volvió a cero aunque el dato guardado diga otra cosa. */
const fresh = (w: UsageWindow, now: number): UsageWindow => (w.resetsAt !== undefined && w.resetsAt <= now ? { ...w, used: 0, resetsAt: undefined } : w)

/** Lo que Codex anota de su límite en cada turno (`rate_limits` con `primary` y `secondary`). */
export function parseCodexLimits(text: string, at: number, now = at): AccountUsage | undefined {
  const key = '"rate_limits":'
  // Del último hacia atrás. En 0 se corta: buscar "antes de 0" vuelve a dar 0.
  for (let i = text.lastIndexOf(key); i >= 0; i = i > 0 ? text.lastIndexOf(key, i - 1) : -1) {
    const start = text.indexOf('{', i)
    if (start < 0) continue
    // El objeto termina donde se cierran sus llaves; no trae llaves dentro de textos.
    let depth = 0
    let end = -1
    for (let j = start; j < text.length; j++) {
      if (text[j] === '{') depth++
      else if (text[j] === '}' && --depth === 0) {
        end = j
        break
      }
    }
    if (end < 0) continue
    let limits: Record<string, unknown>
    try {
      limits = JSON.parse(text.slice(start, end + 1))
    } catch {
      continue
    }
    const windows: UsageWindow[] = []
    for (const k of ['primary', 'secondary']) {
      const w = limits[k] as { used_percent?: unknown; window_minutes?: unknown; resets_at?: unknown } | null | undefined
      const used = num(w?.used_percent)
      const minutes = num(w?.window_minutes)
      if (used === undefined || minutes === undefined) continue
      windows.push(fresh({ label: windowLabel(minutes), minutes, used: Math.max(0, Math.min(100, used)), resetsAt: when(w?.resets_at) }, now))
    }
    if (windows.length) return { windows, at }
  }
  return undefined
}

/** El último dato de límite que dejó Codex en esa carpeta: está en su sesión más reciente. */
export function codexUsage(dir: string, now = Date.now()): AccountUsage | undefined {
  const newest = (path: string): string[] => {
    try {
      return readdirSync(path).sort().reverse()
    } catch {
      return []
    }
  }
  const root = join(dir, 'sessions')
  let looked = 0
  for (const y of newest(root)) for (const m of newest(join(root, y))) for (const d of newest(join(root, y, m))) for (const f of newest(join(root, y, m, d))) {
    if (!f.endsWith('.jsonl')) continue
    // Una sesión recién abierta puede no traer el dato todavía: se miran unas cuantas hacia atrás.
    if (++looked > 6) return undefined
    try {
      const file = join(root, y, m, d, f)
      const usage = parseCodexLimits(readFileSync(file, 'utf8'), statSync(file).mtimeMs, now)
      if (usage) return usage
    } catch {
      /* archivo a medio escribir o sin permiso: se prueba el anterior */
    }
  }
  return undefined
}

/** Lo que la barra de estado de Claude Code trae de su límite (`rate_limits.five_hour`, `seven_day`). */
export function parseClaudeLimits(body: unknown, now = Date.now()): AccountUsage | undefined {
  const limits = (body as { rate_limits?: Record<string, unknown> } | null)?.rate_limits
  if (!limits || typeof limits !== 'object') return undefined
  const windows: UsageWindow[] = []
  for (const [k, minutes] of [['five_hour', 300], ['seven_day', 10080]] as const) {
    const w = limits[k] as { used_percentage?: unknown; used_percent?: unknown; resets_at?: unknown } | null | undefined
    const used = num(w?.used_percentage) ?? num(w?.used_percent)
    if (used === undefined) continue
    windows.push(fresh({ label: windowLabel(minutes), minutes, used: Math.max(0, Math.min(100, used)), resetsAt: when(w?.resets_at) }, now))
  }
  return windows.length ? { windows, at: now } : undefined
}
