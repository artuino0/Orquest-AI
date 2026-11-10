/**
 * Tareas: encargos cortos que el usuario le da directo a un agente, sin pasar
 * por el jefe. Cada una trabaja en su worktree, en una rama que sale de la que
 * el usuario eligió (`feature/…`, `fix/…`, `hotfix/…`, `chore/…`) y, al
 * aprobarla, se une de vuelta a esa misma rama con su línea en CHANGELOG.md.
 *
 * Aquí va lo puro: nombres de rama, el registro de cambios y qué tareas chocan
 * por tocar los mismos archivos. Lanzar, integrar y descartar viven en Studio.
 */
import type { Effort, ProviderId } from './providers.js'
import { T } from './i18n.js'
import { slug } from './names.js'
import type { Office } from './worktree.js'

export const ERRAND_KINDS = ['feature', 'fix', 'hotfix', 'chore'] as const
export type ErrandKind = (typeof ERRAND_KINDS)[number]

/**
 * - working: el agente está en ello (o esperando a que el usuario le conteste).
 * - ready: dijo que terminó; espera que el usuario la revise.
 * - stopped: Orquest la detuvo (toca archivos de otra tarea) o el usuario la paró.
 * - merged / discarded: cerrada.
 */
export type ErrandStatus = 'working' | 'ready' | 'stopped' | 'merged' | 'discarded'

/** Un renglón del chat de la tarea. */
export interface ErrandEntry {
  at: number
  /** user: lo que escribió el usuario; agent: lo que contó el agente; orquest: un aviso de la app. */
  by: 'user' | 'agent' | 'orquest'
  text: string
  /** Marca un renglón especial: terminó, o la detuvieron. */
  kind?: 'done' | 'stop'
}

export interface Errand {
  /** Id del agente que la resuelve (su terminal). */
  id: string
  title: string
  /** Qué hay que hacer, como lo escribió el usuario. */
  brief: string
  kind: ErrandKind
  provider: ProviderId
  model?: string
  effort?: Effort
  account?: string
  /** Repositorio, en un proyecto que agrupa varios (su nombre en `Studio.repos`). */
  repo?: string
  /** Rama de la que sale y a la que vuelve. */
  base: string
  /** Su rama propia. */
  branch: string
  office?: Office
  status: ErrandStatus
  createdAt: number
  closedAt?: number
  /** Por qué está detenida, si lo está. */
  stopReason?: string
  /** La línea que va al registro de cambios; la escribe el agente al terminar. */
  changelog?: string
  /** Su conversación en la CLI, para retomarla al reabrir. */
  sessionId?: string
  /** Commit con que se integró. */
  commit?: string
  log: ErrandEntry[]
}

export const isOpen = (e: Pick<Errand, 'status'>) => e.status === 'working' || e.status === 'ready' || e.status === 'stopped'

/** Prefijo de la rama según el tipo, como en gitflow. */
export const branchPrefix = (kind: ErrandKind) => kind

/** Hasta dónde se deja crecer el nombre de una rama: que se lea en la interfaz y en git. */
const MAX_SLUG = 40

function shortSlug(title: string): string {
  const s = slug(title)
  if (s.length <= MAX_SLUG) return s
  // Se corta en un guion para no dejar media palabra.
  const cut = s.slice(0, MAX_SLUG)
  return cut.slice(0, cut.lastIndexOf('-') > 10 ? cut.lastIndexOf('-') : MAX_SLUG)
}

/** El primer nombre libre: `base`, `base-2`, `base-3`… */
function free(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

/** Rama de la tarea: `fix/boton-estudio-404`. No repite una que ya exista. */
export function branchFor(kind: ErrandKind, title: string, taken: Iterable<string>): string {
  return free(`${branchPrefix(kind)}/${shortSlug(title)}`, new Set(taken))
}

/** Id del agente de la tarea: `tarea-boton-estudio-404`. */
export function errandIdFor(title: string, taken: Iterable<string>): string {
  return free(`tarea-${shortSlug(title)}`, new Set(taken))
}

// ── Registro de cambios (Keep a Changelog) ─────────────────────────────────

/** Cómo se llama cada sección en los dos idiomas: se reconoce la que ya tenga el archivo. */
const SECTIONS: Record<ErrandKind, { es: string; en: string }> = {
  feature: { es: 'Agregado', en: 'Added' },
  fix: { es: 'Corregido', en: 'Fixed' },
  hotfix: { es: 'Corregido', en: 'Fixed' },
  chore: { es: 'Cambiado', en: 'Changed' },
}
const UNRELEASED = /^##\s*\[?(Unreleased|Sin publicar)\]?\s*$/i

/** Nombre de la sección en el idioma activo (si el archivo no trae ya una con el otro nombre). */
export function sectionName(kind: ErrandKind): string {
  return kind === 'chore' ? T`Cambiado` : kind === 'feature' ? T`Agregado` : T`Corregido`
}

/** La línea tal como entra al registro: las urgentes se marcan. */
export function changelogLine(kind: ErrandKind, text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim().replace(/^[-*]\s+/, '')
  return kind === 'hotfix' ? `- ${T`Urgente:`} ${clean}` : `- ${clean}`
}

/**
 * Agrega una línea al registro de cambios, bajo «Sin publicar» y en la sección
 * de su tipo. Sin archivo, lo crea con el formato de Keep a Changelog. Respeta
 * los nombres que ya tenga (en español o en inglés) y no toca lo demás.
 */
export function addChangelogEntry(current: string | null, kind: ErrandKind, text: string): string {
  const line = changelogLine(kind, text)
  const names = SECTIONS[kind]
  if (!current?.trim()) {
    return `# ${T`Registro de cambios`}\n\n${T`Todos los cambios notables de este proyecto se anotan aquí. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).`}\n\n## [${T`Sin publicar`}]\n\n### ${sectionName(kind)}\n\n${line}\n`
  }
  const eol = current.includes('\r\n') ? '\r\n' : '\n'
  const lines = current.split(/\r?\n/)
  let start = lines.findIndex((l) => UNRELEASED.test(l))
  if (start < 0) {
    // Sin «Sin publicar»: va antes de la primera versión, o al final si no hay ninguna.
    const firstVersion = lines.findIndex((l) => /^##\s/.test(l))
    const at = firstVersion < 0 ? lines.length : firstVersion
    const block = [`## [${T`Sin publicar`}]`, '', `### ${sectionName(kind)}`, '', line, '']
    const before = lines.slice(0, at)
    while (before.length && !before[before.length - 1].trim()) before.pop()
    const out = [...before, '', ...block, ...lines.slice(at)]
    return finish(out, eol)
  }
  // Fin de «Sin publicar»: la siguiente versión o el final.
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l))
  if (end < 0) end = lines.length
  const heading = new RegExp(`^###\\s*(${names.es}|${names.en})\\s*$`, 'i')
  const sec = lines.findIndex((l, i) => i > start && i < end && heading.test(l))
  if (sec < 0) {
    // La sección no existe: se agrega al final de «Sin publicar».
    let at = end
    while (at > start + 1 && !lines[at - 1].trim()) at--
    const out = [...lines.slice(0, at), '', `### ${sectionName(kind)}`, '', line, ...(end < lines.length ? [''] : []), ...lines.slice(end)]
    return finish(out, eol)
  }
  // Dentro de la sección: después de su último renglón con texto.
  let secEnd = lines.findIndex((l, i) => i > sec && i < end && /^###\s/.test(l))
  if (secEnd < 0) secEnd = end
  let at = secEnd
  while (at > sec + 1 && !lines[at - 1].trim()) at--
  // Una sección recién creada a mano puede no tener renglón en blanco tras el título.
  const pad = at === sec + 1 ? [''] : []
  const out = [...lines.slice(0, at), ...pad, line, ...lines.slice(at)]
  return finish(out, eol)
}

function finish(lines: string[], eol: string): string {
  const text = lines.join(eol)
  return text.endsWith(eol) ? text : `${text}${eol}`
}

// ── Choques entre tareas ───────────────────────────────────────────────────

export interface Clash {
  /** La que se detiene: la que llegó después. */
  stop: string
  /** Con quién choca. */
  with: string
  files: string[]
}

/**
 * Qué tareas abiertas tocan los mismos archivos (en el mismo repositorio). Se
 * detiene la que se creó después; la primera sigue. Una que ya está detenida
 * no se vuelve a reportar con la misma.
 */
export function clashes(open: { id: string; createdAt: number; repo?: string; files: string[]; stopped?: boolean }[]): Clash[] {
  const sorted = [...open].sort((a, b) => a.createdAt - b.createdAt)
  const out: Clash[] = []
  const stopped = new Set(open.filter((e) => e.stopped).map((e) => e.id))
  for (let i = 0; i < sorted.length; i++) {
    const later = sorted[i]
    if (stopped.has(later.id)) continue
    for (let j = 0; j < i; j++) {
      const earlier = sorted[j]
      if (stopped.has(earlier.id) || (earlier.repo ?? '') !== (later.repo ?? '')) continue
      const mine = new Set(later.files)
      const shared = earlier.files.filter((f) => mine.has(f))
      if (shared.length) {
        out.push({ stop: later.id, with: earlier.id, files: shared.sort() })
        stopped.add(later.id)
        break
      }
    }
  }
  return out
}
