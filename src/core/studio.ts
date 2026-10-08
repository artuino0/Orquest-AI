/**
 * Orquesta un proyecto: une el tablero (reglas), la plantilla viva (CLIs en
 * PTY), git y los avisos entre jefe, empleados y usuario. Las herramientas MCP
 * y las acciones de la UI entran por aquí; ninguna toca el tablero directo.
 */
import { EventEmitter } from 'node:events'
import { randomBytes } from 'node:crypto'
import { access } from 'node:fs/promises'
import { Board, RuleError, type BoardSnapshot, type Slot, type StaffMember, type Task } from './board.js'
import type { CliStatus } from './detect.js'
import type { Employee, EmployeeManager, HireRequest } from './employees.js'
import { Journal, type JournalOwner } from './journal.js'
import { slug } from './names.js'
import { BOSS_PERMISSIONS, Library, type Outcome } from './library.js'
import { bossPrompt, employeePrompt, oneLine, type Channel } from './prompts.js'
import { getProvider, takesSystemPrompt, type Effort, type ProviderId } from './providers.js'
import type { EmployeeState } from './state.js'
import type { StudioStore } from './store.js'
import { commitDelivery, currentBranch, deliveryDiff, mergeOffice, repoRoot, type Office } from './worktree.js'

const exists = (path: string) => access(path).then(() => true, () => false)

export type Caller = { kind: 'boss' } | { kind: 'employee'; id: string }

export const BOSS_ID = 'jefe'

export interface StudioSnapshot extends BoardSnapshot {
  repo: string
  bossOnline: boolean
  /** Lo que el tablero dice de cada empleado: esperando a alguien, llevando su entrega o jugando. */
  hints: Record<string, NonNullable<ReturnType<Board['hint']>> | { state: 'gaming' }>
  /** % de contexto usado por agente, si se conoce. */
  context: Record<string, number>
  /** Desde qué % se manda a descansar. */
  burnoutAt: number
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
  /** URL donde una CLI reporta su estado (contexto, uso de la cuenta), por token. */
  statusUrl?: (token: string) => string
  /** % de contexto a partir del cual el agente se va a descansar. */
  burnoutAt?: number
  /** Cuánto se espera el traspaso antes de reiniciar de todos modos. */
  handoffTimeoutMs?: number
  /**
   * Comando `orquest`: su URL por token y la carpeta donde está instalado. Con
   * esto una CLI sin MCP usa las herramientas desde su terminal.
   */
  cli?: { url: (token: string) => string; dir: string }
}

/** Cómo se lanzó un agente: con esto se reinicia igual tras descansar. */
interface Launch {
  req: HireRequest
  token: string
  owner: JournalOwner
  /** Mensajes de arranque (manual, contexto) que recibe al entrar. */
  intro: (office: Office) => string[]
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
  private launches = new Map<string, Launch>()
  /** Quién está jugando videojuegos (limpiando contexto) y por qué. */
  private resting = new Map<string, string>()
  /** Pasó el umbral a media tarea: descansa en cuanto termine su turno. */
  private restPending = new Set<string>()
  /** Contexto con que arrancó cada sesión. */
  private contextFloor = new Map<string, number>()
  private handoffWaiters = new Map<string, () => void>()
  private unsubscribe: () => void
  root = ''
  readonly library: Library
  journal!: Journal

  constructor(private opts: StudioOptions) {
    super()
    this.library = opts.library ?? new Library(opts.store)
    const saved = opts.store?.load(opts.repo)
    this.board = saved ? Board.restore(saved) : new Board()
    const onState = (id: string, state: EmployeeState) => {
      if (!this.isOurs(id)) return
      if (state === 'idle') {
        this.flush(id)
        if (this.restPending.has(id)) this.tryRest(id)
      }
      this.changed()
    }
    const onExit = (id: string) => {
      if (!this.isOurs(id) || this.resting.has(id)) return
      this.board.offline(id)
      this.changed()
    }
    const onContext = (id: string, pct: number) => {
      if (!this.isOurs(id)) return
      // Una sesión nueva ya arranca con contexto usado (manual, herramientas):
      // la primera lectura tras lanzar es su piso, y para volver a descansar
      // tiene que haber trabajado. Si no, entraría en un ciclo.
      if (!this.contextFloor.has(id)) this.contextFloor.set(id, pct)
      const worked = pct >= this.contextFloor.get(id)! + 10
      if (pct >= this.burnoutAt && worked && !this.resting.has(id)) {
        this.restPending.add(id)
        this.tryRest(id)
      }
      this.changed()
    }
    opts.manager.on('state', onState)
    opts.manager.on('exit', onExit)
    opts.manager.on('context', onContext)
    this.unsubscribe = () => {
      opts.manager.off('state', onState)
      opts.manager.off('exit', onExit)
      opts.manager.off('context', onContext)
    }
  }

  async init() {
    this.root = await repoRoot(this.opts.repo)
    this.journal = new Journal(this.root)
    return this
  }

  get burnoutAt() {
    return this.opts.burnoutAt ?? 80
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

  /** Lanza (o relanza) la CLI de un agente con sus mensajes de arranque. */
  private async launch(id: string, l: Launch, extra: string[] | ((emp: Employee) => string[]) = [], resume = false) {
    this.contextFloor.delete(id)
    const cli = this.opts.cli
    // Retomar es seguir la conversación de antes; si no, nace una nueva (así vuelve de descansar, con el contexto limpio).
    const session = resume ? { id: id === BOSS_ID ? this.board.boss?.sessionId : this.board.staff.find((m) => m.id === id)?.sessionId, resume: true } : undefined
    const req = { ...l.req, session }
    // Toda terminal recibe el comando, también las que hablan MCP: su token la identifica igual.
    const emp = await this.opts.manager.hire(cli ? { ...req, env: { ...req.env, ORQUEST_URL: cli.url(l.token) }, path: [cli.dir] } : req)
    this.offices.set(id, emp.office)
    // De aquí en adelante, relanzar reusa la misma oficina.
    l.req = { ...l.req, office: emp.office }
    this.launches.set(id, l)
    // La conversación cambia cada vez que nace una nueva: se guarda la vigente.
    if (id === BOSS_ID && this.board.boss) this.board.boss.sessionId = emp.sessionId
    else this.board.returned(id, emp.sessionId)
    // Quien retomó ya trae su manual en la conversación.
    const intro = emp.resumed ? [] : l.intro(emp.office)
    for (const m of [...intro, ...(typeof extra === 'function' ? extra(emp) : extra)]) this.notify(id, m)
    return emp
  }

  /** Por dónde usa las herramientas una CLI: MCP si sabe, si no el comando `orquest`. */
  private channel(provider: ProviderId): Channel | undefined {
    return getProvider(provider).mcpArgs ? 'mcp' : this.opts.cli ? 'cli' : undefined
  }

  private connectArgs(provider: ProviderId, token: string, permissions: Parameters<NonNullable<ReturnType<typeof getProvider>['mcpArgs']>>[0]['permissions']) {
    return (
      getProvider(provider).mcpArgs?.({
        url: this.opts.mcpUrl(token),
        permissions,
        statusUrl: this.opts.statusUrl?.(token),
      }) ?? []
    )
  }

  /** Contrata al jefe: trabaja en el repo principal, sin worktree. */
  async hireBoss(req: { provider: ProviderId; model?: string; effort?: Effort; goal: string }) {
    if (this.bossOnline) throw new RuleError('El jefe ya está en su oficina.')
    await this.launchBoss(req, false)
    this.fact(BOSS_ID, `contratado como jefe (${req.provider}${req.model ? ` ${req.model}` : ''}). Objetivo: ${req.goal}`)
    this.changed()
  }

  private async launchBoss(req: { provider: ProviderId; model?: string; effort?: Effort; goal: string }, resume: boolean) {
    const adapter = getProvider(req.provider)
    const channel = this.channel(req.provider)
    if (!channel) throw new RuleError(`${adapter.name} aún no sabe conectarse a las herramientas de Orquest; elige otro jefe.`)
    this.board.goal = req.goal
    const token = this.newToken({ kind: 'boss' })
    const office = { path: this.root, branch: await currentBranch(this.root) }
    const prompt = bossPrompt(req.goal, this.journal.path(BOSS_ID), channel)
    const viaArg = takesSystemPrompt(adapter)
    const owner: JournalOwner = { id: BOSS_ID, name: 'Jefe', role: 'jefe', provider: req.provider, model: req.model }
    await this.journal.open(owner)
    const previous = this.board.tasks.length > 0
    const journal = this.journal.path(BOSS_ID)
    // Para que `launch` sepa qué conversación retomar; si es nuevo, parte sin ninguna.
    this.board.boss = { provider: req.provider, model: req.model, effort: req.effort, sessionId: resume ? this.board.boss?.sessionId : undefined }
    await this.launch(BOSS_ID, {
      token,
      owner,
      req: {
        id: BOSS_ID,
        provider: req.provider,
        model: req.model,
        effort: req.effort,
        role: 'jefe',
        repo: this.root,
        office,
        binary: this.opts.binaries?.[req.provider],
        systemPrompt: viaArg ? prompt : undefined,
        extraArgs: this.connectArgs(req.provider, token, BOSS_PERMISSIONS),
      },
      intro: () => (viaArg ? [] : [prompt]),
    }, (emp) => [
      emp.resumed
        ? 'La app se reabrió y retomaste tu sesión. Tu equipo también vuelve a su escritorio. Sigue donde ibas (leer_proyecto).'
        : resume
          ? `La app se reabrió. Tu equipo vuelve a su escritorio. Lee tu bitácora (${journal}) y sigue donde ibas (leer_proyecto).`
          : previous
            ? `Retomas un proyecto con tablero previo; los empleados anteriores ya no están. Lee tu bitácora (${journal}) y el proyecto, levanta de nuevo a quien haga falta y reasigna sus tareas abiertas.`
            : 'Proyecto abierto. Lee el proyecto y los expedientes y propón la plantilla.',
    ], resume)
  }

  private resumedOnce = false
  /**
   * Al reabrir un proyecto: el jefe y quienes seguían contratados vuelven a su
   * escritorio, cada uno retomando su conversación si su CLI sabe hacerlo.
   * Quien no pueda volver se queda fuera y se avisa; no frena a los demás.
   */
  async resume(): Promise<void> {
    if (this.resumedOnce) return
    this.resumedOnce = true
    const boss = this.board.boss
    if (!boss || this.bossOnline) return
    try {
      await this.launchBoss({ ...boss, goal: this.board.goal }, true)
      this.fact(BOSS_ID, 'volvió al reabrir la app')
    } catch (err) {
      this.emit('notice', `No se pudo retomar al jefe: ${(err as Error).message}`)
      this.changed()
      return
    }
    for (const m of this.board.staff) {
      const slot = this.board.slots.find((s) => s.employeeId === m.id)
      // Sin oficina guardada o sin su carpeta ya no hay a dónde volver.
      if (m.gone || !slot || !m.office || !(await exists(m.office.path))) continue
      try {
        await this.hireSlot(slot, m)
        this.fact(m.id, 'volvió al reabrir la app')
      } catch (err) {
        this.emit('notice', `No se pudo retomar a ${m.name}: ${(err as Error).message}`)
      }
    }
    this.changed()
  }

  /** Regla de expedientes para el tablero. */
  private rule = (s: { provider: ProviderId; model?: string; role: string }) => this.library.check(s.provider, s.model, s.role)

  /** Levanta a quien ocupa un puesto. Con `again`, es alguien que ya estaba y vuelve al reabrir la app. */
  private async hireSlot(slot: Slot, again?: StaffMember) {
    // El expediente pudo cambiar desde que se aprobó.
    const check = this.rule(slot)
    if (!check.ok) throw new RuleError(check.reason)
    const adapter = getProvider(slot.provider)
    const manual = this.library.manual(slot.role)
    const id = again?.id ?? `${slug(slot.name)}-${slot.role}`
    const token = this.newToken({ kind: 'employee', id })
    this.known.add(id)
    const warnings: string[] = []
    const channel = this.channel(slot.provider)
    if (!channel) warnings.push(`${adapter.name} no se conecta a las herramientas de Orquest ni aplica permisos por puesto; el jefe le habla por terminal.`)
    else if (channel === 'cli') warnings.push(`${adapter.name} usa las herramientas de Orquest con el comando orquest; no aplica permisos por puesto.`)
    warnings.push(...(adapter.permissionGaps?.(manual.permissions) ?? []))
    if (check.warning) warnings.push(check.warning)
    const owner: JournalOwner = { id, name: slot.name, role: slot.role, provider: slot.provider, model: slot.model }
    await this.journal.open(owner)
    // Capacitación: quien ocupó antes el puesto dejó su bitácora.
    const before = this.board.predecessors(slot.role).map((m) => `${m.name}: ${this.journal.path(m.id)}`)
    const journalPath = this.journal.path(id)
    const emp = await this.launch(id, {
      token,
      owner,
      req: {
        id,
        provider: slot.provider,
        model: slot.model,
        effort: slot.effort,
        role: slot.role,
        repo: this.root,
        office: again?.office,
        binary: this.opts.binaries?.[slot.provider],
        extraArgs: this.connectArgs(slot.provider, token, manual.permissions),
      },
      intro: (office) => [employeePrompt(manual, office, { name: slot.name, journal: journalPath }, channel)],
    }, (e) =>
      again
        ? [e.resumed ? 'La app se reabrió y retomaste tu sesión. Sigue donde ibas (leer_tarea).' : `La app se reabrió. Lee tu bitácora (${journalPath}) y sigue donde ibas (leer_tarea).`]
        : before.length ? [`Antes que tú, en ${slot.role} estuvo ${before.join('; ')}. Lee su bitácora: es tu capacitación (su traspaso es su versión; los hechos son de Orquest).`] : [],
    !!again)
    if (again) return { id, name: slot.name, warnings: [...warnings, ...emp.warnings] }
    this.board.hired(slot, { id, role: slot.role, provider: slot.provider, effort: slot.effort, sessionId: emp.sessionId, office: emp.office })
    this.fact(id, `contratado como ${slot.role} (${slot.provider}${slot.model ? ` ${slot.model}` : ''})${before.length ? `; antes en el puesto: ${before.map((b) => b.split(':')[0]).join(', ')}` : ''}`)
    return { id, name: slot.name, warnings: [...warnings, ...emp.warnings] }
  }

  // ── Bitácora y descanso ──────────────────────────────────────────────────

  private owner(id: string): JournalOwner | undefined {
    const l = this.launches.get(id)
    if (l) return l.owner
    const m = this.board.staff.find((x) => x.id === id)
    return m && { id: m.id, name: m.name, role: m.role, provider: m.provider, model: m.model }
  }

  /** Anota un hecho en la bitácora; nunca frena el flujo si falla el disco. */
  private fact(id: string, text: string) {
    const o = this.owner(id)
    if (o) this.journal.fact(o, text).catch(() => {})
  }

  private nameOf(id: string): string {
    if (id === BOSS_ID) return 'el jefe'
    return this.board.staff.find((m) => m.id === id)?.name ?? id
  }

  private restRetries = new Map<string, ReturnType<typeof setInterval>>()

  private tryRest(id: string) {
    if (this.resting.has(id)) return
    if (!this.opts.manager.atPrompt(id)) {
      // Igual que los avisos: la TUI puede tardar en mostrar su prompt; reintenta.
      if (!this.restRetries.has(id)) {
        const timer = setInterval(() => {
          if (!this.restPending.has(id) || !this.opts.manager.get(id)) {
            clearInterval(timer)
            this.restRetries.delete(id)
          } else this.tryRest(id)
        }, 500)
        timer.unref?.()
        this.restRetries.set(id, timer)
      }
      return
    }
    clearInterval(this.restRetries.get(id))
    this.restRetries.delete(id)
    this.restPending.delete(id)
    const pct = this.opts.manager.get(id)?.context
    void this.rest(id, `contexto al ${pct ?? '?'}%`).catch((err) => this.emit('notice', `No se pudo reiniciar a ${this.nameOf(id)}: ${(err as Error).message}`))
  }

  /**
   * Burnout: el agente escribe su traspaso, se cierra su CLI y se relanza con
   * contexto limpio en la misma oficina; al volver lee su bitácora. En el mapa
   * se va a jugar videojuegos mientras tanto. Lo que dura es lo que tarda.
   */
  async rest(id: string, reason = 'lo mandó el usuario') {
    const l = this.launches.get(id)
    if (!l) throw new RuleError(`${this.nameOf(id)} no está en la oficina.`)
    if (this.resting.has(id)) throw new RuleError(`${this.nameOf(id)} ya está descansando.`)
    this.resting.set(id, reason)
    this.emit('notice', `${l.owner.name} se va a jugar videojuegos (${reason}).`)
    this.changed()
    try {
      const wrote = new Promise<void>((ok) => this.handoffWaiters.set(id, ok))
      const timeout = new Promise<void>((ok) => setTimeout(ok, this.opts.handoffTimeoutMs ?? 180_000).unref?.())
      this.notify(
        id,
        `Te toca descansar (${reason}). Antes, escribe tu traspaso con escribir_traspaso: qué hiciste, decisiones, pendientes, trampas del código y tu siguiente paso. Al volver lo leerás con el contexto limpio.`,
      )
      await Promise.race([wrote, timeout])
      this.handoffWaiters.delete(id)
      this.fact(id, `se fue a jugar videojuegos para limpiar contexto (${reason})`)
      // Se cierra y se relanza igual: mismo proveedor, modelo, manual, oficina y token.
      this.queues.delete(id)
      await this.opts.manager.fire(id, this.root)
      await this.launch(id, l, [
        `Volviste de descansar con el contexto limpio. Lee tu bitácora (${this.journal.path(id)}) y sigue donde ibas${id === BOSS_ID ? ' (leer_proyecto)' : ' (leer_tarea)'}.`,
      ])
      this.fact(id, 'volvió de descansar')
    } finally {
      this.resting.delete(id)
      this.changed()
    }
  }

  private office(id: string): Office {
    const o = this.offices.get(id) ?? this.opts.manager.get(id)?.office
    if (!o) throw new RuleError(`${id} no tiene oficina activa.`)
    return o
  }

  // ── Herramientas MCP ─────────────────────────────────────────────────────

  async call(caller: Caller, tool: string, args: Record<string, unknown>): Promise<string> {
    if (tool === 'escribir_traspaso') {
      const id = caller.kind === 'boss' ? BOSS_ID : caller.id
      try {
        return await this.writeHandoff(id, String(args.traspaso ?? ''))
      } finally {
        this.changed()
      }
    }
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

  private async writeHandoff(id: string, text: string): Promise<string> {
    const o = this.owner(id)
    if (!o) throw new RuleError('No tienes bitácora.')
    try {
      await this.journal.handoff(o, text)
    } catch (err) {
      throw new RuleError((err as Error).message)
    }
    this.handoffWaiters.get(id)?.()
    return `Traspaso guardado en ${this.journal.path(id)}.${this.resting.has(id) ? ' Ahora descansas; al volver lo leerás.' : ''}`
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
              conecta_con_orquest: !!this.channel(c.id),
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
        return `Propuesta enviada al usuario (${slots.map((s) => `${s.id} ${s.name}, ${s.role}/${s.provider}`).join(', ')}). Espera su aprobación; se te avisará.${warned.length ? ` Avisos del expediente: ${warned.map((x) => x.warning).join(' ')}` : ''}`
      }

      case 'levantar_empleado': {
        const slot = b.takeSlot(String(a.puesto))
        const { id, name, warnings } = await this.hireSlot(slot)
        return `Contratado ${name} (id ${id}; ${slot.role}, ${slot.provider}). Entra por Recepción y va a su escritorio.${warnings.length ? ` Avisos: ${warnings.join(' ')}` : ''}`
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
        this.fact(t.assignee, `${t.id} asignada: ${t.title}${t.deps.length ? ` (depende de ${t.deps.join(', ')})` : ''}`)
        if (t.status === 'ready') this.notify(t.assignee, `Tienes una tarea nueva (${t.id}: ${t.title}). Usa leer_tarea.`)
        else if (t.status === 'waiting') {
          this.notify(t.assignee, `Se te asignó ${t.id} (${t.title}); espera a ${b.openDeps(t).map((d) => `${d.id} de ${d.assignee}`).join(', ')}. Se te avisará al liberarse.`)
        }
        return `${t.id} → ${t.assignee}: ${t.status === 'waiting' ? `esperando a ${b.openDeps(t).map((d) => d.id).join(', ')}` : t.status}.`
      }

      case 'decir_al_usuario': {
        const text = String(a.mensaje ?? '').trim()
        if (!text) throw new RuleError('El mensaje va vacío.')
        b.say(BOSS_ID, 'usuario', text)
        this.changed()
        return 'Entregado al usuario.'
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
        if (t.status !== 'approved') this.record(t, 'returned', String(a.notas ?? ''))
        if (t.status === 'approved') {
          this.emit('notice', `${t.id} (${t.title}) espera tu aprobación para integrarse. Ábrela en Entregas.`)
          return `${t.id} aprobada; queda en la bandeja del usuario para integrarse.`
        }
        this.notify(t.assignee, `Tu entrega ${t.id} regresó: ${a.notas}. Usa leer_tarea y vuelve a entregar.`)
        return `${t.id} regresó al escritorio de ${t.assignee}.`
      }

      case 'mandar_a_qa': {
        const review = b.toQa(String(a.tarea), String(a.empleado_qa), String(a.instrucciones ?? ''))
        this.fact(review.assignee, `${review.id} asignada: ${review.title}`)
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
        this.notify(BOSS_ID, `${this.nameOf(id)} (${id}) pregunta: ${a.pregunta} (responde con hablar_con)`)
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
        if (task.kind === 'work') this.record(task, 'delivered', String(a.reporte))
        if (task.kind === 'qa' && reviewed) {
          this.fact(id, `${task.id}: revisé ${reviewed.id}, ${verdict === 'fail' ? 'no pasa' : 'pasa'} — ${String(a.reporte).slice(0, 300)}`)
          if (verdict === 'fail') {
            this.record(reviewed, 'qa_fail', String(a.reporte))
            this.notify(reviewed.assignee, `QA rechazó ${reviewed.id}: ${a.reporte}. Usa leer_tarea, corrige y vuelve a entregar.`)
            this.notify(BOSS_ID, `QA rechazó ${reviewed.id}; regresó a ${reviewed.assignee}.`)
          } else {
            this.notify(BOSS_ID, `QA aprobó ${reviewed.id}. Revísala con revisar_entrega.`)
          }
        } else {
          this.notify(BOSS_ID, `${this.nameOf(id)} (${id}) entregó ${task.id} (${task.title}). Revísala con revisar_entrega o mándala a QA.`)
        }
        return 'Entrega recibida. Espera instrucciones.'
      }
    }
    throw new RuleError(`Herramienta desconocida: ${tool}`)
  }

  // ── Historial ────────────────────────────────────────────────────────────

  /** Anota en el expediente de quien hizo la tarea cómo le fue. */
  private record(t: Task, outcome: Outcome, detail = '') {
    const m = this.board.staff.find((x) => x.id === t.assignee)
    if (!m || t.kind !== 'work') return
    const what: Record<Outcome, string> = { delivered: 'entregó', qa_fail: 'QA rechazó', returned: 'regresó', merged: 'integrada' }
    this.fact(m.id, `${t.id} (${t.title}): ${what[outcome]}${detail ? ` — ${detail.slice(0, 300)}` : ''}`)
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
    this.record(t, 'returned', notes)
    this.notify(t.assignee, `El usuario regresó ${t.id}: ${notes}. Usa leer_tarea y vuelve a entregar.`)
    this.notify(BOSS_ID, `El usuario regresó ${t.id} a ${t.assignee}: ${notes}`)
    this.changed()
  }

  sayToBoss(text: string) {
    this.board.say('usuario', BOSS_ID, text)
    this.notify(BOSS_ID, `El usuario dice: ${text} (contéstale con decir_al_usuario; no ve tu terminal)`)
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
    const context: StudioSnapshot['context'] = {}
    for (const id of [BOSS_ID, ...this.board.staff.map((m) => m.id)]) {
      const h = this.resting.has(id) ? ({ state: 'gaming' } as const) : id === BOSS_ID ? undefined : this.board.hint(id)
      if (h) hints[id] = h
      const c = this.opts.manager.get(id)?.context
      if (c !== undefined) context[id] = c
    }
    return { ...this.board.snapshot(), repo: this.root, bossOnline: this.bossOnline || this.resting.has(BOSS_ID), hints, context, burnoutAt: this.burnoutAt }
  }

  /** Lo que reporta la barra de estado de una CLI (Claude Code): % de contexto. */
  status(caller: Caller, body: unknown) {
    const id = caller.kind === 'boss' ? BOSS_ID : caller.id
    const pct = (body as { context_window?: { used_percentage?: number } })?.context_window?.used_percentage
    if (typeof pct === 'number' && this.opts.manager.get(id)) this.opts.manager.setContext(id, Math.round(pct))
  }

  /** Bitácora de un agente, para la UI. */
  readJournal(id: string): Promise<string> {
    return this.journal.read(id)
  }

  /** El usuario despide a alguien: su CLI se cierra; su rama y su tablero quedan. */
  async fire(id: string) {
    this.fact(id, 'despedido; su bitácora queda para capacitar a quien ocupe el puesto')
    this.launches.delete(id)
    if (this.opts.manager.get(id)) await this.opts.manager.fire(id, this.root)
    // Despedido no vuelve al reabrir la app.
    if (id === BOSS_ID) this.board.boss = undefined
    else this.board.dismiss(id)
    if (id !== BOSS_ID) this.notify(BOSS_ID, `El usuario despidió a ${this.nameOf(id)} (${id}). Reasigna sus tareas abiertas si hace falta; quien ocupe su puesto recibirá su bitácora.`)
    this.changed()
  }

  private projectView() {
    const b = this.board
    return {
      objetivo: b.goal,
      repo: this.root,
      plantilla: b.slots.map((s) => ({ id: s.id, nombre: s.name, puesto: s.role, proveedor: s.provider, modelo: s.model, estado: s.status, empleado: s.employeeId })),
      empleados: b.staff.map((m) => ({
        id: m.id,
        nombre: m.name,
        descansando: this.resting.has(m.id) || undefined,
        contexto_usado: this.opts.manager.get(m.id)?.context,
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
    for (const t of this.restRetries.values()) clearInterval(t)
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
  'decir_al_usuario',
  'hablar_con',
  'revisar_entrega',
  'mandar_a_qa',
])
export const EMPLOYEE_TOOLS = new Set(['leer_tarea', 'preguntar_al_jefe', 'reportar_estado', 'entregar'])
