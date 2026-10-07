/**
 * Biblioteca del estudio: lo que se aprende y se reusa entre proyectos.
 *
 * - Expediente (por proveedor y modelo): puestos permitidos, notas del usuario
 *   e historial. El jefe sabe qué se necesita; el usuario sabe quién sirve
 *   para qué. Esa experiencia queda aquí.
 * - Manual de puesto (por rol): prompt, skills y documentación, permisos y
 *   formato de entrega. Contratar = proveedor + modelo + esfuerzo + manual.
 *
 * Lógica pura; la persistencia la pone quien la construye (StudioStore).
 */
import type { ProviderId } from './providers.js'

export const ROLES = ['desarrollo', 'backend', 'frontend', 'dba', 'infra', 'qa'] as const
export type Role = (typeof ROLES)[number]

export interface Dossier {
  provider: ProviderId
  /** '' = vale para cualquier modelo del proveedor. */
  model: string
  /** null = todos los puestos. */
  allowedRoles: Role[] | null
  /** block: el juego no deja asignarlo. warn: deja, pero avisa. */
  enforce: 'block' | 'warn'
  notes: string
}

export interface Permissions {
  /** Puede editar archivos sin pedir permiso. */
  edit: boolean
  /** Comandos que corre sin pedir permiso (prefijos, p. ej. "npm test"). */
  allow: string[]
  /** Comandos prohibidos (p. ej. "git push"). */
  deny: string[]
}

export interface Manual {
  role: Role
  /** Prompt de sistema del rol. */
  prompt: string
  /** Rutas de documentación que lee al entrar (relativas al repo). */
  docs: string[]
  /** Skills que debe usar, por nombre. */
  skills: string[]
  permissions: Permissions
  /** Qué debe llevar la entrega. */
  delivery: string
  /** La entrega no se acepta sin capturas. */
  requireScreenshots: boolean
}

export type Outcome = 'delivered' | 'qa_fail' | 'returned' | 'merged'

export interface HistoryEvent {
  at: number
  provider: ProviderId
  model: string
  role: string
  project: string
  taskId: string
  outcome: Outcome
  /** Con merged: se integró sin haber regresado nunca. */
  firstTry?: boolean
}

export interface Stats {
  entregas: number
  integradas: number
  a_la_primera: number
  rechazos_qa: number
  regresadas: number
  /** a_la_primera / integradas, en %; null sin integradas. */
  aprobadas_a_la_primera: number | null
  por_puesto: Record<string, { integradas: number; a_la_primera: number }>
}

export interface LibraryStore {
  loadDossiers(): Dossier[]
  saveDossier(d: Dossier): void
  loadManuals(): Manual[]
  saveManual(m: Manual): void
  loadHistory(): HistoryEvent[]
  addHistory(e: HistoryEvent): void
}

const DEV_ALLOW = ['npm test', 'npm run', 'npx vitest', 'node', 'git status', 'git diff', 'git log', 'git add', 'git commit', 'git merge']
const DEV_DENY = ['git push', 'git reset --hard', 'rm -rf']

const DEFAULT_PROMPTS: Record<Role, string> = {
  desarrollo: 'Desarrollo general: implementas lo que se te asigne en todo el stack.',
  backend: 'Backend: APIs, lógica de negocio, contratos. Documenta el contrato de API en tu entrega.',
  frontend: 'Frontend: interfaz y su integración con la API. Respeta el contrato que te pasen.',
  dba: 'DBA: esquema, migraciones y consultas. Toda migración debe poder revertirse.',
  infra: 'Infra: build, CI, despliegue y configuración. No toques secretos reales.',
  qa: 'QA: pruebas la entrega de otro, no la corriges. Tu entrega dice si pasa o no (veredicto) con pasos para reproducir cada fallo.',
}

const DEFAULT_DELIVERY: Record<Role, string> = {
  desarrollo: 'Reporte: qué hiciste y cómo probarlo.',
  backend: 'Reporte: qué hiciste, cómo probarlo y el contrato de API (rutas, entradas, salidas).',
  frontend: 'Reporte: qué hiciste y cómo probarlo; capturas de las pantallas tocadas si puedes.',
  dba: 'Reporte: cambios de esquema, migración y cómo revertirla.',
  infra: 'Reporte: qué cambió en build o despliegue y cómo verificarlo.',
  qa: 'Veredicto (pasa / no_pasa) y reporte con pasos para reproducir cada fallo.',
}

export function defaultManual(role: Role): Manual {
  return {
    role,
    prompt: DEFAULT_PROMPTS[role],
    docs: [],
    skills: [],
    permissions: { edit: true, allow: [...DEV_ALLOW], deny: [...DEV_DENY] },
    delivery: DEFAULT_DELIVERY[role],
    requireScreenshots: false,
  }
}

/** Permisos del jefe: lee y coordina; no edita ni integra por su cuenta. */
export const BOSS_PERMISSIONS: Permissions = {
  edit: false,
  allow: ['git status', 'git diff', 'git log', 'git show', 'ls', 'cat'],
  deny: ['git push', 'git merge', 'git commit', 'git reset', 'git checkout', 'rm'],
}

/** Expedientes con los que arranca un estudio nuevo; el usuario los cambia. */
export const DEFAULT_DOSSIERS: Dossier[] = [
  {
    provider: 'antigravity',
    model: '',
    allowedRoles: ['qa'],
    enforce: 'block',
    notes: 'Bueno probando flujos en navegador, malo escribiendo código.',
  },
]

export function isRole(r: string): r is Role {
  return (ROLES as readonly string[]).includes(r)
}

export type Check = { ok: true; warning?: string } | { ok: false; reason: string }

export class Library {
  private dossiersByKey = new Map<string, Dossier>()
  private manualsByRole = new Map<Role, Manual>()
  private history: HistoryEvent[] = []

  constructor(private store?: LibraryStore) {
    const saved = store?.loadDossiers() ?? []
    for (const d of saved.length ? saved : DEFAULT_DOSSIERS) this.dossiersByKey.set(key(d.provider, d.model), d)
    if (!saved.length) for (const d of DEFAULT_DOSSIERS) store?.saveDossier(d)
    for (const m of store?.loadManuals() ?? []) this.manualsByRole.set(m.role, m)
    this.history = store?.loadHistory() ?? []
  }

  // ── Expedientes ──────────────────────────────────────────────────────────

  /** El del modelo si existe; si no, el del proveedor; si no, uno abierto. */
  dossier(provider: ProviderId, model = ''): Dossier {
    return (
      this.dossiersByKey.get(key(provider, model)) ??
      this.dossiersByKey.get(key(provider, '')) ?? { provider, model: '', allowedRoles: null, enforce: 'warn', notes: '' }
    )
  }

  dossiers(): Dossier[] {
    return [...this.dossiersByKey.values()]
  }

  saveDossier(d: Dossier) {
    const clean: Dossier = {
      ...d,
      model: d.model ?? '',
      allowedRoles: d.allowedRoles ? d.allowedRoles.filter(isRole) : null,
      notes: d.notes ?? '',
    }
    this.dossiersByKey.set(key(clean.provider, clean.model), clean)
    this.store?.saveDossier(clean)
  }

  /** ¿Puede este proveedor/modelo ocupar este puesto? */
  check(provider: ProviderId, model: string | undefined, role: string): Check {
    const d = this.dossier(provider, model ?? '')
    if (!d.allowedRoles || d.allowedRoles.includes(role as Role)) return { ok: true }
    const who = `${provider}${d.model ? ` ${d.model}` : ''}`
    const msg = `El expediente de ${who} solo permite ${d.allowedRoles.join(', ') || 'ningún puesto'}; no ${role}.${d.notes ? ` Nota del usuario: ${d.notes}` : ''}`
    return d.enforce === 'block' ? { ok: false, reason: msg } : { ok: true, warning: msg }
  }

  // ── Historial ────────────────────────────────────────────────────────────

  record(e: Omit<HistoryEvent, 'at'> & { at?: number }) {
    const full = { ...e, at: e.at ?? Date.now() }
    this.history.push(full)
    this.store?.addHistory(full)
  }

  events(): HistoryEvent[] {
    return [...this.history]
  }

  /** Historial contigo; sin modelo, de todo el proveedor. */
  stats(provider: ProviderId, model?: string): Stats {
    const ev = this.history.filter((e) => e.provider === provider && (model === undefined || e.model === model))
    const s: Stats = { entregas: 0, integradas: 0, a_la_primera: 0, rechazos_qa: 0, regresadas: 0, aprobadas_a_la_primera: null, por_puesto: {} }
    for (const e of ev) {
      if (e.outcome === 'delivered') s.entregas++
      if (e.outcome === 'qa_fail') s.rechazos_qa++
      if (e.outcome === 'returned') s.regresadas++
      if (e.outcome === 'merged') {
        s.integradas++
        const r = (s.por_puesto[e.role] ??= { integradas: 0, a_la_primera: 0 })
        r.integradas++
        if (e.firstTry) {
          s.a_la_primera++
          r.a_la_primera++
        }
      }
    }
    if (s.integradas) s.aprobadas_a_la_primera = Math.round((100 * s.a_la_primera) / s.integradas)
    return s
  }

  /** Modelos con historial de un proveedor. */
  models(provider: ProviderId): string[] {
    return [...new Set(this.history.filter((e) => e.provider === provider).map((e) => e.model))]
  }

  // ── Manuales ─────────────────────────────────────────────────────────────

  manual(role: string): Manual {
    const r = isRole(role) ? role : 'desarrollo'
    return this.manualsByRole.get(r) ?? defaultManual(r)
  }

  manuals(): Manual[] {
    return ROLES.map((r) => this.manual(r))
  }

  saveManual(m: Manual) {
    if (!isRole(m.role)) throw new Error(`Puesto desconocido: ${m.role}`)
    const clean: Manual = {
      ...m,
      docs: m.docs.map((x) => x.trim()).filter(Boolean),
      skills: m.skills.map((x) => x.trim()).filter(Boolean),
      permissions: {
        edit: !!m.permissions.edit,
        allow: m.permissions.allow.map((x) => x.trim()).filter(Boolean),
        deny: m.permissions.deny.map((x) => x.trim()).filter(Boolean),
      },
    }
    this.manualsByRole.set(clean.role, clean)
    this.store?.saveManual(clean)
  }
}

function key(provider: string, model: string) {
  return `${provider}::${model}`
}
