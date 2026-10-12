/**
 * Orquesta un proyecto: une el tablero (reglas), la plantilla viva (CLIs en
 * PTY), git y los avisos entre jefe, empleados y usuario. Las herramientas MCP
 * y las acciones de la UI entran por aquí; ninguna toca el tablero directo.
 */
import { EventEmitter } from 'node:events'
import { randomBytes } from 'node:crypto'
import { access, mkdir, rmdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { accountEnv, listAccounts, parseClaudeLimits, type AccountUsage } from './accounts.js'
import { Board, RuleError, type BossRecord, type BoardSnapshot, type Slot, type StaffMember, type Task } from './board.js'
import { archiveCaptures, listCaptures, type Capture } from './captures.js'
import { listDir, readText, writeText, type FileEntry, type FileText } from './files.js'
import { formatText } from './format.js'
import type { CliStatus } from './detect.js'
import type { Employee, EmployeeManager, HireRequest } from './employees.js'
import { getLang, T } from './i18n.js'
import { Journal, type JournalOwner } from './journal.js'
import { slug } from './names.js'
import { BOSS_PERMISSIONS, Library, type Outcome } from './library.js'
import { listPlans, savePlan } from './plans.js'
import { askReminder, bossPrompt, employeePrompt, oneLine, planReminder, type Channel, type GroupInfo } from './prompts.js'
import { getProvider, takesSystemPrompt, type Effort, type ProviderId } from './providers.js'
import { checkGroup, groupRepos, type ProjectRepo } from './repo.js'
import type { EmployeeState } from './state.js'
import type { StudioStore } from './store.js'
import { commitDelivery, createCopy, currentBranch, deliveryDiff, headOf, mergeOffice, nothingToMerge, officeChanges, officeDiff, officePending, removeOffice, repoRoot, type FileChange, type Office } from './worktree.js'

/** Cuánto se espera a que una CLI se ponga a trabajar tras el Enter antes de dárselo otra vez. */
const SUBMIT_RETRIES_MS = [1200, 2000, 3000, 4000, 5000, 6000, 8000]
/** Cuánto se espera, como mucho, a ver en pantalla lo que se le escribió antes de dar Enter. */
const ECHO_WAIT_MS = 20_000
/** Cuánto debe llevar alguien sin cambiar de estado para que se pueda guardar en su oficina. */
const EDIT_CALM_MS = 5000

/** Una CLI que se cierra antes de esto tras pedirle retomar, es que no tenía conversación que retomar. */

const exists = (path: string) => access(path).then(() => true, () => false)

export type Caller = { kind: 'boss' } | { kind: 'employee'; id: string }

export const BOSS_ID = 'jefe'

export interface StudioSnapshot extends BoardSnapshot {
  repo: string
  /** Los repositorios del proyecto cuando su carpeta agrupa varios; sin esto, el proyecto es un solo repositorio. */
  repos?: ProjectRepo[]
  bossOnline: boolean
  /** Lo que el tablero dice de cada empleado: esperando a alguien, llevando su entrega o jugando. */
  hints: Record<string, NonNullable<ReturnType<Board['hint']>> | { state: 'gaming' }>
  /** Quiénes volverían a su escritorio si se retoma (al abrir un proyecto que quedó con gente). */
  resumable: string[]
  /** % de contexto usado por agente, si se conoce. */
  context: Record<string, number>
  /** Desde qué % se manda a descansar. */
  burnoutAt: number
}

export interface StudioOptions {
  repo: string
  /**
   * `repo` no es un repositorio: es una carpeta que agrupa varios (sus
   * subcarpetas directas con `.git`) y se abre como un solo proyecto. El jefe
   * trabaja en ella y cada tarea pertenece a uno de sus repositorios.
   */
  group?: boolean
  manager: EmployeeManager
  detect: () => Promise<CliStatus[]>
  store?: StudioStore
  /** URL del servidor MCP para un token. */
  mcpUrl: (token: string) => string
  /** Pausa entre escribirle un mensaje a una CLI y darle Enter. */
  submitDelayMs?: number
  /** Cuánto debe llevar alguien sin cambiar de estado para que el usuario pueda guardar en su oficina. */
  editCalmMs?: number
  /** Cuánto espera hablar_con la respuesta del empleado. */
  replyTimeoutMs?: number
  /** Expedientes, manuales e historial del estudio; compartidos entre proyectos. */
  library?: Library
  /** Ejecutables por proveedor (pruebas). */
  binaries?: Partial<Record<ProviderId, string>>
  /** Carpeta del usuario donde viven las cuentas de cada CLI (pruebas). */
  home?: string
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
  /** Envíos en curso a cada terminal, para que no se encimen. */
  private sending = new Map<string, Promise<void>>()
  /** Quién falta por dejar su corte al cerrar la app. */
  private cuts = new Map<string, () => void>()
  /** Quién está jugando videojuegos (limpiando contexto) y por qué. */
  private resting = new Map<string, string>()
  /** Pasó el umbral a media tarea: descansa en cuanto termine su turno. */
  private restPending = new Set<string>()
  /** Hasta cuándo cuenta cada quien como «ocupado» para editar en su oficina: se recorre con cada cambio de estado. */
  private settledAt = new Map<string, number>()
  /** Contexto con que arrancó cada sesión. */
  private contextFloor = new Map<string, number>()
  /** Uso de la cuenta que reporta cada CLI por su barra de estado: `proveedor|carpeta` → dato. */
  private reported = new Map<string, AccountUsage>()
  private handoffWaiters = new Map<string, () => void>()
  private unsubscribe: () => void
  root = ''
  /** Los repositorios del proyecto cuando su carpeta agrupa varios; vacío si el proyecto es un solo repositorio. */
  repos: ProjectRepo[] = []
  readonly library: Library
  journal!: Journal

  constructor(private opts: StudioOptions) {
    super()
    this.library = opts.library ?? new Library(opts.store)
    const saved = opts.store?.load(opts.repo)
    this.board = saved ? Board.restore(saved) : new Board()
    const onState = (id: string, state: EmployeeState) => {
      if (!this.isOurs(id)) return
      // Entre paso y paso un agente pasa un instante por «en espera»: para editar no cuenta como quieto hasta que dure.
      this.settledAt.set(id, Date.now() + (this.opts.editCalmMs ?? EDIT_CALM_MS))
      // Se puso a trabajar: la conversación que retomó sí existía.
      if (state === 'working') this.resumeTries.delete(id)
      if (state === 'idle') {
        this.flush(id)
        if (this.restPending.has(id)) this.tryRest(id)
      }
      this.changed()
    }
    const onExit = (id: string) => {
      if (!this.isOurs(id) || this.resting.has(id) || this.restarting.has(id)) return
      // Quiso retomar su conversación y la CLI se cerró sin haber llegado a servir: no había qué
      // retomar. Entra de nuevo, desde cero. No se mide con reloj: antes de cerrarse pudo quedarse
      // un rato en una pantalla de primer arranque (confiar en la carpeta) esperando al usuario.
      const tried = this.resumeTries.delete(id)
      const l = this.launches.get(id)
      if (tried && l) {
        const journal = this.journal.path(id)
        const note = T`La app se reabrió y tu conversación anterior no se pudo retomar. Lee tu bitácora (${journal}) y sigue donde ibas (${id === BOSS_ID ? 'leer_proyecto' : 'leer_tarea'}).`
        // Igual que al volver de descansar: se retira la terminal cerrada y entra otra en la misma oficina.
        Promise.resolve(this.opts.manager.get(id) ? this.opts.manager.fire(id, this.root) : undefined)
          .then(() => this.launch(id, l, [note], false))
          .then(() => this.fact(id, T`no se pudo retomar su conversación; entró con una nueva`))
          .catch((err) => {
            this.board.offline(id)
            this.emit('notice', T`${this.nameOf(id)} no pudo volver: ${(err as Error).message}`)
          })
          .finally(() => this.changed())
        return
      }
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
    if (this.opts.group) {
      // La raíz solo agrupa repositorios: no es uno, y ahí no se usa git.
      this.root = resolve(this.opts.repo)
      this.repos = await groupRepos(this.root)
    } else this.root = await repoRoot(this.opts.repo)
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

  /** Lo que el usuario le escribe a alguien desde su panel: va a su terminal tal cual, con el mismo cuidado al enviar. */
  say(id: string, text: string) {
    const msg = oneLine(text)
    if (!msg) return
    if (!this.opts.manager.isLive(id)) throw new RuleError(T`${this.nameOf(id)} no está en la oficina.`)
    this.board.say('usuario', id, msg)
    ;(this.queues.get(id) ?? this.queues.set(id, []).get(id)!).push(msg)
    this.flush(id)
    this.changed()
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
    // Ya está en su prompt: si venía de retomar, la conversación cargó bien.
    this.resumeTries.delete(id)
    // De uno en uno: texto, pausa y Enter. Las CLIs toman una ráfaga de teclas como pegado, y un
    // Enter que llega dentro de la ráfaga se queda como salto de línea en vez de enviar (Codex lo
    // hace con textos largos). Tampoco se encima el siguiente mensaje antes del Enter del anterior.
    const batch = q.splice(0)
    const pause = this.opts.submitDelayMs ?? 700
    const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))
    const previous = this.sending.get(id) ?? Promise.resolve()
    // Un envío que falle no debe dejar mudos a los siguientes.
    this.sending.set(id, previous.catch(() => {}).then(async () => {
      for (const msg of batch) {
        if (!this.opts.manager.isLive(id)) return
        this.opts.manager.write(id, msg)
        const since = Date.now()
        await wait(pause)
        // El Enter espera a que la CLI termine de recibir el texto: si llega antes, lo toma como parte
        // de lo pegado (un salto de línea) y el mensaje se queda sin enviar. Cuánto tarda depende de la
        // máquina y del largo (el manual del puesto son más de mil caracteres; en una máquina lenta,
        // varios segundos), así que no se mide con reloj: se espera a verlo en su pantalla y a que
        // esta deje de moverse (o, si nunca se queda quieta, a que lleve un rato ahí).
        let shownAt = 0
        while (pause > 0 && Date.now() - since < ECHO_WAIT_MS) {
          if (!shownAt && this.opts.manager.shows(id, msg)) shownAt = Date.now()
          if (shownAt && (this.opts.manager.quietFor(id) >= 500 || Date.now() - shownAt >= 1500)) break
          await wait(100)
        }
        if (!this.opts.manager.isLive(id)) return
        // El Enter puede no entrar a la primera (a Codex le pasa con textos largos: lo toma como un
        // renglón más). Si la CLI no se puso a trabajar, se le da de nuevo, como haría una persona.
        let working = false
        const onState = (who: string, state: EmployeeState) => {
          if (who === id && state === 'working') working = true
        }
        this.opts.manager.on('state', onState)
        try {
          this.opts.manager.write(id, '\r')
          // Se insiste cada vez más espaciado, hasta medio minuto: en una máquina lenta los primeros
          // Enter aún caen dentro del pegado.
          for (const ms of pause > 0 ? SUBMIT_RETRIES_MS : []) {
            await wait(ms)
            const state = this.opts.manager.get(id)?.state
            // Trabajando, detenido en una pregunta o fuera: ya no hay Enter que dar.
            if (working || state !== 'idle') break
            this.opts.manager.write(id, '\r')
          }
        } finally {
          this.opts.manager.off('state', onState)
        }
        await wait(Math.min(pause, 300))
      }
    }))
  }

  // ── Lanzar agentes ───────────────────────────────────────────────────────

  get bossOnline() {
    return this.opts.manager.isLive(BOSS_ID)
  }

  /** Lanza (o relanza) la CLI de un agente con sus mensajes de arranque. */
  private async launch(id: string, l: Launch, extra: string[] | ((emp: Employee) => string[]) = [], resume = false) {
    // Su terminal anterior se cerró pero sigue apuntada: se retira, o no dejaría entrar a nadie con ese id
    // (un jefe cuya CLI se cerró no se podía volver a contratar).
    if (this.opts.manager.get(id) && !this.opts.manager.isLive(id)) await this.opts.manager.fire(id, this.root)
    this.contextFloor.delete(id)
    const cli = this.opts.cli
    // Retomar es seguir la conversación de antes; si no, nace una nueva (así vuelve de descansar, con el contexto limpio).
    const session = resume ? { id: id === BOSS_ID ? this.board.boss?.sessionId : this.board.staff.find((m) => m.id === id)?.sessionId, resume: true } : undefined
    const req = { ...l.req, session }
    // Toda terminal recibe el comando, también las que hablan MCP: su token la identifica igual.
    const emp = await this.opts.manager.hire(cli ? { ...req, env: { ...req.env, ORQUEST_URL: cli.url(l.token), ORQUEST_LANG: getLang() }, path: [cli.dir] } : req)
    this.offices.set(id, emp.office)
    // De aquí en adelante, relanzar reusa la misma oficina.
    l.req = { ...l.req, office: emp.office }
    this.launches.set(id, l)
    // La conversación cambia cada vez que nace una nueva: se guarda la vigente.
    if (id === BOSS_ID && this.board.boss) this.board.boss.sessionId = emp.sessionId
    else this.board.returned(id, emp.sessionId)
    if (emp.resumed) this.resumeTries.add(id)
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
  async hireBoss(req: { name?: string; provider: ProviderId; model?: string; effort?: Effort; account?: string; goal: string }) {
    if (this.bossOnline) throw new RuleError(T`El jefe ya está en su oficina.`)
    await this.launchBoss(req, false)
    this.fact(BOSS_ID, T`contratado como jefe (${req.provider}${req.model ? ` ${req.model}` : ''}). Objetivo: ${req.goal}`)
    this.changed()
  }

  private async launchBoss(req: { name?: string; provider: ProviderId; model?: string; effort?: Effort; account?: string; goal: string }, resume: boolean) {
    const adapter = getProvider(req.provider)
    const env = accountEnv(req.provider, req.account, this.opts.home)
    const channel = this.channel(req.provider)
    if (!channel) throw new RuleError(T`${adapter.name} aún no sabe conectarse a las herramientas de Orquest; elige otro jefe.`)
    this.board.goal = req.goal
    const token = this.newToken({ kind: 'boss' })
    // Con varios repositorios la raíz no tiene rama: cada uno lleva la suya.
    const office = { path: this.root, branch: this.grouped ? '' : await currentBranch(this.root) }
    const name = bossName(req.name)
    const prompt = bossPrompt(req.goal, this.journal.path(BOSS_ID), channel, name, this.group)
    const viaArg = takesSystemPrompt(adapter)
    const owner: JournalOwner = { id: BOSS_ID, name: name ?? T`Jefe`, role: 'jefe', provider: req.provider, model: req.model }
    await this.journal.open(owner)
    const previous = this.board.tasks.length > 0
    const journal = this.journal.path(BOSS_ID)
    // Para que `launch` sepa qué conversación retomar; si es nuevo, parte sin ninguna.
    this.board.boss = { name, provider: req.provider, model: req.model, effort: req.effort, account: req.account, sessionId: resume ? this.board.boss?.sessionId : undefined }
    await this.launch(BOSS_ID, {
      token,
      owner,
      req: {
        id: BOSS_ID,
        provider: req.provider,
        model: req.model,
        effort: req.effort,
        env,
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
        ? T`La app se reabrió y retomaste tu sesión. Tu equipo también vuelve a su escritorio. Revisa el corte que dejaste en tu bitácora (${journal}) y sigue donde ibas (leer_proyecto). ${planReminder()} ${askReminder()}`
        : resume
          ? T`La app se reabrió. Tu equipo vuelve a su escritorio. Lee tu bitácora (${journal}) y sigue donde ibas (leer_proyecto). ${planReminder()} ${askReminder()}`
          : previous
            ? T`Retomas un proyecto con tablero previo; los empleados anteriores ya no están. Lee tu bitácora (${journal}) y el proyecto, levanta de nuevo a quien haga falta y reasigna sus tareas abiertas. ${planReminder()}`
            : T`Proyecto abierto. Lee el proyecto y los expedientes y propón la plantilla.`,
    ], resume)
  }

  /** Cuándo se intentó retomar la conversación de cada quien: si su CLI se cierra enseguida, entra con una nueva. */
  /** Quiénes están retomando su conversación y aún no se sabe si existía. */
  private resumeTries = new Set<string>()
  private resuming = false
  /**
   * Al reabrir un proyecto: el jefe y quienes seguían contratados vuelven a su
   * escritorio, cada uno retomando su conversación si su CLI sabe hacerlo.
   * Quien no pueda volver se queda fuera y se avisa; no frena a los demás.
   */
  async resume(): Promise<void> {
    const boss = this.board.boss
    if (this.resuming || !boss || this.bossOnline) return
    this.resuming = true
    try {
      await this.resumeAll(boss)
    } finally {
      this.resuming = false
      this.changed()
    }
  }

  private async resumeAll(boss: BossRecord): Promise<void> {
    try {
      await this.launchBoss({ ...boss, goal: this.board.goal }, true)
      this.fact(BOSS_ID, T`volvió al reabrir la app`)
    } catch (err) {
      this.emit('notice', T`No se pudo retomar al jefe: ${(err as Error).message}`)
      this.changed()
      return
    }
    for (const m of this.board.staff) {
      const slot = this.board.slots.find((s) => s.employeeId === m.id)
      // Sin oficina guardada o sin su carpeta ya no hay a dónde volver; quien sigue en su escritorio no se toca.
      if (m.gone || !slot || !m.office || this.opts.manager.isLive(m.id) || !(await exists(m.office.path))) continue
      try {
        await this.hireSlot(slot, m)
        this.fact(m.id, T`volvió al reabrir la app`)
      } catch (err) {
        this.emit('notice', T`No se pudo retomar a ${m.name}: ${(err as Error).message}`)
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
    if (!channel) warnings.push(T`${adapter.name} no se conecta a las herramientas de Orquest ni aplica permisos por puesto; el jefe le habla por terminal.`)
    else if (channel === 'cli') warnings.push(T`${adapter.name} usa las herramientas de Orquest con el comando orquest; no aplica permisos por puesto.`)
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
        env: accountEnv(slot.provider, slot.account, this.opts.home),
        role: slot.role,
        repo: this.root,
        office: again?.office ?? (await this.groupOffice(id)),
        binary: this.opts.binaries?.[slot.provider],
        extraArgs: this.connectArgs(slot.provider, token, manual.permissions),
      },
      intro: (office) => [employeePrompt(manual, office, { name: slot.name, journal: journalPath }, channel, this.group)],
    }, (e) =>
      again
        ? [e.resumed ? T`La app se reabrió y retomaste tu sesión. Revisa el corte que dejaste en tu bitácora (${journalPath}) y sigue donde ibas (leer_tarea).` : T`La app se reabrió. Lee tu bitácora (${journalPath}) y sigue donde ibas (leer_tarea).`]
        : before.length ? [T`Antes que tú, en ${slot.role} estuvo ${before.join('; ')}. Lee su bitácora: es tu capacitación (su traspaso es su versión; los hechos son de Orquest).`] : [],
    !!again)
    if (again) return { id, name: slot.name, warnings: [...warnings, ...emp.warnings] }
    this.board.hired(slot, { id, role: slot.role, provider: slot.provider, effort: slot.effort, account: slot.account, sessionId: emp.sessionId, office: emp.office })
    this.fact(id, `${T`contratado como ${slot.role} (${slot.provider}${slot.model ? ` ${slot.model}` : ''})`}${before.length ? `; ${T`antes en el puesto: ${before.map((b) => b.split(':')[0]).join(', ')}`}` : ''}`)
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
    if (id === BOSS_ID) return T`el jefe`
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
    void this.rest(id, T`contexto al ${pct ?? '?'}%`).catch((err) => this.emit('notice', T`No se pudo reiniciar a ${this.nameOf(id)}: ${(err as Error).message}`))
  }

  /**
   * Burnout: el agente escribe su traspaso, se cierra su CLI y se relanza con
   * contexto limpio en la misma oficina; al volver lee su bitácora. En el mapa
   * se va a jugar videojuegos mientras tanto. Lo que dura es lo que tarda.
   */
  /**
   * Antes de cerrar la app: cada agente deja su corte (qué hacía, qué quedó a
   * medias, qué sigue) con escribir_traspaso, para retomar desde ahí al volver.
   * Espera a todos o hasta `timeoutMs`. A quien está detenido esperando al
   * usuario no se le pide: no puede contestar. `onProgress` avisa cada avance.
   */
  async checkpoint(timeoutMs: number, onProgress?: (p: { asked: string[]; done: string[] }) => void): Promise<{ asked: string[]; done: string[] }> {
    const ids = [BOSS_ID, ...this.board.staff.map((m) => m.id)].filter((id) => this.opts.manager.isLive(id) && this.opts.manager.get(id)?.state !== 'blocked')
    const done: string[] = []
    const report = () => onProgress?.({ asked: ids.map((id) => this.nameOf(id)), done: done.map((id) => this.nameOf(id)) })
    report()
    if (!ids.length) return { asked: [], done: [] }
    const all = Promise.all(ids.map((id) => new Promise<void>((resolve) => {
      this.cuts.set(id, () => {
        if (!done.includes(id)) done.push(id)
        this.fact(id, T`dejó su corte al cerrarse la app`)
        report()
        resolve()
      })
      this.notify(id, T`La app se va a cerrar. Detente y deja tu corte ahora con escribir_traspaso: qué estabas haciendo, qué quedó a medias (archivos, comandos), decisiones y tu siguiente paso exacto. Al reabrir retomarás desde ahí. No hagas nada más después.`)
    })))
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([all, new Promise<void>((resolve) => (timer = setTimeout(resolve, timeoutMs)))])
    clearTimeout(timer)
    this.cuts.clear()
    this.changed()
    return { asked: ids, done }
  }

  /** Quiénes volverían si se retoma el proyecto: nombres, con el jefe primero. Vacío si no hay a quién retomar. */
  get resumable(): string[] {
    // Mientras el jefe siga contratado y su terminal esté cerrada (al reabrir la app, o porque
    // se cerró por error), se puede retomar.
    if (this.resuming || this.bossOnline || !this.board.boss) return []
    return [T`Jefe`, ...this.board.staff.filter((m) => !m.gone && m.office && this.board.slots.some((x) => x.employeeId === m.id)).map((m) => m.name)]
  }

  /** El usuario prefirió no retomar: se queda sin jefe hasta que contrate uno. */
  skipResume() {
    this.changed()
  }

  /** Vuelve a sentar en su escritorio a alguien cuya CLI se cerró (no a quien despediste). */
  async bringBack(id: string) {
    if (this.opts.manager.isLive(id)) throw new RuleError(T`${this.nameOf(id)} ya está en la oficina.`)
    const m = this.board.staff.find((x) => x.id === id)
    const slot = this.board.slots.find((x) => x.employeeId === id)
    if (!m || !slot) throw new RuleError(T`No existe el empleado ${id}.`)
    if (m.gone) throw new RuleError(T`${m.name} fue despedido. Para ese puesto, pídele al jefe que proponga a alguien.`)
    if (!m.office || !(await exists(m.office.path))) throw new RuleError(T`${m.name} ya no tiene oficina (su carpeta no está). Pídele al jefe que lo levante de nuevo.`)
    await this.hireSlot(slot, m)
    this.fact(id, T`volvió a su escritorio (lo trajo el usuario)`)
    this.notify(BOSS_ID, T`${m.name} (${id}) volvió a su escritorio.`)
    this.changed()
  }

  async rest(id: string, reason = T`lo mandó el usuario`) {
    const l = this.launches.get(id)
    if (!l) throw new RuleError(T`${this.nameOf(id)} no está en la oficina.`)
    if (this.resting.has(id)) throw new RuleError(T`${this.nameOf(id)} ya está descansando.`)
    this.resting.set(id, reason)
    this.emit('notice', T`${l.owner.name} se va a jugar videojuegos (${reason}).`)
    this.changed()
    try {
      const wrote = new Promise<void>((ok) => this.handoffWaiters.set(id, ok))
      const timeout = new Promise<void>((ok) => setTimeout(ok, this.opts.handoffTimeoutMs ?? 180_000).unref?.())
      this.notify(
        id,
        T`Te toca descansar (${reason}). Antes, escribe tu traspaso con escribir_traspaso: qué hiciste, decisiones, pendientes, trampas del código y tu siguiente paso. Al volver lo leerás con el contexto limpio.`,
      )
      await Promise.race([wrote, timeout])
      this.handoffWaiters.delete(id)
      this.fact(id, T`se fue a jugar videojuegos para limpiar contexto (${reason})`)
      // Se cierra y se relanza igual: mismo proveedor, modelo, manual, oficina y token.
      this.queues.delete(id)
      await this.opts.manager.fire(id, this.root)
      await this.launch(id, l, [
        T`Volviste de descansar con el contexto limpio. Lee tu bitácora (${this.journal.path(id)}) y sigue donde ibas (${id === BOSS_ID ? 'leer_proyecto' : 'leer_tarea'}).`,
      ])
      this.fact(id, T`volvió de descansar`)
    } finally {
      this.resting.delete(id)
      this.changed()
    }
  }

  private restarting = new Set<string>()
  /**
   * Reinicia la terminal de alguien que quedó atorado: se cierra su CLI y entra otra en la
   * misma oficina, con una conversación nueva, sus instrucciones y su bitácora. Lo que el
   * usuario le había escrito y no alcanzó a llegar se le entrega al volver.
   */
  async restart(id: string) {
    const l = this.launches.get(id)
    if (!l) throw new RuleError(T`${this.nameOf(id)} no está en la oficina.`)
    if (this.resting.has(id)) throw new RuleError(T`${this.nameOf(id)} está descansando: espera a que vuelva.`)
    this.restarting.add(id)
    try {
      if (this.opts.manager.get(id)) await this.opts.manager.fire(id, this.root)
      await this.launch(id, l, [
        T`Tu terminal se reinició y esta es una conversación nueva. Lee tu bitácora (${this.journal.path(id)}) y sigue donde ibas (${id === BOSS_ID ? 'leer_proyecto' : 'leer_tarea'}).`,
      ])
      this.fact(id, T`el usuario reinició su terminal`)
    } finally {
      this.restarting.delete(id)
      this.changed()
    }
  }

  private office(id: string): Office {
    // Su oficina sigue en disco aunque su CLI esté cerrada: con la guardada se puede ver su diff e integrar su entrega.
    const o = this.offices.get(id) ?? this.opts.manager.get(id)?.office ?? this.board.staff.find((m) => m.id === id)?.office
    if (!o) throw new RuleError(T`${this.nameOf(id)} no tiene oficina guardada: se contrató antes de que Orquest la recordara. Tráelo de vuelta desde Plantilla o pídele al jefe que lo levante de nuevo.`)
    return o
  }

  // ── Varios repositorios ──────────────────────────────────────────────────
  // La carpeta del proyecto puede no ser un repositorio sino agrupar varios. Entonces cada
  // tarea pertenece a uno, la oficina de cada empleado es una carpeta con una copia (worktree)
  // por repositorio en que tiene tarea, y entregar e integrar pasan por el de la tarea.

  private get grouped() {
    return this.repos.length > 0
  }

  /** Lo que se les cuenta a los agentes de un proyecto así; undefined si es un solo repositorio. */
  private get group(): GroupInfo | undefined {
    return this.grouped ? { root: this.root, repos: this.repos } : undefined
  }

  /** Vuelve a mirar la carpeta: pudo llegar un repositorio después de abrir el proyecto. Devuelve los que aún no tienen commits. */
  private async scanRepos(): Promise<string[]> {
    const { repos, empty } = await checkGroup(this.root)
    const ready = repos.filter((r) => !empty.includes(r.name))
    if (ready.length) this.repos = ready
    return empty
  }

  /** El repositorio que el jefe nombra en una tarea. Si la carpeta solo trae uno, no hace falta decirlo. */
  private async repoNamed(name: unknown): Promise<ProjectRepo> {
    const wanted = String(name ?? '').trim().replace(/\\/g, '/').replace(/^\.?\/+|\/+$/g, '')
    const names = () => this.repos.map((r) => r.name).join(', ')
    if (!wanted) {
      if (this.repos.length === 1) return this.repos[0]
      throw new RuleError(T`Este proyecto agrupa varios repositorios: di a cuál pertenece la tarea con repositorio (${names()}). Una tarea, un repositorio.`)
    }
    const find = () => {
      const exact = this.repos.find((r) => r.name === wanted) ?? this.repos.find((r) => r.name.toLowerCase() === wanted.toLowerCase())
      if (exact) return exact
      // Agrupado en una subcarpeta (`mocks/simulador`): también vale solo su carpeta, si no hay otra igual.
      const last = this.repos.filter((r) => r.name.split('/').pop()!.toLowerCase() === wanted.toLowerCase())
      return last.length === 1 ? last[0] : undefined
    }
    let repo = find()
    if (!repo) {
      const empty = await this.scanRepos()
      if (empty.some((n) => n.toLowerCase() === wanted.toLowerCase())) {
        throw new RuleError(T`El repositorio ${wanted} todavía no tiene ningún commit: de él parte la copia de cada empleado. Pide al usuario que haga el primero.`)
      }
      repo = find()
    }
    if (!repo) throw new RuleError(T`No existe el repositorio "${wanted}" en este proyecto. Los que hay: ${names()}.`)
    return repo
  }

  /** Carpeta del repositorio al que pertenece una tarea: el del proyecto o, si agrupa varios, el suyo. */
  private repoOf(t: Task): string {
    if (!this.grouped) return this.root
    const repo = this.repos.find((r) => r.name === t.repo)
    if (!repo) throw new RuleError(t.repo ? T`El repositorio ${t.repo} de ${t.id} ya no está en el proyecto.` : T`${t.id} no dice a qué repositorio pertenece.`)
    return repo.path
  }

  /**
   * Dónde se trabaja una tarea: la oficina de quien la lleva o, si el proyecto
   * agrupa repositorios, su copia del de la tarea, dentro de esa oficina.
   */
  private workplace(t: Task): Office {
    const office = this.office(t.assignee)
    if (!this.grouped) return office
    this.repoOf(t)
    return { path: join(office.path, t.repo!), branch: office.branch }
  }

  /**
   * La oficina de alguien en un proyecto que agrupa repositorios: una carpeta,
   * no un worktree. Sus copias llegan con sus tareas, no al contratarlo.
   */
  private async groupOffice(id: string): Promise<Office | undefined> {
    if (!this.grouped) return undefined
    // El mismo id que le queda en la plantilla viva: sirve de carpeta y de rama.
    const safe = id.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const path = join(this.root, '.orquest', 'oficinas', safe)
    await mkdir(path, { recursive: true })
    return { path, branch: `orquest/${safe}` }
  }

  /** Deja lista, en la oficina de alguien, su copia de un repositorio; si ya la tiene, no la toca. */
  private async ensureCopy(employeeId: string, repo: ProjectRepo): Promise<void> {
    const office = this.office(employeeId)
    try {
      await createCopy(repo.path, join(office.path, repo.name), office.branch)
    } catch (err) {
      throw new RuleError(T`No se pudo preparar la copia de ${repo.name} para ${this.nameOf(employeeId)}: ${(err as Error).message}`)
    }
  }

  /** Lo mismo para la tarea que lleva: su copia del repositorio de esa tarea. */
  private async copyFor(t: Task): Promise<void> {
    const repo = this.repos.find((r) => r.name === t.repo)
    if (repo) await this.ensureCopy(t.assignee, repo)
  }

  /** Las copias que hay en una oficina: una por repositorio en que se le asignó tarea. */
  private async copiesIn(office: { path: string; branch: string }): Promise<{ name: string; repo: string; office: Office }[]> {
    const found: { name: string; repo: string; office: Office }[] = []
    for (const r of this.repos) {
      const path = join(office.path, r.name)
      if (await exists(join(path, '.git'))) found.push({ name: r.name, repo: r.path, office: { path, branch: office.branch } })
    }
    return found
  }

  /** Dónde tiene cambios alguien en un proyecto así: sus copias; el jefe, los repositorios mismos. */
  private async copiesOf(id: string): Promise<{ name: string; repo: string; office: Office }[]> {
    if (id === BOSS_ID) return this.repos.map((r) => ({ name: r.name, repo: r.path, office: { path: r.path, branch: '' } }))
    return this.copiesIn(this.office(id))
  }

  /**
   * Archivos que alguien tiene tocados, para su panel. Con varios repositorios
   * salen los de cada copia, con el nombre del repositorio al frente de la ruta.
   */
  async changes(id: string): Promise<FileChange[]> {
    if (!this.grouped) return officeChanges(this.office(id))
    const all: FileChange[] = []
    for (const c of await this.copiesOf(id)) {
      for (const f of await officeChanges(c.office)) all.push({ ...f, path: `${c.name}/${f.path}` })
    }
    return all
  }

  /** El diff de uno de esos archivos. */
  async fileDiff(id: string, path: string): Promise<string> {
    if (!this.grouped) return officeDiff(this.office(id), path)
    // El nombre de un repositorio puede traer «/» (`mocks/simulador`): se busca el que encabeza la ruta.
    const copy = (await this.copiesOf(id)).filter((c) => path.startsWith(`${c.name}/`)).sort((a, b) => b.name.length - a.name.length)[0]
    return copy ? officeDiff(copy.office, path.slice(copy.name.length + 1)) : ''
  }

  /** Las capturas de alguien en un proyecto que agrupa repositorios: las de cada copia, con el repositorio al frente. */
  async captures(id: string): Promise<Capture[]> {
    const all: Capture[] = []
    for (const c of await this.copiesOf(id)) {
      const main = id === BOSS_ID ? undefined : await headOf(c.repo).catch(() => undefined)
      for (const shot of await listCaptures(c.office.path, [], main)) all.push({ ...shot, path: `${c.name}/${shot.path}` })
    }
    return all.sort((a, b) => b.at - a.at)
  }

  /** El aviso a quien esperaba una tarea que se acaba de integrar. */
  private releasedNote(t: Task, r: Task, branch: string): string {
    const report = t.delivery?.report ?? ''
    if (!this.grouped) {
      return T`Tu dependencia ${t.id} (${t.title}, de ${t.assignee}) ya está integrada en ${branch}. Tráela a tu oficina con: git merge ${branch}. Su reporte: ${report}. Tu tarea ${r.id} está lista; usa leer_tarea.`
    }
    // Del mismo repositorio se trae a su copia; de otro no hay nada que traer: se lee donde quedó.
    return r.repo === t.repo
      ? T`Tu dependencia ${t.id} (${t.title}, de ${t.assignee}) ya está integrada en ${branch} de ${t.repo}. Tráela a tu copia de ese repositorio (${this.workplace(r).path}) con: git merge ${branch}. Su reporte: ${report}. Tu tarea ${r.id} está lista; usa leer_tarea.`
      : T`Tu dependencia ${t.id} (${t.title}, de ${t.assignee}) ya está integrada en ${branch} del repositorio ${t.repo}, que no es el de tu tarea: no hay nada que traer a tu copia. Léela en ${this.repoOf(t)}, sin modificar nada ahí. Su reporte: ${report}. Tu tarea ${r.id} (${r.repo}) está lista; usa leer_tarea.`
  }

  // ── Herramientas MCP ─────────────────────────────────────────────────────

  async call(caller: Caller, tool: string, args: Record<string, unknown>): Promise<string> {
    if (tool === 'escribir_traspaso') {
      const id = caller.kind === 'boss' ? BOSS_ID : caller.id
      try {
        const done = await this.writeHandoff(id, String(args.traspaso ?? ''))
        // Si era el corte que se pidió al cerrar la app, ya cumplió.
        this.cuts.get(id)?.()
        return done
      } finally {
        this.changed()
      }
    }
    const boss = BOSS_TOOLS.has(tool)
    const employee = EMPLOYEE_TOOLS.has(tool)
    if (!boss && !employee) throw new RuleError(T`Herramienta desconocida: ${tool}`)
    if (boss && caller.kind !== 'boss') throw new RuleError(T`${tool} es una herramienta del jefe.`)
    if (employee && caller.kind !== 'employee') throw new RuleError(T`${tool} es una herramienta de empleado.`)
    try {
      return caller.kind === 'boss' ? await this.bossTool(tool, args) : await this.employeeTool(caller.id, tool, args)
    } finally {
      this.changed()
    }
  }

  private async writeHandoff(id: string, text: string): Promise<string> {
    const o = this.owner(id)
    if (!o) throw new RuleError(T`No tienes bitácora.`)
    try {
      await this.journal.handoff(o, text)
    } catch (err) {
      throw new RuleError((err as Error).message)
    }
    this.handoffWaiters.get(id)?.()
    return this.resting.has(id) ? T`Traspaso guardado en ${this.journal.path(id)}. Ahora descansas; al volver lo leerás.` : T`Traspaso guardado en ${this.journal.path(id)}.`
  }

  private async bossTool(tool: string, a: Record<string, any>): Promise<string> {
    const b = this.board
    switch (tool) {
      case 'leer_proyecto': {
        if (!this.grouped) return JSON.stringify({ ...this.projectView(), planes: await this.plansView() }, null, 2)
        await this.scanRepos()
        const repositorios = await Promise.all(this.repos.map(async (r) => ({ nombre: r.name, ruta: r.path, rama: await currentBranch(r.path).catch(() => undefined) })))
        return JSON.stringify({ ...this.projectView(), repositorios, planes: await this.plansView() }, null, 2)
      }

      case 'guardar_plan': {
        const plan = await savePlan(this.root, String(a.titulo ?? ''), String(a.contenido ?? ''))
        this.fact(BOSS_ID, T`guardó el plan "${plan.title}" (${plan.file})`)
        this.changed()
        return T`Plan guardado en ${join(this.root, plan.file)}. El usuario lo ve en Planes. Guárdalo otra vez con el mismo título cuando cambie.`
      }

      case 'leer_expedientes': {
        const clis = await this.opts.detect()
        const lib = this.library
        const accounts = this.accounts()
        return JSON.stringify(
          clis.map((c) => {
            const d = lib.dossier(c.id)
            return {
              proveedor: c.id,
              nombre: c.name,
              disponible: c.installed && c.session !== false,
              version: c.version,
              conecta_con_orquest: !!this.channel(c.id),
              // Solo si hay más de una: así el jefe puede repartir gente entre cuentas.
              cuentas: accounts.filter((x) => x.provider === c.id).length > 1
                ? accounts.filter((x) => x.provider === c.id).map((x) => ({
                    cuenta: x.main ? 'principal' : x.dir,
                    uso: x.usage ? Object.fromEntries(x.usage.windows.map((w) => [w.label, `${Math.round(w.used)}%`])) : T`sin datos`,
                  }))
                : undefined,
              puestos_permitidos: d.allowedRoles ?? T`todos`,
              si_no_se_permite: d.enforce === 'block' ? T`el juego lo rechaza` : T`se permite con aviso`,
              notas_del_usuario: d.notes || undefined,
              historial_contigo: lib.stats(c.id),
              por_modelo: Object.fromEntries(
                lib.models(c.id).map((m) => {
                  const md = lib.dossier(c.id, m)
                  return [m || T`(por defecto)`, { ...lib.stats(c.id, m), ...(md.model ? { puestos_permitidos: md.allowedRoles ?? T`todos`, notas_del_usuario: md.notes || undefined } : {}) }]
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
            account: p.cuenta && p.cuenta !== 'principal' ? String(p.cuenta) : undefined,
            reason: p.motivo,
          })),
          ok,
          this.rule,
        )
        this.emit('notice', T`El jefe propone una plantilla de ${slots.length} puestos. Ábrela en Plantilla.`)
        const warned = slots.filter((x) => x.warning)
        return `${T`Propuesta enviada al usuario (${slots.map((s) => `${s.id} ${s.name}, ${s.role}/${s.provider}`).join(', ')}). Espera su aprobación; se te avisará.`}${warned.length ? ` ${T`Avisos del expediente: ${warned.map((x) => x.warning).join(' ')}`}` : ''}`
      }

      case 'levantar_empleado': {
        const slot = b.takeSlot(String(a.puesto))
        const { id, name, warnings } = await this.hireSlot(slot)
        return `${T`Contratado ${name} (id ${id}; ${slot.role}, ${slot.provider}). Entra por Recepción y va a su escritorio.`}${warnings.length ? ` ${T`Avisos: ${warnings.join(' ')}`}` : ''}`
      }

      case 'asignar_tarea': {
        let t: Task
        if (a.tarea_id) {
          t = b.task(String(a.tarea_id))
          if (a.empleado && a.empleado !== t.assignee) t = b.reassign(t.id, String(a.empleado))
          if (this.grouped && a.repositorio) t = b.setRepo(t.id, (await this.repoNamed(a.repositorio)).name)
          if (a.depende_de) t = b.setDeps(t.id, a.depende_de)
          // Quien la lleva ahora necesita su copia del repositorio de la tarea (a quien ya se fue no se le arma otra).
          if (this.grouped && b.member(t.assignee).online) await this.copyFor(t)
        } else {
          if (!a.empleado || !a.titulo) throw new RuleError(T`Para crear una tarea indica empleado y titulo.`)
          // Con varios repositorios la tarea es de uno, y su copia se prepara antes de apuntarla: no queda una tarea sin dónde trabajarla.
          const repo = this.grouped ? await this.repoNamed(a.repositorio) : undefined
          if (repo && b.member(String(a.empleado)).online) await this.ensureCopy(b.member(String(a.empleado)).id, repo)
          t = b.assign({ assignee: String(a.empleado), title: String(a.titulo), description: String(a.descripcion ?? ''), deps: a.depende_de, repo: repo?.name })
        }
        this.fact(t.assignee, t.deps.length ? T`${t.id} asignada: ${t.title} (depende de ${t.deps.join(', ')})` : T`${t.id} asignada: ${t.title}`)
        if (t.status === 'ready') {
          this.notify(t.assignee, this.grouped ? T`Tienes una tarea nueva (${t.id}: ${t.title}) en el repositorio ${t.repo}: se trabaja en ${this.workplace(t).path}. Usa leer_tarea.` : T`Tienes una tarea nueva (${t.id}: ${t.title}). Usa leer_tarea.`)
        } else if (t.status === 'waiting') {
          this.notify(t.assignee, T`Se te asignó ${t.id} (${t.title}); espera a ${b.openDeps(t).map((d) => T`${d.id} de ${d.assignee}`).join(', ')}. Se te avisará al liberarse.`)
        }
        const where = this.grouped ? ` ${T`Repositorio: ${t.repo}.`}` : ''
        return `${t.status === 'waiting' ? T`${t.id} → ${t.assignee}: esperando a ${b.openDeps(t).map((d) => d.id).join(', ')}.` : `${t.id} → ${t.assignee}: ${t.status}.`}${where}`
      }

      case 'preguntar_al_usuario': {
        const { asked, repeated } = b.ask(
          (a.preguntas as any[]).map((q) => ({ text: q.pregunta, options: q.opciones, recommended: q.recomendada, blocks: q.detiene, tasks: q.tareas })),
        )
        this.changed()
        const pending = b.openQuestions().map((q) => q.id).join(', ')
        return [
          asked.length ? T`Quedaron pendientes: ${asked.map((q) => `${q.id} (${q.text})`).join('; ')}.` : '',
          repeated.length ? T`Ya estaban pendientes y no se repiten: ${[...new Set(repeated.map((q) => q.id))].join(', ')}.` : '',
          T`El usuario las ve en su chat con tus sugerencias y Orquest te avisa cuando conteste cada una. No las repitas con decir_al_usuario ni las des por contestadas. Mientras, avanza lo que no dependa de ellas. Esperando al usuario ahora: ${pending}.`,
        ].filter(Boolean).join(' ')
      }
      case 'cerrar_pregunta': {
        const answer = String(a.respuesta ?? '').trim()
        const q = answer ? b.answer(String(a.pregunta), answer) : b.withdraw(String(a.pregunta), String(a.motivo ?? ''))
        this.changed()
        const pending = b.openQuestions().map((x) => x.id)
        return `${answer ? T`${q.id} quedó contestada: "${q.answer}".` : T`${q.id} se retiró: ${q.note}.`} ${pending.length ? T`Sigues esperando al usuario en ${pending.join(', ')}.` : T`Ya no esperas nada del usuario.`}`
      }
      case 'decir_al_usuario': {
        const text = String(a.mensaje ?? '').trim()
        if (!text) throw new RuleError(T`El mensaje va vacío.`)
        b.say(BOSS_ID, 'usuario', text)
        this.changed()
        // Una pregunta mandada como mensaje se pierde en el chat: se le dice cómo dejarla pendiente.
        return /[¿?]/.test(text)
          ? T`Entregado al usuario. Tu mensaje trae una pregunta: si necesitas su respuesta para seguir, mándala también con preguntar_al_usuario (con opciones, tu recomendada y qué detiene); así queda pendiente a su vista y no se pierde en el chat.`
          : T`Entregado al usuario.`
      }
      case 'hablar_con': {
        const to = b.member(String(a.empleado))
        if (!this.opts.manager.isLive(to.id)) throw new RuleError(T`${to.id} ya no está en la oficina.`)
        b.say(BOSS_ID, to.id, String(a.mensaje))
        const wait = a.esperar_respuesta !== false
        this.notify(to.id, wait ? T`El jefe dice: ${a.mensaje} (contesta con reportar_estado, campo respuesta)` : T`El jefe dice: ${a.mensaje}`)
        if (!wait) return T`Mensaje entregado.`
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
        return answer ?? T`${to.id} aún no responde; su respuesta te llegará como mensaje cuando la dé.`
      }

      case 'revisar_entrega': {
        const decision = String(a.decision)
        if (decision === 'qa') {
          return this.bossTool('mandar_a_qa', { tarea: a.tarea, empleado_qa: a.empleado_qa, instrucciones: a.notas ?? '' })
        }
        if (decision !== 'aprobar' && decision !== 'regresar') throw new RuleError(T`decision debe ser aprobar, regresar o qa.`)
        if (decision === 'regresar' && !a.notas) throw new RuleError(T`Para regresar una entrega di qué falta en notas.`)
        const t = b.review(String(a.tarea), decision === 'aprobar' ? 'approve' : 'return', a.notas ? String(a.notas) : '')
        if (t.status !== 'approved') this.record(t, 'returned', String(a.notas ?? ''))
        if (t.status === 'approved') {
          // Sin cambios que integrar (una prueba, una revisión): se cierra aquí, no va a la bandeja.
          if (t.delivery?.commit && (await nothingToMerge(this.repoOf(t), t.delivery.commit))) {
            const released = b.closeEmpty(t.id)
            this.record(t, 'merged')
            for (const r of released) this.notify(r.assignee, T`Tu dependencia ${t.id} (${t.title}, de ${t.assignee}) quedó cerrada. Su reporte: ${t.delivery.report ?? ''}. Tu tarea ${r.id} está lista; usa leer_tarea.`)
            return `${T`${t.id} aprobada y cerrada: no traía cambios que integrar, así que no pasa por la bandeja del usuario.`}${released.length ? ` ${T`Se liberó: ${released.map((r) => r.id).join(', ')}.`}` : ''}`
          }
          this.emit('notice', T`${t.id} (${t.title}) espera tu aprobación para integrarse. Ábrela en Entregas.`)
          return T`${t.id} aprobada; queda en la bandeja del usuario para integrarse.`
        }
        this.notify(t.assignee, T`Tu entrega ${t.id} regresó: ${a.notas}. Usa leer_tarea y vuelve a entregar.`)
        return T`${t.id} regresó al escritorio de ${t.assignee}.`
      }

      case 'mandar_a_qa': {
        const review = b.toQa(String(a.tarea), String(a.empleado_qa), String(a.instrucciones ?? ''))
        // QA revisa en su propia copia del repositorio de esa tarea.
        if (this.grouped) await this.copyFor(review)
        this.fact(review.assignee, T`${review.id} asignada: ${review.title}`)
        this.notify(review.assignee, T`Tienes una revisión de QA (${review.id}). Usa leer_tarea.`)
        return T`${review.id} creada para ${review.assignee}.`
      }
    }
    throw new RuleError(T`Herramienta desconocida: ${tool}`)
  }

  private async employeeTool(id: string, tool: string, a: Record<string, any>): Promise<string> {
    const b = this.board
    switch (tool) {
      case 'leer_tarea': {
        const t = b.start(id)
        if (!t) {
          const waiting = b.tasks.find((x) => x.assignee === id && x.status === 'waiting')
          return waiting
            ? T`Tu tarea ${waiting.id} (${waiting.title}) espera a ${b.openDeps(waiting).map((d) => T`${d.id} de ${d.assignee}`).join(', ')}. Se te avisará.`
            : T`No tienes tarea asignada. Espera instrucciones del jefe.`
        }
        // Por si su copia ya no está (alguien borró la carpeta): se repone antes de mandarlo a trabajar ahí.
        if (this.grouped) await this.copyFor(t)
        return JSON.stringify(this.taskView(t), null, 2)
      }

      case 'preguntar_al_jefe': {
        b.say(id, BOSS_ID, String(a.pregunta))
        this.notify(BOSS_ID, T`${this.nameOf(id)} (${id}) pregunta: ${a.pregunta} (responde con hablar_con)`)
        return T`Pregunta enviada al jefe; su respuesta llegará a tu terminal.`
      }

      case 'reportar_estado': {
        const map: Record<string, 'working' | 'blocked' | 'idle'> = { trabajando: 'working', bloqueado: 'blocked', esperando: 'idle' }
        const state = map[String(a.estado)]
        if (!state) throw new RuleError(T`estado debe ser trabajando, bloqueado o esperando.`)
        if (this.opts.manager.isLive(id)) this.opts.manager.report(id, state)
        if (a.nota) b.say(id, 'tablero', String(a.nota))
        if (a.respuesta) {
          b.say(id, BOSS_ID, String(a.respuesta))
          const waiter = this.waiters.get(id)
          this.waiters.delete(id)
          if (waiter) waiter(String(a.respuesta))
          else this.notify(BOSS_ID, T`${id} responde: ${a.respuesta}`)
        }
        if (state === 'blocked') this.emit('notice', a.nota ? T`${id} está bloqueado: ${a.nota}.` : T`${id} está bloqueado.`)
        return T`Estado registrado.`
      }

      case 'entregar': {
        const t = b.current(id)
        if (!t) b.deliver(id, { report: '', screenshots: [] }) // lanza el motivo
        const member = b.member(id)
        const manual = this.library.manual(member.role)
        const shots = (a.capturas as string[] | undefined) ?? []
        if (manual.requireScreenshots && t!.kind === 'work' && !shots.length) {
          throw new RuleError(T`El manual de ${member.role} pide capturas en la entrega. ${manual.delivery}`)
        }
        let diff: { commit?: string; diffStat?: string } = {}
        // El commit va en su copia del repositorio de la tarea y se mide contra la rama activa de ese repositorio.
        if (t!.kind === 'work') diff = await commitDelivery(this.workplace(t!), `${t!.id}: ${t!.title}`, await headOf(this.repoOf(t!)).catch(() => undefined))
        const verdict = a.veredicto === 'pasa' ? 'pass' : a.veredicto === 'no_pasa' ? 'fail' : undefined
        const { task, reviewed } = b.deliver(id, {
          report: String(a.reporte),
          screenshots: shots,
          verdict,
          ...diff,
        })
        if (task.kind === 'work') this.record(task, 'delivered', String(a.reporte))
        if (task.kind === 'qa' && reviewed) {
          this.fact(id, verdict === 'fail' ? T`${task.id}: revisé ${reviewed.id}, no pasa — ${String(a.reporte).slice(0, 300)}` : T`${task.id}: revisé ${reviewed.id}, pasa — ${String(a.reporte).slice(0, 300)}`)
          if (verdict === 'fail') {
            this.record(reviewed, 'qa_fail', String(a.reporte))
            this.notify(reviewed.assignee, T`QA rechazó ${reviewed.id}: ${a.reporte}. Usa leer_tarea, corrige y vuelve a entregar.`)
            this.notify(BOSS_ID, T`QA rechazó ${reviewed.id}; regresó a ${reviewed.assignee}.`)
          } else {
            this.notify(BOSS_ID, T`QA aprobó ${reviewed.id}. Revísala con revisar_entrega.`)
          }
        } else {
          this.notify(BOSS_ID, T`${this.nameOf(id)} (${id}) entregó ${task.id} (${task.title}). Revísala con revisar_entrega o mándala a QA.`)
        }
        return T`Entrega recibida. Espera instrucciones.`
      }
    }
    throw new RuleError(T`Herramienta desconocida: ${tool}`)
  }

  // ── Historial ────────────────────────────────────────────────────────────

  /** Anota en el expediente de quien hizo la tarea cómo le fue. */
  private record(t: Task, outcome: Outcome, detail = '') {
    const m = this.board.staff.find((x) => x.id === t.assignee)
    if (!m || t.kind !== 'work') return
    const what: Record<Outcome, string> = { delivered: T`entregó`, qa_fail: T`QA rechazó`, returned: T`regresó`, merged: T`integrada` }
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
      T`El usuario aprobó la plantilla: ${approved.map((s) => `${s.id} ${s.role} (${s.provider}${s.model ? ` ${s.model}` : ''})`).join(', ')}. Levanta a cada uno con levantar_empleado y asígnales tareas.`,
    )
    this.changed()
    return approved
  }

  /** El usuario aprueba el merge de una entrega aprobada por el jefe. */
  async merge(taskId: string): Promise<Task[]> {
    const t = this.board.task(taskId)
    if (t.status !== 'approved') throw new RuleError(T`${t.id} no está aprobada por el jefe.`)
    // Se integra en el repositorio de la tarea, a su rama activa.
    const repo = this.repoOf(t)
    const office = this.workplace(t)
    const result = await mergeOffice(repo, office, `${t.id}: ${t.title} (${t.assignee})`)
    if (!result.ok) {
      this.notify(BOSS_ID, T`No se pudo integrar ${t.id}: ${result.reason} Pide a ${t.assignee} que integre la rama base y entregue de nuevo, o regrésala.`)
      this.changed()
      throw new RuleError(result.reason)
    }
    const released = this.board.merged(t.id)
    this.record(t, 'merged')
    // Si quien la hizo ya no trabaja aquí, era lo último que detenía su oficina.
    const author = this.board.staff.find((m) => m.id === t.assignee)
    if (author?.gone && author.office) await this.vacate(author.id, author.office)
    const branch = await currentBranch(repo)
    for (const r of released) this.notify(r.assignee, this.releasedNote(t, r, branch))
    this.notify(BOSS_ID, `${T`El usuario integró ${t.id}.`}${released.length ? ` ${T`Se liberó: ${released.map((r) => r.id).join(', ')}.`}` : ''}`)
    this.changed()
    return released
  }

  userReturn(taskId: string, notes: string) {
    const t = this.board.userReturn(taskId, notes)
    this.record(t, 'returned', notes)
    this.notify(t.assignee, T`El usuario regresó ${t.id}: ${notes}. Usa leer_tarea y vuelve a entregar.`)
    this.notify(BOSS_ID, T`El usuario regresó ${t.id} a ${t.assignee}: ${notes}`)
    this.changed()
  }

  sayToBoss(text: string) {
    this.board.say('usuario', BOSS_ID, text)
    // Si el jefe sigue esperando respuestas, se le recuerda con cada mensaje: que no las dé por contestadas ni las olvide.
    const open = this.board.openQuestions()
    const waiting = open.length
      ? ` ${T`Sigues esperando al usuario en ${open.map((q) => `${q.id} (${q.text})`).join('; ')}: si este mensaje contesta alguna, regístralo con cerrar_pregunta; si no, recuérdale en una línea que siguen pendientes.`}`
      : ''
    this.notify(BOSS_ID, `${T`El usuario dice: ${text} (contéstale con decir_al_usuario; no ve tu terminal)`}${waiting}`)
    this.changed()
  }

  /** El usuario contesta una pregunta del jefe: queda en el tablero, en la conversación y se le avisa al jefe. */
  answerQuestion(id: string, text: string) {
    const q = this.board.answer(id, text)
    this.board.say('usuario', BOSS_ID, `${q.id} · ${q.text} → ${q.answer}`)
    const open = this.board.openQuestions()
    this.notify(
      BOSS_ID,
      `${T`El usuario contestó ${q.id} (${q.text}): ${q.answer}.`}${q.tasks.length ? ` ${T`Esperaban esta respuesta: ${q.tasks.join(', ')}.`}` : ''} ${open.length ? T`Sigues esperándolo en ${open.map((x) => x.id).join(', ')}.` : T`Ya no esperas nada de él: sigue con el trabajo.`}`,
    )
    this.changed()
    return q
  }

  async diff(taskId: string): Promise<string> {
    const t = this.board.task(taskId)
    if (!t.delivery?.commit) return ''
    const repo = this.repoOf(t)
    const office = this.workplace(t)
    // La oficina de quien ya no trabaja aquí pudo desocuparse: sus commits siguen en el repo y se leen desde ahí.
    const from = (await exists(office.path)) ? office : { ...office, path: repo }
    return deliveryDiff(from, t.delivery.commit, await headOf(repo).catch(() => undefined))
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
    return { ...this.board.snapshot(), repo: this.root, ...(this.grouped ? { repos: this.repos } : {}), bossOnline: this.bossOnline || this.resting.has(BOSS_ID), resumable: this.resumable, hints, context, burnoutAt: this.burnoutAt }
  }

  /** Lo que reporta la barra de estado de una CLI (Claude Code): % de contexto. */
  status(caller: Caller, body: unknown) {
    const id = caller.kind === 'boss' ? BOSS_ID : caller.id
    const pct = (body as { context_window?: { used_percentage?: number } })?.context_window?.used_percentage
    if (typeof pct === 'number' && this.opts.manager.get(id)) this.opts.manager.setContext(id, Math.round(pct))
    const usage = parseClaudeLimits(body)
    const who = id === BOSS_ID ? this.board.boss : this.board.staff.find((m) => m.id === id)
    if (usage && who) this.reported.set(`${who.provider}|${who.account ?? ''}`, usage)
  }

  /** Las cuentas de esta máquina con su uso: el que deja cada CLI en disco o el que acaba de reportar. */
  accounts() {
    return listAccounts(this.opts.home).map((a) => ({ ...a, usage: this.reported.get(`${a.provider}|${a.main ? '' : a.dir}`) ?? a.usage }))
  }

  /**
   * Guarda lo que el usuario editó en la oficina de alguien. Nunca mientras su
   * agente trabaja (ni en el instante en que parece quieto entre dos pasos): no
   * escriben los dos a la vez. Y solo si el archivo sigue como se abrió.
   */
  async saveFile(id: string, path: string, text: string, stamp: string): Promise<{ stamp: string }> {
    const emp = this.opts.manager.get(id)
    if (!emp) throw new RuleError(T`Ya no está en la oficina.`)
    this.refuseIfBusy(id)
    const next = await writeText(emp.office.path, path, text, stamp)
    this.fact(id, T`el usuario editó ${path}`)
    return { stamp: next }
  }

  /** Trabaja, o dejó de hacerlo hace un instante: entre paso y paso un agente parece quieto. */
  private refuseIfBusy(id: string): void {
    const emp = this.opts.manager.get(id)
    if (!emp) return
    const busy = emp.state === 'working' || emp.state === 'starting' || Date.now() < (this.settledAt.get(id) ?? 0)
    if (busy) throw new RuleError(T`${this.nameOf(id)} está trabajando: espera a que termine para guardar. Tus cambios siguen en el editor.`)
  }

  // ── El explorador de la barra: la carpeta del proyecto (no la oficina de alguien).

  /** Lo que hay en una carpeta del proyecto. Las oficinas y la memoria del equipo (`.orquest`) no salen aquí. */
  projectTree(dir: string): Promise<FileEntry[]> {
    return listDir(this.root, dir, ['.orquest'])
  }

  projectFile(path: string): Promise<FileText> {
    return readText(this.root, path)
  }

  /** Lo cambiado o nuevo en el proyecto según git, para marcarlo en el árbol. */
  projectChanges(): Promise<FileChange[]> {
    return this.grouped ? this.changes(BOSS_ID) : officeChanges({ path: this.root, branch: '' })
  }

  /**
   * Guarda lo que el usuario editó en la carpeta del proyecto, que es donde se
   * integran las entregas y donde trabaja el jefe: no mientras él trabaja, y
   * solo si el archivo sigue como se abrió.
   */
  async saveProjectFile(path: string, text: string, stamp: string): Promise<{ stamp: string }> {
    if (path.split(/[\\/]+/).includes('.orquest')) throw new RuleError(T`Lo de .orquest no se edita aquí: son las oficinas y la memoria del equipo.`)
    this.refuseIfBusy(BOSS_ID)
    return { stamp: await writeText(this.root, path, text, stamp) }
  }

  formatProjectFile(path: string, text: string): Promise<string> {
    return formatText(this.root, path, text)
  }

  /** Bitácora de un agente, para la UI. */
  readJournal(id: string): Promise<string> {
    return this.journal.read(id)
  }

  /** El usuario despide a alguien: su CLI se cierra y su oficina se desocupa si no deja nada pendiente; su rama y su tablero quedan. */
  async fire(id: string) {
    this.fact(id, T`despedido; su bitácora queda para capacitar a quien ocupe el puesto`)
    this.launches.delete(id)
    // Con cuánto contexto usado se va: se ve después en Plantilla, entre los despedidos.
    const context = this.opts.manager.get(id)?.context
    const office = id === BOSS_ID ? undefined : (this.opts.manager.get(id)?.office ?? this.board.staff.find((m) => m.id === id)?.office)
    if (this.opts.manager.get(id)) await this.opts.manager.fire(id, this.root)
    // Despedido no vuelve al reabrir la app.
    if (id === BOSS_ID) this.board.boss = undefined
    else this.board.dismiss(id, context)
    if (office) await this.vacate(id, office)
    if (id !== BOSS_ID) this.notify(BOSS_ID, T`El usuario despidió a ${this.nameOf(id)} (${id}). Reasigna sus tareas abiertas si hace falta; quien ocupe su puesto recibirá su bitácora.`)
    this.changed()
  }

  /**
   * Desocupa la oficina de quien ya no trabaja aquí, si con eso no se pierde
   * nada: lo que pesa ahí (dependencias, compilados) no es trabajo. Si dejó
   * archivos sin entregar o entregas sin integrar, se conserva y se avisa.
   * Sus capturas se copian antes a `.orquest/capturas/<id>`.
   */
  private async vacate(id: string, office: { path: string; branch: string }) {
    try {
      if (!(await exists(office.path))) return
      // Con varios repositorios hay una copia por cada uno en que trabajó; con uno solo, la oficina es la copia.
      const shots = join(this.root, '.orquest', 'capturas', id)
      const copies = this.grouped
        ? (await this.copiesIn(office)).map((c) => ({ ...c, shots: join(shots, c.name) }))
        : [{ repo: this.root, office, shots }]
      const left = { files: 0, commits: 0 }
      for (const c of copies) {
        const pending = await officePending(c.repo, c.office)
        left.files += pending.files
        left.commits += pending.commits
      }
      if (left.files || left.commits) {
        const files = left.files ? (left.files === 1 ? T`${left.files} archivo sin entregar` : T`${left.files} archivos sin entregar`) : ''
        const commits = left.commits ? (left.commits === 1 ? T`${left.commits} commit sin integrar` : T`${left.commits} commits sin integrar`) : ''
        const what = files && commits ? T`${files} y ${commits}` : files || commits
        this.fact(id, T`su oficina se conserva: tiene ${what}`)
        this.emit('notice', T`La oficina de ${this.nameOf(id)} se conserva: tiene ${what} (${office.path}).`)
        return
      }
      // Sus capturas suelen estar en carpetas que git ignora: se guardan antes de quitar la oficina.
      const attached = this.board.tasks.filter((t) => t.assignee === id).flatMap((t) => [...(t.delivery?.screenshots ?? []), ...(t.qa?.screenshots ?? [])])
      let saved = 0
      for (const c of copies) {
        saved += await archiveCaptures(c.office.path, c.shots, attached, await headOf(c.repo).catch(() => undefined))
        await removeOffice(c.repo, c.office, true)
      }
      // La carpeta que juntaba las copias se va con ellas, si no le queda nada dentro.
      if (this.grouped) await rmdir(office.path).catch(() => {})
      this.fact(id, saved ? T`su oficina se desocupó: todo lo suyo ya estaba integrado; sus ${saved} capturas quedaron en ${shots}` : T`su oficina se desocupó: todo lo suyo ya estaba integrado`)
    } catch (err) {
      this.emit('notice', T`No se pudo desocupar la oficina de ${this.nameOf(id)}: ${(err as Error).message}`)
    }
  }

  /** Los planes guardados del jefe, el más reciente primero. */
  plans() {
    return listPlans(this.root)
  }

  /** Lo mismo, como lo lee el jefe: para tenerlos a mano cada vez que mira el proyecto. */
  private async plansView() {
    return (await this.plans()).map((p) => ({ titulo: p.title, archivo: join(this.root, p.file), guardado_hace_min: Math.max(0, Math.round((Date.now() - p.at) / 60000)) }))
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
        repositorio: t.repo,
        estado: t.status,
        depende_de: t.deps,
        regresada: t.returns,
        entrega: t.delivery && { reporte: t.delivery.report, cambios: t.delivery.diffStat, veredicto: t.delivery.verdict },
        qa: t.qa && { veredicto: t.qa.verdict, reporte: t.qa.report },
      })),
      esperan_al_usuario: b.inbox().map((t) => t.id),
      // Lo que le preguntaste y aún no contesta: sigues dependiendo de él en esto.
      preguntas_pendientes: b.openQuestions().map((q) => ({
        id: q.id,
        pregunta: q.text,
        opciones: q.options.length ? q.options : undefined,
        recomendada: q.recommended,
        detiene: q.blocks,
        tareas: q.tasks.length ? q.tasks : undefined,
        esperando_desde_hace_min: Math.max(0, Math.round((Date.now() - q.askedAt) / 60000)),
      })),
      respuestas_del_usuario: b.questions.filter((q) => q.status === 'answered').slice(-8).map((q) => ({ id: q.id, pregunta: q.text, respuesta: q.answer })),
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
      // Con varios repositorios: de cuál es la tarea, en qué carpeta de su oficina se trabaja y dónde leer los demás.
      ...(this.grouped
        ? {
            repositorio: t.repo,
            carpeta: this.workplace(t).path,
            otros_repositorios_solo_lectura: this.repos.filter((r) => r.name !== t.repo).map((r) => ({ repositorio: r.name, ruta: r.path })),
          }
        : {}),
      dependencias: t.deps.map((d) => {
        const dep = b.task(d)
        return { id: dep.id, titulo: dep.title, de: dep.assignee, repositorio: dep.repo, estado: dep.status, reporte: dep.delivery?.report, cambios: dep.delivery?.diffStat }
      }),
      revisa_a:
        t.reviewOf &&
        (() => {
          const r = b.task(t.reviewOf!)
          return { id: r.id, titulo: r.title, de: r.assignee, repositorio: r.repo, rama: this.offices.get(r.assignee)?.branch, reporte: r.delivery?.report, cambios: r.delivery?.diffStat }
        })(),
      historial: t.history.slice(-8).map((h) => h.text),
      ultimo_qa: t.qa && { veredicto: t.qa.verdict, reporte: t.qa.report },
      entrega_esperada: (() => {
        const m = this.library.manual(b.member(t.assignee).role)
        const base = t.kind === 'qa' ? T`entregar con veredicto (pasa / no_pasa) y reporte con pasos para reproducir cada fallo.` : m.delivery
        return m.requireScreenshots && t.kind === 'work' ? `${base} ${T`Capturas obligatorias.`}` : base
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

/** El nombre que el usuario le puso al jefe, limpio; sin nombre se queda como "Jefe". */
function bossName(raw?: string): string | undefined {
  const name = raw?.trim().replace(/\s+/g, ' ')
  if (!name) return undefined
  if (name.length > 24) throw new RuleError(T`El nombre del jefe es muy largo (máximo 24 caracteres).`)
  return name
}

export const BOSS_TOOLS = new Set([
  'leer_proyecto',
  'leer_expedientes',
  'proponer_plantilla',
  'levantar_empleado',
  'asignar_tarea',
  'decir_al_usuario',
  'preguntar_al_usuario',
  'cerrar_pregunta',
  'guardar_plan',
  'hablar_con',
  'revisar_entrega',
  'mandar_a_qa',
])
export const EMPLOYEE_TOOLS = new Set(['leer_tarea', 'preguntar_al_jefe', 'reportar_estado', 'entregar'])
