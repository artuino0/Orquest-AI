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
import type { Check } from './library.js'
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
  role: string
  provider: ProviderId
  model?: string
  effort?: Effort
  /** Por qué el jefe propone a este proveedor. */
  reason?: string
  /** Aviso del expediente (permitido, pero con reservas). */
  warning?: string
  status: SlotStatus
  employeeId?: string
}

export interface StaffMember {
  id: string
  role: string
  provider: ProviderId
  model?: string
  slotId?: string
  /** false si su CLI ya no corre (se fue o se cerró la app). */
  online: boolean
}

export interface Message {
  at: number
  from: string
  to: string
  text: string
}

export interface BoardSnapshot {
  goal: string
  slots: Slot[]
  staff: StaffMember[]
  tasks: Task[]
  messages: Message[]
  seq: { task: number; slot: number }
}

/** Una regla rota. El motivo llega tal cual a quien llamó la herramienta. */
export class RuleError extends Error {}

const OPEN: TaskStatus[] = ['waiting', 'ready', 'in_progress', 'delivered', 'in_qa', 'approved']

export class Board {
  goal = ''
  slots: Slot[] = []
  staff: StaffMember[] = []
  tasks: Task[] = []
  messages: Message[] = []
  private seq = { task: 0, slot: 0 }

  constructor(private now: () => number = Date.now) {}

  // ── Plantilla ────────────────────────────────────────────────────────────

  /**
   * El jefe propone; reemplaza lo propuesto que el usuario aún no aprueba.
   * Lo ya aprobado o contratado se queda.
   */
  propose(slots: Omit<Slot, 'id' | 'status'>[], available: (p: ProviderId) => boolean, rule?: SlotRule): Slot[] {
    if (!slots.length) throw new RuleError('La propuesta no tiene puestos.')
    for (const s of slots) {
      if (!available(s.provider)) {
        throw new RuleError(`${s.provider} no está instalado o no tiene sesión; no se puede proponer para ${s.role}.`)
      }
    }
    const warnings = this.checkAll(slots, rule)
    this.slots = this.slots.filter((s) => s.status !== 'proposed')
    const added = slots.map((s, i) => ({ ...s, warning: warnings[i], id: `S${++this.seq.slot}`, status: 'proposed' as const }))
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
    this.slots = this.slots.filter((s) => s.status !== 'proposed')
    const approved = final.map((f) => {
      const base = f.id ? proposed.get(f.id) : undefined
      return {
        id: base?.id ?? `S${++this.seq.slot}`,
        role: f.role,
        provider: f.provider,
        model: f.model || undefined,
        effort: f.effort,
        reason: base?.reason,
        warning: warnings[final.indexOf(f)],
        status: 'approved' as const,
      }
    })
    this.slots.push(...approved)
    return approved
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
    const slot = free.find((s) => s.id === ref) ?? free.find((s) => s.role.toLowerCase() === ref.toLowerCase())
    if (!slot) {
      const pending = this.slots.some((s) => s.status === 'proposed')
      throw new RuleError(
        pending
          ? `No hay un puesto aprobado para "${ref}". La plantilla espera la aprobación del usuario.`
          : `No hay un puesto aprobado y libre para "${ref}". Propón la plantilla con proponer_plantilla.`,
      )
    }
    return slot
  }

  hired(slot: Slot, member: Omit<StaffMember, 'online' | 'slotId' | 'model'>) {
    slot.status = 'hired'
    slot.employeeId = member.id
    this.staff.push({ ...member, model: slot.model, slotId: slot.id, online: true })
  }

  offline(employeeId: string) {
    const m = this.staff.find((s) => s.id === employeeId)
    if (m) m.online = false
  }

  member(id: string): StaffMember {
    const m = this.staff.find((s) => s.id === id)
    if (!m) throw new RuleError(`No existe el empleado ${id}. Usa leer_proyecto para ver la plantilla.`)
    return m
  }

  // ── Tareas ───────────────────────────────────────────────────────────────

  task(id: string): Task {
    const t = this.tasks.find((x) => x.id === id)
    if (!t) throw new RuleError(`No existe la tarea ${id}.`)
    return t
  }

  /** Crea una tarea. Con dependencias abiertas no arranca. */
  assign(input: { assignee: string; title: string; description: string; deps?: string[] }): Task {
    const m = this.member(input.assignee)
    if (!m.online) throw new RuleError(`${m.id} ya no está en la oficina.`)
    const deps = [...new Set(input.deps ?? [])]
    for (const d of deps) this.task(d)
    const t: Task = {
      id: `T${++this.seq.task}`,
      kind: 'work',
      title: input.title,
      description: input.description,
      assignee: m.id,
      deps,
      status: 'waiting',
      returns: 0,
      history: [],
    }
    this.tasks.push(t)
    this.log(t, `asignada a ${m.id}`)
    this.refresh(t)
    return t
  }

  /** Cambia dependencias de una tarea; rechaza ciclos. */
  setDeps(taskId: string, deps: string[]): Task {
    const t = this.task(taskId)
    if (!['waiting', 'ready'].includes(t.status)) {
      throw new RuleError(`${t.id} ya empezó; no se le pueden cambiar dependencias.`)
    }
    for (const d of deps) this.task(d)
    const cycle = this.findCycle(t.id, deps)
    if (cycle) throw new RuleError(`Dependencia circular: ${cycle.join(' → ')}.`)
    t.deps = [...new Set(deps)]
    t.status = 'waiting'
    this.refresh(t)
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
      throw new RuleError(`${t.id} está ${t.status}; solo se reasigna una tarea abierta en un escritorio.`)
    }
    const m = this.member(assignee)
    if (!m.online) throw new RuleError(`${m.id} ya no está en la oficina.`)
    t.assignee = m.id
    if (t.status === 'in_progress') t.status = 'ready'
    this.log(t, `reasignada a ${m.id}`)
    return t
  }

  /** Dependencias que aún no se integran. */
  openDeps(t: Task): Task[] {
    return t.deps.map((d) => this.task(d)).filter((d) => d.status !== 'merged' && d.status !== 'done')
  }

  private refresh(t: Task): boolean {
    if (t.status === 'waiting' && !this.openDeps(t).length) {
      t.status = 'ready'
      this.log(t, 'lista para empezar')
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
      this.log(t, 'en curso')
    }
    return t
  }

  deliver(employeeId: string, d: Omit<Delivery, 'at'>): { task: Task; reviewed?: Task } {
    const t = this.current(employeeId)
    if (!t) {
      const waiting = this.tasks.find((x) => x.assignee === employeeId && x.status === 'waiting')
      throw new RuleError(
        waiting
          ? `Tu tarea ${waiting.id} sigue esperando a ${this.openDeps(waiting).map((x) => x.id).join(', ')}; aún no puedes entregar.`
          : 'No tienes una tarea en curso que entregar.',
      )
    }
    const delivery = { ...d, at: this.now() }
    if (t.kind === 'qa') {
      if (!d.verdict) throw new RuleError('Una entrega de QA debe decir si la tarea pasa o no (veredicto).')
      t.delivery = delivery
      t.status = 'done'
      this.log(t, `QA terminado: ${d.verdict === 'pass' ? 'pasa' : 'no pasa'}`)
      const reviewed = this.task(t.reviewOf!)
      reviewed.qa = delivery
      if (d.verdict === 'pass') {
        reviewed.status = 'delivered'
        this.log(reviewed, 'QA la aprobó; vuelve con el jefe')
      } else {
        this.sendBack(reviewed, `QA la rechazó: ${d.report}`)
      }
      return { task: t, reviewed }
    }
    t.delivery = delivery
    t.qa = undefined
    t.status = 'delivered'
    this.log(t, 'entregada')
    return { task: t }
  }

  /** Decisión del jefe sobre una entrega. */
  review(taskId: string, decision: 'approve' | 'return', notes = ''): Task {
    const t = this.task(taskId)
    if (t.kind === 'qa') throw new RuleError(`${t.id} es una revisión de QA; revisa la tarea ${t.reviewOf}.`)
    if (t.status !== 'delivered') throw new RuleError(`${t.id} no está entregada (estado: ${t.status}).`)
    if (decision === 'approve') {
      t.status = 'approved'
      this.log(t, `el jefe la aprobó${notes ? `: ${notes}` : ''}; espera tu aprobación para integrar`)
    } else {
      this.sendBack(t, `el jefe la regresó: ${notes}`)
    }
    return t
  }

  /** Crea la revisión de QA de una entrega. */
  toQa(taskId: string, qaEmployee: string, instructions: string): Task {
    const t = this.task(taskId)
    if (t.status !== 'delivered') throw new RuleError(`${t.id} no está entregada (estado: ${t.status}).`)
    const qa = this.member(qaEmployee)
    if (qa.role.toLowerCase() !== 'qa') throw new RuleError(`${qa.id} es de ${qa.role}, no de QA.`)
    if (qa.id === t.assignee) throw new RuleError('Nadie revisa su propio trabajo.')
    if (!qa.online) throw new RuleError(`${qa.id} ya no está en la oficina.`)
    const review: Task = {
      id: `T${++this.seq.task}`,
      kind: 'qa',
      title: `QA de ${t.id}: ${t.title}`,
      description: instructions,
      assignee: qa.id,
      deps: [],
      status: 'ready',
      reviewOf: t.id,
      returns: 0,
      history: [],
    }
    this.tasks.push(review)
    t.status = 'in_qa'
    this.log(t, `enviada a QA (${review.id})`)
    this.log(review, `asignada a ${qa.id}`)
    return review
  }

  /** El usuario decide sobre lo que el jefe aprobó. */
  merged(taskId: string): Task[] {
    const t = this.task(taskId)
    if (t.status !== 'approved') throw new RuleError(`${t.id} no está aprobada por el jefe.`)
    t.status = 'merged'
    this.log(t, 'integrada')
    // Libera a quien esperaba.
    return this.tasks.filter((x) => x.deps.includes(t.id) && this.refresh(x))
  }

  userReturn(taskId: string, notes: string): Task {
    const t = this.task(taskId)
    if (!['approved', 'delivered'].includes(t.status)) throw new RuleError(`${t.id} no está esperando tu revisión.`)
    this.sendBack(t, `el usuario la regresó: ${notes}`)
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
      slots: this.slots,
      staff: this.staff,
      tasks: this.tasks,
      messages: this.messages,
      seq: this.seq,
    })
  }

  static restore(s: BoardSnapshot, now?: () => number): Board {
    const b = new Board(now)
    const c = structuredClone(s)
    b.goal = c.goal
    b.slots = c.slots
    // Al reabrir, nadie sigue en su escritorio: las CLIs se cerraron.
    b.staff = c.staff.map((m) => ({ ...m, online: false }))
    b.tasks = c.tasks
    b.messages = c.messages
    b.seq = c.seq
    return b
  }
}
