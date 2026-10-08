/**
 * Lo que la oficina de píxel necesita saber del estudio, dicho en su idioma.
 *
 * La oficina no conoce tableros ni terminales: recibe quién está y en qué anda
 * (`officeState`) y qué acaba de pasar con las tareas (`officeEvents`). Aquí se
 * traduce; es puro, sin Electron ni Node, para que lo use el panel tal cual.
 */
import type { Task } from './board.js'
import type { ProviderId } from './providers.js'
import type { EmployeeState } from './state.js'

/** Mismo id que usa Studio para el jefe. */
const BOSS = 'jefe'

/** En qué anda alguien, como lo entiende la oficina. */
export type OfficeStatus = 'idle' | 'working' | 'blocked' | 'done'

export interface OfficePerson {
  id: string
  name: string
  role: string
  provider: ProviderId
  model?: string
  isBoss: boolean
  status: OfficeStatus
}

/** Lo que alguien está haciendo, para su globo. */
export interface OfficeActivity {
  emoji: string
  text: string
  task: string
}

export interface OfficeState {
  /** Quién está en la oficina; quien cerró su terminal ya no viene. */
  people: OfficePerson[]
  activities: Record<string, OfficeActivity>
}

export interface OfficeEvent {
  at: number
  /** A quién le pasa. */
  agent: string
  /** asignada: el jefe le lleva la tarea. reporte: va a entregar. revision: el jefe le da el veredicto. */
  type: 'asignada' | 'reporte' | 'revision'
  text: string
  emoji?: string
  verdict?: 'aprobada' | 'rechazada'
}

export interface OfficeInput {
  employees: { id: string; state: EmployeeState; role: string; provider: ProviderId; model?: string }[]
  /** Nombre de cada quien; sin nombre se usa el id. */
  names: Record<string, string>
  tasks: Task[]
  /** Lo que el tablero dice de quien está en espera (ver StudioSnapshot.hints). */
  hints: Record<string, { state: string } | undefined>
}

const brief = (text: string | undefined, fallback: string, max = 60): string => {
  const line = (text ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? fallback
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** Quién está y en qué anda. */
export function officeState(input: OfficeInput): OfficeState {
  const people: OfficePerson[] = []
  const activities: Record<string, OfficeActivity> = {}
  for (const e of input.employees) {
    if (e.state === 'exited') continue
    const hint = input.hints[e.id]?.state
    let status: OfficeStatus = 'idle'
    // Descansando (se está reiniciando) cuenta como libre, haga lo que haga su terminal.
    if (hint !== 'gaming') {
      if (e.state === 'working') status = 'working'
      else if (e.state === 'blocked') status = 'blocked'
      else if (hint === 'delivering') status = 'done' // entregó y espera el veredicto
    }
    people.push({ id: e.id, name: input.names[e.id] ?? e.id, role: e.role, provider: e.provider, model: e.model, isBoss: e.id === BOSS, status })
    if (status === 'working') {
      const task = input.tasks.find((t) => t.assignee === e.id && t.status === 'in_progress')
      if (task) activities[e.id] = { emoji: task.kind === 'qa' ? '🧪' : '⌨️', text: brief(task.title, task.id, 28), task: task.id }
    }
  }
  return { people, activities }
}

/**
 * Qué pasó entre dos fotos del tablero. Sin foto anterior no pasó nada: al
 * abrir un proyecto no se repite la historia.
 */
export function officeEvents(prev: Task[] | null, next: Task[], at: number): OfficeEvent[] {
  if (!prev) return []
  const before = new Map(prev.map((t) => [t.id, t]))
  const events: OfficeEvent[] = []
  for (const t of next) {
    const was = before.get(t.id)
    const started = (s: string | undefined) => s === 'ready' || s === 'in_progress'
    // Regresó al escritorio: gana sobre lo demás, aunque el estado vuelva a "lista".
    if (was && t.returns > was.returns) {
      events.push({ at, agent: t.assignee, type: 'revision', verdict: 'rechazada', emoji: '😠', text: brief(t.history.at(-1)?.text, 'Regresa al escritorio') })
      continue
    }
    if (started(t.status) && (!was || was.status === 'waiting' || was.assignee !== t.assignee)) {
      events.push({ at, agent: t.assignee, type: 'asignada', text: brief(`${t.id} ${t.title}`, t.id) })
    } else if (was && t.status === 'delivered' && was.status !== 'delivered') {
      events.push({ at, agent: t.assignee, type: 'reporte', emoji: '📄', text: brief(t.delivery?.report, 'Entrega lista') })
    } else if (was && t.kind === 'qa' && t.status === 'done' && was.status !== 'done') {
      events.push({ at, agent: t.assignee, type: 'reporte', emoji: '🧪', text: brief(t.delivery?.report, 'Revisión terminada') })
    } else if (was && ['approved', 'merged'].includes(t.status) && ['delivered', 'in_qa'].includes(was.status)) {
      events.push({ at, agent: t.assignee, type: 'revision', verdict: 'aprobada', emoji: '👍', text: t.status === 'merged' ? 'Integrada' : 'Aprobada' })
    }
  }
  return events
}
