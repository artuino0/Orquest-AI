/**
 * Orquesta un proyecto: une el tablero (reglas), la plantilla viva (CLIs en
 * PTY), git y los avisos entre jefe, empleados y usuario. Las herramientas MCP
 * y las acciones de la UI entran por aquí; ninguna toca el tablero directo.
 */
import { EventEmitter } from 'node:events'
import { randomBytes } from 'node:crypto'
import { Board, RuleError, type BoardSnapshot, type Slot, type Task } from './board.js'
import type { CliStatus } from './detect.js'
import type { EmployeeManager } from './employees.js'
import { BOSS_PERMISSIONS, Library, type Outcome } from './library.js'
import { bossPrompt, employeePrompt, oneLine } from './prompts.js'
import { getProvider, takesSystemPrompt, type Effort, type ProviderId } from './providers.js'
import type { EmployeeState } from './state.js'
import type { StudioStore } from './store.js'
import { commitDelivery, currentBranch, deliveryDiff, mergeOffice, repoRoot, type Office } from './worktree.js'

export type Caller = { kind: 'boss' } | { kind: 'employee'; id: string }

export const BOSS_ID = 'jefe'

export interface StudioSnapshot extends BoardSnapshot {
  repo: string
  bossOnline: boolean
  /** Lo que el tablero dice de cada empleado: esperando a alguien o llevando su entrega. */
  hints: Record<string, NonNullable<ReturnType<Board['hint']>>>
}

export interface StudioOptions {
  repo: string
  manager: EmployeeManager
  detect: () => Promise<CliStatus[]>
  store?: StudioStore
  /** URL del servidor MCP para un token. */
  mcpUrl: (token: string) => string
  /** Cuánto espera hablar_con la respuesta del empleado. */
  replyTimeoutMs?: number
  /** Expedientes, manuales e historial del estudio; compartidos entre proyectos. */
  library?: Library
  /** Ejecutables por proveedor (pruebas). */
  binaries?: Partial<Record<ProviderId, string>>
}

export interface StudioEvents {
  changed: []
  /** Aviso para el usuario (p. ej. plantilla propuesta, conflicto al integrar). */
  notice: [text: string]
}

export class Studio extends EventEmitter<StudioEvents> {
  board: Board
  private tokens = new Map<string, Caller>()
  private queues = new Map<string, string[]>()
  private waiters = new Map<string, (answer: string) => void>()
  private offices = new Map<string, Office>()
  private unsubscribe: () => void
  root = ''
  readonly library: Library

  constructor(private opts: StudioOptions) {
    super()
    this.library = opts.library ?? new Library(opts.store)
    const saved = opts.store?.load(opts.repo)
    this.board = saved ? Board.restore(saved) : new Board()
    const onState = (id: string, state: EmployeeState) => {
      if (!this.isOurs(id)) return
      if (state === 'idle') this.flush(id)
      this.changed()
    }
    const onExit = (id: string) => {
      if (!this.isOurs(id)) return
      this.board.offline(id)
      this.changed()
    }
    opts.manager.on('state', onState)
    opts.manager.on('exit', onExit)
    this.unsubscribe = () => {
      opts.manager.off('state', onState)
      opts.manager.off('exit', onExit)
    }
  }

  async init() {
    this.root = await repoRoot(this.opts.repo)
    return this
  }

  /** Agentes de este proyecto, incluso antes de que termine su contratación. */
  private known = new Set<string>([BOSS_ID])

  private isOurs(id: string) {
    return this.known.has(id) || this.board.staff.some((s) => s.id === id)
  }

  private stopRetry(id: string) {
    clearInterval(this.retries.get(id))
    this.retries.delete(id)
  }

  private changed() {
    this.opts.store?.save(this.opts.repo, this.board.snapshot())
    this.emit('changed')
  }

  /** Quién llama, por el token de su URL MCP. */
  caller(token: string): Caller | undefined {
    return this.tokens.get(token)
  }

  private newToken(c: Caller): string {
    const t = randomBytes(18).toString('base64url')
    this.tokens.set(t, c)
    return t
  }

  // ── Avisos a las terminales ──────────────────────────────────────────────

  /**
   * Escribe un mensaje en la terminal de un agente como si lo tecleara el
   * usuario. Se encola hasta que la CLI está lista para recibirlo.
   */
  notify(id: string, text: string) {
    const msg = `[Orquest] ${oneLine(text)}`
    this.board.say('orquest', id, msg)
    ;(this.queues.get(id) ?? this.queues.set(id, []).get(id)!).push(msg)
    this.flush(id)
  }

  private retries = new Map<string, ReturnType<typeof setInterval>>()

  private flush(id: string) {
    const q = this.queues.get(id)
    if (!q?.length) return
    if (!this.opts.manager.atPrompt(id)) {
      // La TUI puede tardar en dibujar su prompt: reintenta mientras haya pendientes.
      if (!this.retries.has(id)) {
        const timer = setInterval(() => {
          if (this.opts.manager.get(id)?.state === 'exited' || !this.opts.manager.get(id)) this.stopRetry(id)
          else this.flush(id)
        }, 500)
        timer.unref?.()
        this.retries.set(id, timer)
      }
      return
    }
    this.stopRetry(id)
    while (q.length) {
      const msg = q.shift()!
      this.opts.manager.write(id, msg)
      // Enter aparte: algunas CLIs tratan el texto pegado y el Enter juntos como pegado multilínea.
      setTimeout(() => this.opts.manager.isLive(id) && this.opts.manager.write(id, '\r'), 150)
    }
  }

  // ── Lanzar agentes ───────────────────────────────────────────────────────

  get bossOnline() {
    return this.opts.manager.isLive(BOSS_ID)
  }

  /** Contrata al jefe: trabaja en el repo principal, sin worktree. */
  async hireBoss(req: { provider: ProviderId; model?: string; effort?: Effort; goal: string }) {
    if (this.bossOnline) throw new RuleError('El jefe ya está en su oficina.')
    const adapter = getProvider(req.provider)
    if (!adapter.mcpArgs) throw new RuleError(`${adapter.name} aún no sabe conectarse a las herramientas de Orquest; elige otro jefe.`)
    this.board.goal = req.goal
    const token = this.newToken({ kind: 'boss' })
    const office = { path: this.root, branch: await currentBranch(this.root) }
    const prompt = bossPrompt(req.goal)
    const viaArg = takesSystemPrompt(adapter)
    await this.opts.manager.hire({
      id: BOSS_ID,
      provider: req.provider,
      model: req.model,
      effort: req.effort,
      role: 'jefe',
      repo: this.root,
      office,
      binary: this.opts.binaries?.[req.provider],
      systemPrompt: viaArg ? prompt : undefined,
      extraArgs: adapter.mcpArgs(this.opts.mcpUrl(token), BOSS_PERMISSIONS),
    })
    if (!viaArg) this.notify(BOSS_ID, prompt)
    const resumed = this.board.tasks.length > 0
    this.notify(
      BOSS_ID,
      resumed
        ? 'Retomas un proyecto con tablero previo; los empleados anteriores ya no están. Lee el proyecto, levanta de nuevo a quien haga falta y reasigna sus tareas abiertas.'
        : 'Proyecto abierto. Lee el proyecto y los expedientes y propón la plantilla.',
    )
    this.changed()
  }

  /** Regla de expedientes para el tablero. */
  private rule = (s: { provider: ProviderId; model?: string; role: string }) => this.library.check(s.provider, s.model, s.role)

  private async hireSlot(slot: Slot) {
    // El expediente pudo cambiar desde que se aprobó.
    const check = this.rule(slot)
    if (!check.ok) throw new RuleError(check.reason)
    const adapter = getProvider(slot.provider)
    const manual = this.library.manual(slot.role)
    const id = `${slot.role}-${slot.provider}-${slot.id}`.toLowerCase()
    const token = this.newToken({ kind: 'employee', id })
    this.known.add(id)
    const warnings: string[] = []
    if (!adapter.mcpArgs) warnings.push(`${adapter.name} no se conecta a las herramientas de Orquest ni aplica permisos por puesto; el jefe le habla por terminal.`)
    warnings.push(...(adapter.permissionGaps?.(manual.permissions) ?? []))
    if (check.warning) warnings.push(check.warning)
    // El manual necesita la oficina; se crea dentro de hire, así que se arma después.
    const emp = await this.opts.manager.hire({
      id,
      provider: slot.provider,
      model: slot.model,
      effort: slot.effort,
      role: slot.role,
      repo: this.root,
      binary: this.opts.binaries?.[slot.provider],
      extraArgs: adapter.mcpArgs?.(this.opts.mcpUrl(token), manual.permissions) ?? [],
    })
    this.offices.set(id, emp.office)
    this.board.hired(slot, { id, role: slot.role, provider: slot.provider })
    this.notify(id, employeePrompt(manual, emp.office))
    return { id, warnings: [...warnings, ...emp.warnings] }
  }

  private office(id: string): Office {
    const o = this.offices.get(id) ?? this.opts.manager.get(id)?.office
    if (!o) throw new RuleError(`${id} no tiene oficina activa.`)
    return o
  }

  // ── Herramientas MCP ─────────────────────────────────────────────────────

  async call(caller: Caller, tool: string, args: Record<string, unknown>): Promise<string> {
    const boss = BOSS_TOOLS.has(tool)
    const employee = EMPLOYEE_TOOLS.has(tool)
    if (!boss && !employee) throw new RuleError(`Herramienta desconocida: ${tool}`)
    if (boss && caller.kind !== 'boss') throw new RuleError(`${tool} es una herramienta del jefe.`)
    if (employee && caller.kind !== 'employee') throw new RuleError(`${tool} es una herramienta de empleado.`)
    try {
      return caller.kind === 'boss' ? await this.bossTool(tool, args) : await this.employeeTool(caller.id, tool, args)
    } finally {
      this.changed()
    }
  }

  private async bossTool(tool: string, a: Record<string, any>): Promise<string> {
    const b = this.board
    switch (tool) {
      case 'leer_proyecto':
        return JSON.stringify(this.projectView(), null, 2)

      case 'leer_expedientes': {
        const clis = await this.opts.detect()
        const lib = this.library
        return JSON.stringify(
          clis.map((c) => {
            const d = lib.dossier(c.id)
            return {
              proveedor: c.id,
              nombre: c.name,
              disponible: c.installed && c.session !== false,
              version: c.version,
              conecta_con_orquest: !!getProvider(c.id).mcpArgs,
              puestos_permitidos: d.allowedRoles ?? 'todos',
              si_no_se_permite: d.enforce === 'block' ? 'el juego lo rechaza' : 'se permite con aviso',
              notas_del_usuario: d.notes || undefined,
              historial_contigo: lib.stats(c.id),
              por_modelo: Object.fromEntries(
                lib.models(c.id).map((m) => {
                  const md = lib.dossier(c.id, m)
                  return [m || '(por defecto)', { ...lib.stats(c.id, m), ...(md.model ? { puestos_permitidos: md.allowedRoles ?? 'todos', notas_del_usuario: md.notes || undefined } : {}) }]
                }),
              ),
            }
          }),
          null,
          2,
        )
      }

      case 'proponer_plantilla': {
        const clis = await this.opts.detect()
        const ok = (p: ProviderId) => clis.some((c) => c.id === p && c.installed && c.session !== false)
        const slots = b.propose(
          (a.puestos as any[]).map((p) => ({
            role: String(p.puesto).toLowerCase(),
            provider: p.proveedor,
            model: p.modelo,
            effort: p.esfuerzo,
            reason: p.motivo,
          })),
          ok,
          this.rule,
        )
        this.emit('notice', `El jefe propone una plantilla de ${slots.length} puestos. Ábrela en Plantilla.`)
        const warned = slots.filter((x) => x.warning)
        return `Propuesta enviada al usuario (${slots.map((s) => `${s.id} ${s.role}/${s.provider}`).join(', ')}). Espera su aprobación; se te avisará.${warned.length ? ` Avisos del expediente: ${warned.map((x) => x.warning).join(' ')}` : ''}`
      }

      case 'levantar_empleado': {
        const slot = b.takeSlot(String(a.puesto))
        const { id, warnings } = await this.hireSlot(slot)
        return `Contratado ${id} (${slot.role}, ${slot.provider}). Entra por Recepción y va a su escritorio.${warnings.length ? ` Avisos: ${warnings.join(' ')}` : ''}`
      }

      case 'asignar_tarea': {
        let t: Task
        if (a.tarea_id) {
          t = b.task(String(a.tarea_id))
          if (a.empleado && a.empleado !== t.assignee) t = b.reassign(t.id, String(a.empleado))
          if (a.depende_de) t = b.setDeps(t.id, a.depende_de)
        } else {
          if (!a.empleado || !a.titulo) throw new RuleError('Para crear una tarea indica empleado y titulo.')
          t = b.assign({ assignee: String(a.empleado), title: String(a.titulo), description: String(a.descripcion ?? ''), deps: a.depende_de })
        }
        if (t.status === 'ready') this.notify(t.assignee, `Tienes una tarea nueva (${t.id}: ${t.title}). Usa leer_tarea.`)
        else if (t.status === 'waiting') {
          this.notify(t.assignee, `Se te asignó ${t.id} (${t.title}); espera a ${b.openDeps(t).map((d) => `${d.id} de ${d.assignee}`).join(', ')}. Se te avisará al liberarse.`)
        }
        return `${t.id} → ${t.assignee}: ${t.status === 'waiting' ? `esperando a ${b.openDeps(t).map((d) => d.id).join(', ')}` : t.status}.`
      }

      case 'hablar_con': {
        const to = b.member(String(a.empleado))
        if (!this.opts.manager.isLive(to.id)) throw new RuleError(`${to.id} ya no está en la oficina.`)
        b.say(BOSS_ID, to.id, String(a.mensaje))
        const wait = a.esperar_respuesta !== false
        this.notify(to.id, `El jefe dice: ${a.mensaje}${wait ? ' (contesta con reportar_estado, campo respuesta)' : ''}`)
        if (!wait) return 'Mensaje entregado.'
        const answer = await new Promise<string | undefined>((resolve) => {
          const timer = setTimeout(() => {
            this.waiters.delete(to.id)
            resolve(undefined)
          }, this.opts.replyTimeoutMs ?? 120_000)
          this.waiters.set(to.id, (text) => {
            clearTimeout(timer)
            resolve(text)
          })
        })
        return answer ?? `${to.id} aún no responde; su respuesta te llegará como mensaje cuando la dé.`
      }

      case 'revisar_entrega': {
        const decision = String(a.decision)
        if (decision === 'qa') {
          return this.bossTool('mandar_a_qa', { tarea: a.tarea, empleado_qa: a.empleado_qa, instrucciones: a.notas ?? '' })
        }
        if (decision !== 'aprobar' && decision !== 'regresar') throw new RuleError('decision debe ser aprobar, regresar o qa.')
        if (decision === 'regresar' && !a.notas) throw new RuleError('Para regresar una entrega di qué falta en notas.')
        const t = b.review(String(a.tarea), decision === 'aprobar' ? 'approve' : 'return', a.notas ? String(a.notas) : '')
        if (t.status !== 'approved') this.record(t, 'returned')
        if (t.status === 'approved') {
          this.emit('notice', `${t.id} (${t.title}) espera tu aprobación para integrarse. Ábrela en Entregas.`)
          return `${t.id} aprobada; queda en la bandeja del usuario para integrarse.`
        }
        this.notify(t.assignee, `Tu entrega ${t.id} regresó: ${a.notas}. Usa leer_tarea y vuelve a entregar.`)
        return `${t.id} regresó al escritorio de ${t.assignee}.`
      }

      case 'mandar_a_qa': {
        const review = b.toQa(String(a.tarea), String(a.empleado_qa), String(a.instrucciones ?? ''))
        this.notify(review.assignee, `Tienes una revisión de QA (${review.id}). Usa leer_tarea.`)
        return `${review.id} creada para ${review.assignee}.`
      }
    }
    throw new RuleError(`Herramienta desconocida: ${tool}`)
  }

  private async employeeTool(id: string, tool: string, a: Record<string, any>): Promise<string> {
    const b = this.board
    switch (tool) {
      case 'leer_tarea': {
        const t = b.start(id)
        if (!t) {
          const waiting = b.tasks.find((x) => x.assignee === id && x.status === 'waiting')
          return waiting
            ? `Tu tarea ${waiting.id} (${waiting.title}) espera a ${b.openDeps(waiting).map((d) => `${d.id} de ${d.assignee}`).join(', ')}. Se te avisará.`
            : 'No tienes tarea asignada. Espera instrucciones del jefe.'
        }
        return JSON.stringify(this.taskView(t), null, 2)
      }

      case 'preguntar_al_jefe': {
        b.say(id, BOSS_ID, String(a.pregunta))
        this.notify(BOSS_ID, `${id} pregunta: ${a.pregunta} (responde con hablar_con)`)
        return 'Pregunta enviada al jefe; su respuesta llegará a tu terminal.'
      }

      case 'reportar_estado': {
        const map: Record<string, 'working' | 'blocked' | 'idle'> = { trabajando: 'working', bloqueado: 'blocked', esperando: 'idle' }
        const state = map[String(a.estado)]
        if (!state) throw new RuleError('estado debe ser trabajando, bloqueado o esperando.')
        if (this.opts.manager.isLive(id)) this.opts.manager.report(id, state)
        if (a.nota) b.say(id, 'tablero', String(a.nota))
        if (a.respuesta) {
          b.say(id, BOSS_ID, String(a.respuesta))
          const waiter = this.waiters.get(id)
          this.waiters.delete(id)
          if (waiter) waiter(String(a.respuesta))
          else this.notify(BOSS_ID, `${id} responde: ${a.respuesta}`)
        }
        if (state === 'blocked') this.emit('notice', `${id} está bloqueado${a.nota ? `: ${a.nota}` : ''}.`)
        return 'Estado registrado.'
      }

      case 'entregar': {
        const t = b.current(id)
        if (!t) b.deliver(id, { report: '', screenshots: [] }) // lanza el motivo
        const member = b.member(id)
        const manual = this.library.manual(member.role)
        const shots = (a.capturas as string[] | undefined) ?? []
        if (manual.requireScreenshots && t!.kind === 'work' && !shots.length) {
          throw new RuleError(`El manual de ${member.role} pide capturas en la entrega. ${manual.delivery}`)
        }
        let diff: { commit?: string; diffStat?: string } = {}
        if (t!.kind === 'work') diff = await commitDelivery(this.office(id), `${t!.id}: ${t!.title}`)
        const verdict = a.veredicto === 'pasa' ? 'pass' : a.veredicto === 'no_pasa' ? 'fail' : undefined
        const { task, reviewed } = b.deliver(id, {
          report: String(a.reporte),
          screenshots: shots,
          verdict,
          ...diff,
        })
        if (task.kind === 'work') this.record(task, 'delivered')
        if (task.kind === 'qa' && reviewed) {
          if (verdict === 'fail') {
            this.record(reviewed, 'qa_fail')
            this.notify(reviewed.assignee, `QA rechazó ${reviewed.id}: ${a.reporte}. Usa leer_tarea, corrige y vuelve a entregar.`)
            this.notify(BOSS_ID, `QA rechazó ${reviewed.id}; regresó a ${reviewed.assignee}.`)
          } else {
            this.notify(BOSS_ID, `QA aprobó ${reviewed.id}. Revísala con revisar_entrega.`)
          }
        } else {
          this.notify(BOSS_ID, `${id} entregó ${task.id} (${task.title}). Revísala con revisar_entrega o mándala a QA.`)
        }
        return 'Entrega recibida. Espera instrucciones.'
      }
    }
    throw new RuleError(`Herramienta desconocida: ${tool}`)
  }

  // ── Historial ────────────────────────────────────────────────────────────

  /** Anota en el expediente de quien hizo la tarea cómo le fue. */
  private record(t: Task, outcome: Outcome) {
    const m = this.board.staff.find((x) => x.id === t.assignee)
    if (!m || t.kind !== 'work') return
    this.library.record({
      provider: m.provider,
      model: m.model ?? '',
      role: m.role,
      project: this.root,
      taskId: t.id,
      outcome,
      firstTry: outcome === 'merged' ? t.returns === 0 : undefined,
    })
  }

  // ── Acciones del usuario ─────────────────────────────────────────────────

  /** El usuario aprueba (y ajusta) la plantilla propuesta. */
  approveTemplate(slots: Parameters<Board['approve']>[0]) {
    const approved = this.board.approve(slots, this.rule)
    this.notify(
      BOSS_ID,
      `El usuario aprobó la plantilla: ${approved.map((s) => `${s.id} ${s.role} (${s.provider}${s.model ? ` ${s.model}` : ''})`).join(', ')}. Levanta a cada uno con levantar_empleado y asígnales tareas.`,
    )
    this.changed()
    return approved
  }

  /** El usuario aprueba el merge de una entrega aprobada por el jefe. */
  async merge(taskId: string): Promise<Task[]> {
    const t = this.board.task(taskId)
    if (t.status !== 'approved') throw new RuleError(`${t.id} no está aprobada por el jefe.`)
    const office = this.office(t.assignee)
    const result = await mergeOffice(this.root, office, `${t.id}: ${t.title} (${t.assignee})`)
    if (!result.ok) {
      this.notify(BOSS_ID, `No se pudo integrar ${t.id}: ${result.reason} Pide a ${t.assignee} que integre la rama base y entregue de nuevo, o regrésala.`)
      this.changed()
      throw new RuleError(result.reason)
    }
    const released = this.board.merged(t.id)
    this.record(t, 'merged')
    const branch = await currentBranch(this.root)
    for (const r of released) {
      this.notify(
        r.assignee,
        `Tu dependencia ${t.id} (${t.title}, de ${t.assignee}) ya está integrada en ${branch}. Tráela a tu oficina con: git merge ${branch}. Su reporte: ${t.delivery?.report ?? ''}. Tu tarea ${r.id} está lista; usa leer_tarea.`,
      )
    }
    this.notify(BOSS_ID, `El usuario integró ${t.id}.${released.length ? ` Se liberó: ${released.map((r) => r.id).join(', ')}.` : ''}`)
    this.changed()
    return released
  }

  userReturn(taskId: string, notes: string) {
    const t = this.board.userReturn(taskId, notes)
    this.record(t, 'returned')
    this.notify(t.assignee, `El usuario regresó ${t.id}: ${notes}. Usa leer_tarea y vuelve a entregar.`)
    this.notify(BOSS_ID, `El usuario regresó ${t.id} a ${t.assignee}: ${notes}`)
    this.changed()
  }

  sayToBoss(text: string) {
    this.board.say('usuario', BOSS_ID, text)
    this.notify(BOSS_ID, `El usuario dice: ${text}`)
    this.changed()
  }

  async diff(taskId: string): Promise<string> {
    const t = this.board.task(taskId)
    if (!t.delivery?.commit) return ''
    return deliveryDiff(this.office(t.assignee), t.delivery.commit)
  }

  // ── Vistas ───────────────────────────────────────────────────────────────

  snapshot(): StudioSnapshot {
    const hints: StudioSnapshot['hints'] = {}
    for (const m of this.board.staff) {
      const h = this.board.hint(m.id)
      if (h) hints[m.id] = h
    }
    return { ...this.board.snapshot(), repo: this.root, bossOnline: this.bossOnline, hints }
  }

  /** El usuario despide a alguien: su CLI se cierra; su rama y su tablero quedan. */
  async fire(id: string) {
    if (this.opts.manager.get(id)) await this.opts.manager.fire(id, this.root)
    this.board.offline(id)
    if (id !== BOSS_ID) this.notify(BOSS_ID, `El usuario despidió a ${id}. Reasigna sus tareas abiertas si hace falta.`)
    this.changed()
  }

  private projectView() {
    const b = this.board
    return {
      objetivo: b.goal,
      repo: this.root,
      plantilla: b.slots.map((s) => ({ id: s.id, puesto: s.role, proveedor: s.provider, modelo: s.model, estado: s.status, empleado: s.employeeId })),
      empleados: b.staff.map((m) => ({
        id: m.id,
        puesto: m.role,
        proveedor: m.provider,
        en_oficina: m.online,
        estado: this.opts.manager.get(m.id)?.state,
        tarea_actual: b.current(m.id)?.id,
      })),
      tareas: b.tasks.map((t) => ({
        id: t.id,
        tipo: t.kind,
        titulo: t.title,
        responsable: t.assignee,
        estado: t.status,
        depende_de: t.deps,
        regresada: t.returns,
        entrega: t.delivery && { reporte: t.delivery.report, cambios: t.delivery.diffStat, veredicto: t.delivery.verdict },
        qa: t.qa && { veredicto: t.qa.verdict, reporte: t.qa.report },
      })),
      esperan_al_usuario: b.inbox().map((t) => t.id),
    }
  }

  private taskView(t: Task) {
    const b = this.board
    return {
      id: t.id,
      tipo: t.kind,
      titulo: t.title,
      descripcion: t.description,
      estado: t.status,
      dependencias: t.deps.map((d) => {
        const dep = b.task(d)
        return { id: dep.id, titulo: dep.title, de: dep.assignee, estado: dep.status, reporte: dep.delivery?.report, cambios: dep.delivery?.diffStat }
      }),
      revisa_a:
        t.reviewOf &&
        (() => {
          const r = b.task(t.reviewOf!)
          return { id: r.id, titulo: r.title, de: r.assignee, rama: this.offices.get(r.assignee)?.branch, reporte: r.delivery?.report, cambios: r.delivery?.diffStat }
        })(),
      historial: t.history.slice(-8).map((h) => h.text),
      ultimo_qa: t.qa && { veredicto: t.qa.verdict, reporte: t.qa.report },
      entrega_esperada: (() => {
        const m = this.library.manual(b.member(t.assignee).role)
        const base = t.kind === 'qa' ? 'entregar con veredicto (pasa / no_pasa) y reporte con pasos para reproducir cada fallo.' : m.delivery
        return m.requireScreenshots && t.kind === 'work' ? `${base} Capturas obligatorias.` : base
      })(),
    }
  }

  shutdown() {
    this.unsubscribe()
    for (const id of [...this.retries.keys()]) this.stopRetry(id)
    for (const w of this.waiters.values()) w('')
    this.waiters.clear()
  }
}

export const BOSS_TOOLS = new Set([
  'leer_proyecto',
  'leer_expedientes',
  'proponer_plantilla',
  'levantar_empleado',
  'asignar_tarea',
  'hablar_con',
  'revisar_entrega',
  'mandar_a_qa',
])
export const EMPLOYEE_TOOLS = new Set(['leer_tarea', 'preguntar_al_jefe', 'reportar_estado', 'entregar'])
