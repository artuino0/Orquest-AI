/**
 * Tablero del proyecto: plantilla, tareas, dependencias y entregas. Lógica
 * pura y sin IO: decide qué está permitido y a qué estado pasa cada cosa.
 * Quien orquesta (studio.ts) aplica los efectos: lanzar CLIs, avisar, git.
 *
 * Ciclo de una tarea:
 *
 *   waiting ──(dependencias integradas)──▶ ready ──leer_tarea──▶ in_progress
 *      in_progress ──entregar──▶ delivered ──jefe aprueba──▶ approved ──usuario integra──▶ merged
 *      delivered ──jefe la manda a QA──▶ in_qa ──QA pasa──▶ delivered (con QA ok)
 *      delivered / in_qa / approved ──regresa──▶ in_progress (mismo empleado, con el reporte)
 *
 * Las tareas de QA terminan en done: no tienen código que integrar.
 */
import { T } from './i18n.js'
import type { Check } from './library.js'
import { nameKey, pickName } from './names.js'
import type { Effort, ProviderId } from './providers.js'

/** Regla de expedientes: ¿puede este proveedor/modelo ocupar este puesto? */
export type SlotRule = (s: { provider: ProviderId; model?: string; role: string }) => Check

export type TaskStatus = 'waiting' | 'ready' | 'in_progress' | 'delivered' | 'in_qa' | 'approved' | 'merged' | 'done'
export type TaskKind = 'work' | 'qa'

export interface Delivery {
  at: number
  report: string
  screenshots: string[]
  /** Resumen de cambios (git diff --stat) contra la base. */
  diffStat?: string
  commit?: string
  /** Solo QA: si la tarea revisada pasa o no. */
  verdict?: 'pass' | 'fail'
}

export interface TaskEvent {
  at: number
  text: string
}

export interface Task {
  id: string
  kind: TaskKind
  title: string
  description: string
  assignee: string
  /**
   * Repositorio al que pertenece, por el nombre de su carpeta, cuando el
   * proyecto agrupa varios; sin él, el proyecto es un solo repositorio.
   */
  repo?: string
  deps: string[]
  status: TaskStatus
  /** QA: tarea que revisa. */
  reviewOf?: string
  delivery?: Delivery
  /** Último reporte de QA sobre esta tarea. */
  qa?: Delivery
  /** Veces que regresó al escritorio. */
  returns: number
  history: TaskEvent[]
}

export type SlotStatus = 'proposed' | 'approved' | 'hired'

export interface Slot {
  id: string
  /** Nombre del empleado que ocupará el puesto. */
  name: string
  role: string
  provider: ProviderId
  model?: string
  effort?: Effort
  /** Con qué cuenta del proveedor trabaja (carpeta de su sesión, ver core/accounts); sin ella, la principal. */
  account?: string
  /** Por qué el jefe propone a este proveedor. */
  reason?: string
  /** Aviso del expediente (permitido, pero con reservas). */
  warning?: string
  status: SlotStatus
  employeeId?: string
}

export interface StaffMember {
  id: string
  name: string
  role: string
  provider: ProviderId
  model?: string
  slotId?: string
  /** false si su CLI ya no corre (se fue o se cerró la app). */
  online: boolean
  effort?: Effort
  account?: string
  /** Su conversación en la CLI y su oficina: con eso vuelve a su escritorio al reabrir la app. */
  sessionId?: string
  office?: { path: string; branch: string; base?: string }
  /** true si lo despidieron: ese ya no vuelve. */
  gone?: boolean
  /** % de contexto que llevaba usado al irse, si se sabía. */
  leftContext?: number
}

export interface Message {
  at: number
  from: string
  to: string
  text: string
}

/**
 * Algo que el jefe necesita que el usuario decida o le diga. Queda pendiente
 * hasta que el usuario conteste (o el jefe la cierre): así no se pierde de
 * vista que el trabajo depende de él.
 */
export interface Question {
  /** P1, P2… */
  id: string
  text: string
  /** Respuestas que sugiere el jefe; el usuario puede escribir otra. */
  options: string[]
  /** La que el jefe elegiría; es una de `options`. */
  recommended?: string
  /** Qué se detiene mientras no se conteste. */
  blocks?: string
  /** Tareas que esperan esta respuesta. */
  tasks: string[]
  askedAt: number
  status: 'open' | 'answered' | 'withdrawn'
  answer?: string
  /** Por qué se retiró sin respuesta. */
  note?: string
  closedAt?: number
}

/** Lo que el jefe manda al preguntar. */
export interface QuestionDraft {
  text: string
  options?: string[]
  recommended?: string
  blocks?: string
  tasks?: string[]
}

/** Con quién y cómo se contrató al jefe, para retomarlo al reabrir. */
export interface BossRecord {
  /** Cómo le puso el usuario; sin nombre es "Jefe". */
  name?: string
  provider: ProviderId
  model?: string
  effort?: Effort
  account?: string
  sessionId?: string
}

export interface BoardSnapshot {
  goal: string
  boss?: BossRecord
  slots: Slot[]
  staff: StaffMember[]
  tasks: Task[]
  messages: Message[]
  /** Lo que el jefe le preguntó al usuario, pendiente o ya cerrado. */
  questions: Question[]
  seq: { task: number; slot: number; question?: number }
}

/** Lo que se dice de un proyecto en la lista de recientes, sin abrirlo. */
export interface ProjectSummary {
  /** Empleados contratados (sin contar al jefe). */
  staff: number
  /** Entregas que esperan la aprobación del usuario. */
  pending: number
  /** Ya tuvo jefe: tiene objetivo. */
  started: boolean
}

export function summarize(b: BoardSnapshot): ProjectSummary {
  return { staff: b.staff.length, pending: b.tasks.filter((t) => t.status === 'approved').length, started: !!b.goal }
}

/** Una regla rota. El motivo llega tal cual a quien llamó la herramienta. */
export class RuleError extends Error {}

/** Cuántas preguntas puede tener el usuario esperándolo, y cuántas sugerencias cada una. */
export const MAX_OPEN_QUESTIONS = 12
export const MAX_OPTIONS = 5

const OPEN: TaskStatus[] = ['waiting', 'ready', 'in_progress', 'delivered', 'in_qa', 'approved']

export class Board {
  goal = ''
  /** Con quién se contrató al jefe; undefined si nunca hubo o lo despidieron. */
  boss?: BossRecord
  slots: Slot[] = []
  staff: StaffMember[] = []
  tasks: Task[] = []
  messages: Message[] = []
  questions: Question[] = []
  private seq: { task: number; slot: number; question?: number } = { task: 0, slot: 0, question: 0 }

  constructor(private now: () => number = Date.now) {}

  // ── Plantilla ────────────────────────────────────────────────────────────

  /**
   * El jefe propone; reemplaza lo propuesto que el usuario aún no aprueba.
   * Lo ya aprobado o contratado se queda.
   */
  propose(slots: Omit<Slot, 'id' | 'status' | 'name'>[], available: (p: ProviderId) => boolean, rule?: SlotRule): Slot[] {
    if (!slots.length) throw new RuleError(T`La propuesta no tiene puestos.`)
    for (const s of slots) {
      if (!available(s.provider)) {
        throw new RuleError(T`${s.provider} no está instalado o no tiene sesión; no se puede proponer para ${s.role}.`)
      }
    }
    const warnings = this.checkAll(slots, rule)
    this.slots = this.slots.filter((s) => s.status !== 'proposed')
    const taken = this.takenNames()
    const added = slots.map((s, i) => {
      const name = pickName(taken)
      taken.push(name)
      return { ...s, name, warning: warnings[i], id: `S${++this.seq.slot}`, status: 'proposed' as const }
    })
    this.slots.push(...added)
    return added
  }

  /**
   * El usuario aprueba la plantilla, con sus cambios: puede editar proveedor,
   * modelo y esfuerzo, quitar puestos y añadir los suyos.
   */
  approve(final: (Partial<Slot> & Pick<Slot, 'role' | 'provider'>)[], rule?: SlotRule): Slot[] {
    const warnings = this.checkAll(final, rule)
    const proposed = new Map(this.slots.filter((s) => s.status === 'proposed').map((s) => [s.id, s]))
    // Nombres: los que puso el usuario, o los propuestos, o uno libre. Sin repetir.
    const taken = this.takenNames(false)
    const names = final.map((f) => f.name?.trim() || (f.id ? proposed.get(f.id)?.name : undefined) || '')
    for (const n of names) {
      if (n && taken.some((t) => nameKey(t) === nameKey(n))) throw new RuleError(T`Ya hay alguien llamado ${n} en el proyecto.`)
      if (n) taken.push(n)
    }
    this.slots = this.slots.filter((s) => s.status !== 'proposed')
    const approved = final.map((f, i) => {
      const base = f.id ? proposed.get(f.id) : undefined
      let name = names[i]
      if (!name) {
        name = pickName(taken)
        taken.push(name)
      }
      return {
        id: base?.id ?? `S${++this.seq.slot}`,
        name,
        role: f.role,
        provider: f.provider,
        model: f.model || undefined,
        effort: f.effort,
        account: f.account || undefined,
        reason: base?.reason,
        warning: warnings[final.indexOf(f)],
        status: 'approved' as const,
      }
    })
    this.slots.push(...approved)
    return approved
  }

  /** Nombres ocupados: plantilla y quienes ya pasaron por el proyecto. */
  private takenNames(includeProposed = true): string[] {
    return [...this.slots.filter((s) => includeProposed || s.status !== 'proposed').map((s) => s.name), ...this.staff.map((m) => m.name)]
  }

  /** Aplica la regla a todos; si alguno está prohibido, nada cambia. */
  private checkAll(slots: { provider: ProviderId; model?: string; role: string }[], rule?: SlotRule): (string | undefined)[] {
    if (!rule) return slots.map(() => undefined)
    const results = slots.map((s) => rule(s))
    const blocked = results.flatMap((r) => (r.ok ? [] : [r.reason]))
    if (blocked.length) throw new RuleError(blocked.join(' '))
    return results.map((r) => (r.ok ? r.warning : undefined))
  }

  /** Puesto aprobado y libre para levantar. */
  takeSlot(ref: string): Slot {
    const free = this.slots.filter((s) => s.status === 'approved')
    const slot =
      free.find((s) => s.id === ref) ??
      free.find((s) => nameKey(s.name) === nameKey(ref)) ??
      free.find((s) => s.role.toLowerCase() === ref.toLowerCase())
    if (!slot) {
      const pending = this.slots.some((s) => s.status === 'proposed')
      throw new RuleError(
        pending
          ? T`No hay un puesto aprobado para "${ref}". La plantilla espera la aprobación del usuario.`
          : T`No hay un puesto aprobado y libre para "${ref}". Propón la plantilla con proponer_plantilla.`,
      )
    }
    return slot
  }

  hired(slot: Slot, member: Omit<StaffMember, 'online' | 'slotId' | 'model' | 'name'>) {
    slot.status = 'hired'
    slot.employeeId = member.id
    this.staff.push({ ...member, name: slot.name, model: slot.model, slotId: slot.id, online: true })
  }

  /** Volvió a su escritorio al reabrir la app. */
  returned(employeeId: string, sessionId?: string) {
    const m = this.staff.find((s) => s.id === employeeId)
    if (!m) return
    m.online = true
    m.sessionId = sessionId ?? m.sessionId
  }

  /** Despedido: no vuelve aunque se reabra la app. */
  /** El usuario le cambió modelo y esfuerzo a alguien: queda en su puesto y en su registro (el proveedor no cambia). */
  retune(employeeId: string, model: string | undefined, effort: Effort | undefined) {
    const m = this.staff.find((s) => s.id === employeeId)
    const slot = this.slots.find((s) => s.employeeId === employeeId)
    if (!m || !slot) throw new RuleError(T`No existe el empleado ${employeeId}.`)
    Object.assign(m, { model, effort })
    Object.assign(slot, { model, effort })
  }

  dismiss(employeeId: string, context?: number) {
    const m = this.staff.find((s) => s.id === employeeId)
    if (m) Object.assign(m, { online: false, gone: true, leftContext: context })
  }

  offline(employeeId: string) {
    const m = this.staff.find((s) => s.id === employeeId)
    if (m) m.online = false
  }

  /** Por id o por nombre; si hay dos con el mismo nombre, gana quien sigue en la oficina. */
  member(ref: string): StaffMember {
    const byName = this.staff.filter((s) => nameKey(s.name) === nameKey(ref))
    const m = this.staff.find((s) => s.id === ref) ?? byName.find((s) => s.online) ?? byName[0]
    if (!m) throw new RuleError(T`No existe el empleado ${ref}. Usa leer_proyecto para ver la plantilla.`)
    return m
  }

  /** Quien ocupó antes este puesto y ya no está: su bitácora capacita al nuevo. */
  predecessors(role: string, exceptId?: string): StaffMember[] {
    return this.staff.filter((s) => s.role === role && !s.online && s.id !== exceptId)
  }

  // ── Tareas ───────────────────────────────────────────────────────────────

  task(id: string): Task {
    const t = this.tasks.find((x) => x.id === id)
    if (!t) throw new RuleError(T`No existe la tarea ${id}.`)
    return t
  }

  /**
   * Crea una tarea. Con dependencias abiertas no arranca. `repo`: a qué
   * repositorio pertenece si el proyecto agrupa varios; que exista lo revisa
   * quien orquesta, el tablero no conoce el disco.
   */
  assign(input: { assignee: string; title: string; description: string; deps?: string[]; repo?: string }): Task {
    const m = this.member(input.assignee)
    if (!m.online) throw new RuleError(T`${m.id} ya no está en la oficina.`)
    const deps = [...new Set(input.deps ?? [])]
    for (const d of deps) this.task(d)
    const t: Task = {
      id: `T${++this.seq.task}`,
      kind: 'work',
      title: input.title,
      description: input.description,
      assignee: m.id,
      ...(input.repo ? { repo: input.repo } : {}),
      deps,
      status: 'waiting',
      returns: 0,
      history: [],
    }
    this.tasks.push(t)
    this.log(t, T`asignada a ${m.id}`)
    this.refresh(t)
    return t
  }

  /** Cambia dependencias de una tarea; rechaza ciclos. */
  setDeps(taskId: string, deps: string[]): Task {
    const t = this.task(taskId)
    if (!['waiting', 'ready'].includes(t.status)) {
      throw new RuleError(T`${t.id} ya empezó; no se le pueden cambiar dependencias.`)
    }
    for (const d of deps) this.task(d)
    const cycle = this.findCycle(t.id, deps)
    if (cycle) throw new RuleError(T`Dependencia circular: ${cycle.join(' → ')}.`)
    t.deps = [...new Set(deps)]
    t.status = 'waiting'
    this.refresh(t)
    return t
  }

  /** Pasa una tarea que aún no empieza a otro repositorio del proyecto. */
  setRepo(taskId: string, repo: string): Task {
    const t = this.task(taskId)
    if (t.repo === repo) return t
    if (!['waiting', 'ready'].includes(t.status)) {
      throw new RuleError(T`${t.id} ya empezó en ${t.repo ?? T`su repositorio`}; no se le puede cambiar de repositorio. Crea otra tarea para ${repo}.`)
    }
    t.repo = repo
    this.log(t, T`pasa al repositorio ${repo}`)
    return t
  }

  private findCycle(start: string, deps: string[]): string[] | undefined {
    const graph = new Map(this.tasks.map((t) => [t.id, t.id === start ? deps : t.deps]))
    const walk = (id: string, path: string[]): string[] | undefined => {
      if (id === start && path.length) return [...path, id]
      if (path.includes(id)) return undefined
      for (const d of graph.get(id) ?? []) {
        const found = walk(d, [...path, id])
        if (found) return found
      }
      return undefined
    }
    return walk(start, [])
  }

  /** Pasa una tarea sin empezar, o regresada, a otro empleado (p. ej. si el suyo se fue). */
  reassign(taskId: string, assignee: string): Task {
    const t = this.task(taskId)
    if (!['waiting', 'ready', 'in_progress'].includes(t.status)) {
      throw new RuleError(T`${t.id} está ${t.status}; solo se reasigna una tarea abierta en un escritorio.`)
    }
    const m = this.member(assignee)
    if (!m.online) throw new RuleError(T`${m.id} ya no está en la oficina.`)
    t.assignee = m.id
    if (t.status === 'in_progress') t.status = 'ready'
    this.log(t, T`reasignada a ${m.id}`)
    return t
  }

  /** Dependencias que aún no se integran. */
  openDeps(t: Task): Task[] {
    return t.deps.map((d) => this.task(d)).filter((d) => d.status !== 'merged' && d.status !== 'done')
  }

  private refresh(t: Task): boolean {
    if (t.status === 'waiting' && !this.openDeps(t).length) {
      t.status = 'ready'
      this.log(t, T`lista para empezar`)
      return true
    }
    return false
  }

  /** Tarea en la que trabaja o la siguiente que le toca. */
  current(employeeId: string): Task | undefined {
    const mine = this.tasks.filter((t) => t.assignee === employeeId)
    return mine.find((t) => t.status === 'in_progress') ?? mine.find((t) => t.status === 'ready')
  }

  /** El empleado lee su tarea: si estaba lista, arranca. */
  start(employeeId: string): Task | undefined {
    const t = this.current(employeeId)
    if (t?.status === 'ready') {
      t.status = 'in_progress'
      this.log(t, T`en curso`)
    }
    return t
  }

  deliver(employeeId: string, d: Omit<Delivery, 'at'>): { task: Task; reviewed?: Task } {
    const t = this.current(employeeId)
    if (!t) {
      const waiting = this.tasks.find((x) => x.assignee === employeeId && x.status === 'waiting')
      throw new RuleError(
        waiting
          ? T`Tu tarea ${waiting.id} sigue esperando a ${this.openDeps(waiting).map((x) => x.id).join(', ')}; aún no puedes entregar.`
          : T`No tienes una tarea en curso que entregar.`,
      )
    }
    const delivery = { ...d, at: this.now() }
    if (t.kind === 'qa') {
      if (!d.verdict) throw new RuleError(T`Una entrega de QA debe decir si la tarea pasa o no (veredicto).`)
      t.delivery = delivery
      t.status = 'done'
      this.log(t, d.verdict === 'pass' ? T`QA terminado: pasa` : T`QA terminado: no pasa`)
      const reviewed = this.task(t.reviewOf!)
      reviewed.qa = delivery
      if (d.verdict === 'pass') {
        reviewed.status = 'delivered'
        this.log(reviewed, T`QA la aprobó; vuelve con el jefe`)
      } else {
        this.sendBack(reviewed, T`QA la rechazó: ${d.report}`)
      }
      return { task: t, reviewed }
    }
    t.delivery = delivery
    t.qa = undefined
    t.status = 'delivered'
    this.log(t, T`entregada`)
    return { task: t }
  }

  /** Decisión del jefe sobre una entrega. */
  review(taskId: string, decision: 'approve' | 'return', notes = ''): Task {
    const t = this.task(taskId)
    if (t.kind === 'qa') throw new RuleError(T`${t.id} es una revisión de QA; revisa la tarea ${t.reviewOf}.`)
    if (t.status !== 'delivered') throw new RuleError(T`${t.id} no está entregada (estado: ${t.status}).`)
    if (decision === 'approve') {
      t.status = 'approved'
      this.log(t, notes ? T`el jefe la aprobó: ${notes}; espera tu aprobación para integrar` : T`el jefe la aprobó; espera tu aprobación para integrar`)
    } else {
      this.sendBack(t, T`el jefe la regresó: ${notes}`)
    }
    return t
  }

  /** Crea la revisión de QA de una entrega. */
  toQa(taskId: string, qaEmployee: string, instructions: string): Task {
    const t = this.task(taskId)
    if (t.status !== 'delivered') throw new RuleError(T`${t.id} no está entregada (estado: ${t.status}).`)
    const qa = this.member(qaEmployee)
    if (qa.role.toLowerCase() !== 'qa') throw new RuleError(T`${qa.id} es de ${qa.role}, no de QA.`)
    if (qa.id === t.assignee) throw new RuleError(T`Nadie revisa su propio trabajo.`)
    if (!qa.online) throw new RuleError(`${qa.id} ya no está en la oficina.`)
    const review: Task = {
      id: `T${++this.seq.task}`,
      kind: 'qa',
      title: T`QA de ${t.id}: ${t.title}`,
      description: instructions,
      assignee: qa.id,
      // Revisa en el mismo repositorio que la tarea.
      ...(t.repo ? { repo: t.repo } : {}),
      deps: [],
      status: 'ready',
      reviewOf: t.id,
      returns: 0,
      history: [],
    }
    this.tasks.push(review)
    t.status = 'in_qa'
    this.log(t, T`enviada a QA (${review.id})`)
    this.log(review, `asignada a ${qa.id}`)
    return review
  }

  /** El usuario decide sobre lo que el jefe aprobó. */
  merged(taskId: string): Task[] {
    const t = this.task(taskId)
    if (t.status !== 'approved') throw new RuleError(T`${t.id} no está aprobada por el jefe.`)
    t.status = 'merged'
    this.log(t, T`integrada`)
    // Libera a quien esperaba.
    return this.tasks.filter((x) => x.deps.includes(t.id) && this.refresh(x))
  }

  /**
   * Aprobada sin nada que integrar (una prueba, una revisión que no tocó
   * código): se cierra sin pasar por la bandeja del usuario. Libera a quien
   * esperaba, igual que una integración.
   */
  closeEmpty(taskId: string): Task[] {
    const t = this.task(taskId)
    if (t.status !== 'approved') throw new RuleError(T`${t.id} no está aprobada por el jefe.`)
    t.status = 'done'
    this.log(t, T`cerrada: no traía cambios que integrar`)
    return this.tasks.filter((x) => x.deps.includes(t.id) && this.refresh(x))
  }

  userReturn(taskId: string, notes: string): Task {
    const t = this.task(taskId)
    if (!['approved', 'delivered'].includes(t.status)) throw new RuleError(T`${t.id} no está esperando tu revisión.`)
    this.sendBack(t, T`el usuario la regresó: ${notes}`)
    return t
  }

  private sendBack(t: Task, why: string) {
    t.status = 'in_progress'
    t.returns++
    this.log(t, why)
  }

  /** Entregas que esperan al usuario. */
  inbox(): Task[] {
    return this.tasks.filter((t) => t.status === 'approved')
  }

  /**
   * Qué se ve del empleado según el tablero, por encima de lo que dice su
   * terminal: esperando a otro, o llevando su entrega.
   */
  hint(employeeId: string): { state: 'waiting'; blockedBy: string } | { state: 'delivering' } | undefined {
    if (this.current(employeeId)) return undefined
    const mine = this.tasks.filter((t) => t.assignee === employeeId && OPEN.includes(t.status))
    const waiting = mine.find((t) => t.status === 'waiting')
    if (waiting) return { state: 'waiting', blockedBy: this.openDeps(waiting)[0].assignee }
    if (mine.some((t) => ['delivered', 'in_qa', 'approved'].includes(t.status))) return { state: 'delivering' }
    return undefined
  }

  // ── Preguntas al usuario ─────────────────────────────────────────────────

  /** Las que el usuario aún no contesta, de la más vieja a la más nueva. */
  openQuestions(): Question[] {
    return this.questions.filter((q) => q.status === 'open')
  }

  question(id: string): Question {
    const key = String(id).trim().toUpperCase()
    const q = this.questions.find((x) => x.id === key)
    if (!q) throw new RuleError(T`No existe la pregunta ${id}. Pendientes: ${this.openQuestions().map((x) => x.id).join(', ') || T`ninguna`}.`)
    return q
  }

  /**
   * El jefe pregunta. Cada pregunta debe entenderse sola; las sugerencias son
   * opcionales pero, si las hay, la recomendada tiene que ser una de ellas.
   * Una que ya está pendiente con las mismas palabras no se duplica: se devuelve la que había.
   */
  ask(drafts: QuestionDraft[]): { asked: Question[]; repeated: Question[] } {
    if (!drafts.length) throw new RuleError(T`No mandaste ninguna pregunta.`)
    const same = (a: string, b: string) => nameKey(a) === nameKey(b)
    const clean = drafts.map((d, i) => {
      const n = drafts.length > 1 ? ` ${i + 1}` : ''
      const text = String(d.text ?? '').replace(/\s+/g, ' ').trim()
      if (text.length < 8) throw new RuleError(T`La pregunta${n} va vacía o no se entiende sola. Escríbela completa, como la leería el usuario sin ver tu terminal.`)
      const options = [...new Set((d.options ?? []).map((o) => String(o).replace(/\s+/g, ' ').trim()).filter(Boolean))]
      if (options.length === 1) throw new RuleError(T`La pregunta${n} trae una sola respuesta sugerida. Da al menos dos, o ninguna si es de respuesta libre.`)
      if (options.length > MAX_OPTIONS) throw new RuleError(T`La pregunta${n} trae ${options.length} respuestas sugeridas; el tope es ${MAX_OPTIONS}. Deja las que de verdad son opción.`)
      const rec = String(d.recommended ?? '').replace(/\s+/g, ' ').trim()
      const recommended = rec ? options.find((o) => same(o, rec)) : undefined
      if (rec && !recommended) throw new RuleError(T`La recomendada de la pregunta${n} ("${rec}") no está entre sus respuestas sugeridas (${options.join(' / ') || T`no diste ninguna`}).`)
      const tasks = [...new Set((d.tasks ?? []).map((t) => this.task(String(t)).id))]
      return { text, options, recommended, blocks: String(d.blocks ?? '').replace(/\s+/g, ' ').trim() || undefined, tasks }
    })
    const repeated: Question[] = []
    const fresh = clean.filter((c, i) => {
      const old = this.openQuestions().find((q) => same(q.text, c.text))
      if (old) repeated.push(old)
      // Dos veces la misma en el mismo envío también cuenta como repetida.
      return !old && clean.findIndex((x) => same(x.text, c.text)) === i
    })
    const open = this.openQuestions().length
    if (open + fresh.length > MAX_OPEN_QUESTIONS) {
      throw new RuleError(T`Ya hay ${open} preguntas esperando al usuario y el tope es ${MAX_OPEN_QUESTIONS}. Cierra las que ya no hagan falta (cerrar_pregunta) o junta las que son la misma decisión.`)
    }
    const asked = fresh.map((c): Question => ({ ...c, id: `P${(this.seq.question = (this.seq.question ?? 0) + 1)}`, askedAt: this.now(), status: 'open' }))
    this.questions.push(...asked)
    // Las cerradas se conservan como historial, con tope.
    const closed = this.questions.filter((q) => q.status !== 'open')
    if (closed.length > 60) {
      const drop = new Set(closed.slice(0, closed.length - 60).map((q) => q.id))
      this.questions = this.questions.filter((q) => !drop.has(q.id))
    }
    return { asked, repeated }
  }

  /** El usuario contesta (o el jefe registra lo que el usuario le contestó por chat). */
  answer(id: string, text: string): Question {
    const q = this.question(id)
    if (q.status !== 'open') throw new RuleError(q.status === 'answered' ? T`${q.id} ya estaba contestada: "${q.answer}".` : T`${q.id} ya estaba retirada.`)
    const answer = String(text ?? '').replace(/\s+/g, ' ').trim()
    if (!answer) throw new RuleError(T`La respuesta va vacía.`)
    Object.assign(q, { status: 'answered', answer, closedAt: this.now() })
    return q
  }

  /** El jefe la retira: ya no hace falta que el usuario la conteste. */
  withdraw(id: string, note: string): Question {
    const q = this.question(id)
    if (q.status !== 'open') throw new RuleError(q.status === 'answered' ? T`${q.id} ya estaba contestada: "${q.answer}".` : T`${q.id} ya estaba retirada.`)
    const why = String(note ?? '').replace(/\s+/g, ' ').trim()
    if (!why) throw new RuleError(T`Di por qué ya no hace falta: el usuario la tenía pendiente y lo va a ver.`)
    Object.assign(q, { status: 'withdrawn', note: why, closedAt: this.now() })
    return q
  }

  // ── Mensajes y persistencia ──────────────────────────────────────────────

  say(from: string, to: string, text: string) {
    this.messages.push({ at: this.now(), from, to, text })
    if (this.messages.length > 500) this.messages.splice(0, this.messages.length - 500)
  }

  private log(t: Task, text: string) {
    t.history.push({ at: this.now(), text })
  }

  snapshot(): BoardSnapshot {
    return structuredClone({
      goal: this.goal,
      boss: this.boss,
      slots: this.slots,
      staff: this.staff,
      tasks: this.tasks,
      messages: this.messages,
      questions: this.questions,
      seq: this.seq,
    })
  }

  static restore(s: BoardSnapshot, now?: () => number): Board {
    const b = new Board(now)
    const c = structuredClone(s)
    b.goal = c.goal
    b.boss = c.boss
    b.slots = c.slots
    // Al reabrir, nadie sigue en su escritorio: las CLIs se cerraron.
    b.staff = c.staff.map((m) => ({ ...m, name: m.name ?? m.id, online: false }))
    b.slots = b.slots.map((x) => ({ ...x, name: x.name ?? x.id }))
    b.tasks = c.tasks
    b.messages = c.messages
    // Los tableros guardados antes de que hubiera preguntas no las traen.
    b.questions = c.questions ?? []
    b.seq = { question: 0, ...c.seq }
    return b
  }
}
