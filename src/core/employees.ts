import type { Activity } from './activity.js'
import { T } from './i18n.js'
import { resolveLaunch } from './launch.js'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { delimiter } from 'node:path'
import { getProvider, type Effort, type ProviderId } from './providers.js'
import { ScreenReader, type EmployeeState } from './state.js'
import { createOffice, removeOffice, type Office } from './worktree.js'

/** Lo mínimo de node-pty que usamos; permite probar sin terminal real. */
export interface Pty {
  pid: number
  onData(cb: (data: string) => void): unknown
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): unknown
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
}

export type Spawner = (
  file: string,
  args: string[],
  opts: { cwd: string; cols: number; rows: number; env: Record<string, string> },
) => Pty

export interface HireRequest {
  provider: ProviderId
  model?: string
  effort?: Effort
  /** Puesto: backend, frontend, qa… En fase 3 trae su manual. */
  role: string
  systemPrompt?: string
  /** Repositorio del proyecto. */
  repo: string
  /** Ejecutable a usar; por defecto el primero del adaptador. */
  binary?: string
  /** Argumentos extra (p. ej. conexión MCP). */
  extraArgs?: string[]
  /** Oficina ya existente: el jefe trabaja en el repo, sin worktree propio. */
  office?: Office
  /** Id fijo; por defecto se genera de puesto y proveedor. */
  id?: string
  /** Variables propias de esta terminal (p. ej. cómo llama a Orquest). */
  env?: Record<string, string>
  /** Carpetas que van al frente de su PATH. */
  path?: string[]
  /** Retomar su conversación anterior en vez de empezar una nueva (ver ProviderAdapter.sessions). */
  session?: { id?: string; resume: boolean }
}

export interface Employee {
  id: string
  provider: ProviderId
  model?: string
  effort?: Effort
  role: string
  office: Office
  state: EmployeeState
  pid: number
  warnings: string[]
  exitCode?: number
  /** % de contexto usado, si se conoce. */
  context?: number
  /** Id de su conversación en la CLI, si esta deja fijarlo: con él se retoma. */
  sessionId?: string
  /** true si arrancó retomando su conversación anterior. */
  resumed?: boolean
}

export interface ManagerEvents {
  hired: [Employee]
  data: [id: string, data: string]
  state: [id: string, state: EmployeeState]
  exit: [id: string, exitCode: number]
  context: [id: string, pct: number]
  /** Qué hace quien está trabajando; null cuando deja de trabajar. */
  activity: [id: string, activity: Activity | null]
}

/** Una pantalla conocida que detiene a una CLI y espera al usuario. `permission`: cualquier otra pregunta. */
export type BlockKind = 'trust' | 'offer' | 'update' | 'login' | 'permission'
const BLOCKS: [BlockKind, RegExp][] = [
  ['trust', /trust (this|the files in this|the contents of this) (folder|directory)|do you trust|one you trust/i],
  // Claude Code ofrece pasarse a otro modelo: «Yes, try it» / «Not now».
  ['offer', /yes, try it/i],
  ['update', /update available|skip until next version/i],
  ['login', /select login method|sign in to continue|log in to continue/i],
]
/**
 * Lo que el usuario puede contestar desde la app, sin abrir la terminal: la opción del menú
 * que se elige en cada caso. Confiar: «sí, confío en esta carpeta» (vistas en Claude Code y
 * en Codex). Oferta de otro modelo: «ahora no», que deja el modelo con que se le contrató.
 */
const ANSWERS: Partial<Record<BlockKind, RegExp>> = {
  trust: /yes, i trust|trust and continue|yes, proceed/i,
  offer: /^\W*(\d+\.\s*)?not now\s*$/i,
  // El «Sí» de una sola vez; no el «sí, y no vuelvas a preguntar», que deja reglas guardadas en el proyecto.
  // En Codex el primero es «Yes, proceed».
  permission: /^\W*(\d+[.)]\s*)?(yes(, proceed)?|allow|approve)\b(?!,)/i,
}
/**
 * Lo que sí es una pregunta de permiso de la CLI (correr un comando, editar o crear un archivo).
 * Cualquier otro menú también detiene al agente, pero a ese no se le contesta solo.
 */
const APPROVAL_PROMPTS = [/do you want to (proceed|make this edit|create|run)/i, /allow (this )?command\?/i, /would you like to (run|make|apply)\b/i, /approve\?/i]
/** Renglón del menú donde está el cursor. */
const MENU_CURSOR = /^\s*[❯›>]\s/
/** Cuánto debe llevar el prompt a la vista para escribirle aunque la pantalla siga moviéndose. */
const PROMPT_STEADY_MS = 2500

interface Live {
  employee: Employee
  pty: Pty
  reader: ScreenReader
  buffer: string
  lastDataAt: number
  /** Desde cuándo se ve su prompt sin interrupción, mientras la pantalla no se queda quieta. */
  promptSince?: number
  activityTimer?: ReturnType<typeof setTimeout>
  activityKey?: string
  quietTimer?: ReturnType<typeof setTimeout>
}

/**
 * Lleva la plantilla viva: cada contratación crea una oficina (worktree),
 * lanza la CLI del proveedor en su PTY y sigue su estado.
 */
export class EmployeeManager extends EventEmitter<ManagerEvents> {
  private live = new Map<string, Live>()

  constructor(
    private spawn: Spawner,
    private opts: {
      /** Salida que se guarda por empleado para quien abra la terminal después. */
      scrollback?: number
      /** Sin salida durante este tiempo, un empleado que trabajaba pasa a idle. */
      quietMs?: number
      /** Pantalla quieta este tiempo antes de escribirle un mensaje. */
      settleMs?: number
      cols?: number
      rows?: number
      env?: Record<string, string>
    } = {},
  ) {
    super()
  }

  async hire(req: HireRequest): Promise<Employee> {
    const adapter = getProvider(req.provider)
    const id = (req.id ?? `${req.role}-${req.provider}-${randomUUID().slice(0, 6)}`).toLowerCase().replace(/[^a-z0-9-]/g, '-')
    if (this.live.has(id)) throw new Error(T`Ya existe el empleado ${id}`)
    const ownOffice = !req.office
    const office = req.office ?? (await createOffice(req.repo, id))
    const launch = { model: req.model, effort: req.effort, systemPrompt: req.systemPrompt }

    // TERM dice qué terminal tiene enfrente la CLI. Abierta desde el menú de inicio, la app no hereda
    // ninguna, y sin ella Claude Code dibuja con símbolos de reserva (su prompt es «>» en vez de «❯»):
    // Orquest no reconocía el prompt y nunca le entregaba nada. La terminal de la app es un xterm.
    const env: Record<string, string> = { ...(process.env as Record<string, string>), TERM: 'xterm-256color', COLORTERM: 'truecolor', ...this.opts.env, ...req.env, ORQUEST_EMPLOYEE_ID: id }
    if (req.path?.length) {
      // En Windows la variable suele llamarse Path; se respeta la que ya exista.
      const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
      env[key] = [...req.path, env[key]].filter(Boolean).join(delimiter)
    }

    // Conversación: nueva con id propio (para poder retomarla) o la de antes.
    let sessionId: string | undefined
    let resumed = false
    let sessionArgs: string[] = []
    const ses = adapter.sessions
    if (ses && req.session?.resume && (req.session.id || !ses.start)) {
      sessionArgs = ses.resume(req.session.id)
      sessionId = req.session.id
      resumed = true
    } else if (ses?.start) {
      sessionId = randomUUID()
      sessionArgs = ses.start(sessionId)
    }

    // En Windows no se puede lanzar el .cmd de npm en una terminal: se arranca lo que él arrancaría.
    const command = await resolveLaunch(req.binary ? [req.binary] : adapter.binaries, [...sessionArgs, ...adapter.buildArgs(launch), ...(req.extraArgs ?? [])], env[Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'])
    let pty: Pty
    try {
      pty = this.spawn(command.file, command.args, {
        cwd: office.path,
        cols: this.opts.cols ?? 120,
        rows: this.opts.rows ?? 32,
        env,
      })
    } catch (err) {
      if (ownOffice) await removeOffice(req.repo, office, true).catch(() => {})
      throw err
    }

    const employee: Employee = {
      id,
      provider: req.provider,
      model: req.model,
      effort: req.effort,
      role: req.role,
      office,
      state: 'starting',
      pid: pty.pid,
      warnings: adapter.unsupported(launch),
      sessionId,
      resumed,
    }
    const entry: Live = { employee, pty, reader: undefined as unknown as ScreenReader, buffer: '', lastDataAt: Date.now() }
    entry.reader = new ScreenReader(adapter.screen, {
      cols: this.opts.cols ?? 120,
      rows: this.opts.rows ?? 32,
      onChange: (s) => this.setState(entry, s),
      onContext: (pct) => this.setContext(id, pct),
    })
    this.live.set(id, entry)

    pty.onData((data) => this.onData(entry, data))
    pty.onExit(({ exitCode }) => {
      clearTimeout(entry.quietTimer)
      entry.reader.dispose()
      employee.exitCode = exitCode
      // Si ya se despidió o se relanzó con el mismo id, esta CLI vieja no avisa nada.
      if (this.live.get(id) !== entry) return
      this.setState(entry, 'exited')
      this.emit('exit', id, exitCode)
    })

    this.emit('hired', employee)
    return employee
  }

  private onData(entry: Live, data: string) {
    const max = this.opts.scrollback ?? 200_000
    entry.buffer = (entry.buffer + data).slice(-max)
    entry.lastDataAt = Date.now()
    this.emit('data', entry.employee.id, data)

    entry.reader.feed(data)
    this.tellActivity(entry)

    clearTimeout(entry.quietTimer)
    const recheck = () => {
      const s = entry.employee.state
      if (s !== 'working' && s !== 'starting') return
      const now = entry.reader.current() ?? 'idle'
      this.setState(entry, now)
      // Sigue viéndose trabajando sin que la pantalla se mueva: se vuelve a mirar hasta que
      // el indicador se dé por viejo (ver ScreenReader.working).
      if (now === 'working') entry.quietTimer = setTimeout(recheck, 1500)
    }
    entry.quietTimer = setTimeout(recheck, this.opts.quietMs ?? 4000)
  }

  /** Avisa qué está haciendo quien trabaja, sin repetir ni inundar: a lo más un aviso cada 400 ms. */
  private tellActivity(entry: Live) {
    if (entry.activityTimer) return
    entry.activityTimer = setTimeout(() => {
      entry.activityTimer = undefined
      const now = entry.employee.state === 'working' ? entry.reader.activity() : null
      // Los segundos cambian cada rato: no cuentan como novedad, solo qué hace y con qué.
      const key = now ? `${now.label}|${now.detail ?? ''}` : ''
      if (key === entry.activityKey) return
      entry.activityKey = key
      this.emit('activity', entry.employee.id, now)
    }, 400)
  }

  private setState(entry: Live, state: EmployeeState) {
    if (entry.employee.state === state || entry.employee.state === 'exited') return
    entry.employee.state = state
    this.emit('state', entry.employee.id, state)
    this.tellActivity(entry)
  }

  list(): Employee[] {
    return [...this.live.values()].map((l) => l.employee)
  }

  get(id: string): Employee | undefined {
    return this.live.get(id)?.employee
  }

  /** Salida acumulada, para pintar la terminal al abrir el drawer. */
  scrollback(id: string): string {
    return this.live.get(id)?.buffer ?? ''
  }

  /** % de contexto usado: de la pantalla o de lo que reporta la CLI. */
  setContext(id: string, pct: number) {
    const e = this.live.get(id)
    if (!e || e.employee.context === pct) return
    e.employee.context = pct
    this.emit('context', id, pct)
  }

  /**
   * Estado que el propio agente reporta (herramienta reportar_estado). Se ve
   * enseguida; en cuanto la pantalla cambia (p. ej. vuelve su prompt), manda la pantalla.
   */
  report(id: string, state: 'working' | 'blocked' | 'idle') {
    this.setState(this.mustGet(id), state)
  }

  /**
   * Listo para recibir un mensaje: está en espera y se ve su prompt. Con
   * patrones sin comprobar contra la CLI real basta con que esté en espera.
   */
  /** Cuánto lleva su pantalla sin cambiar, en ms (enorme si ya no está). */
  quietFor(id: string): number {
    const e = this.live.get(id)
    return e ? Date.now() - e.lastDataAt : Number.MAX_SAFE_INTEGER
  }

  /**
   * ¿Ya se ve en su pantalla lo que se le acaba de escribir? Se busca su final (sin contar
   * espacios: un texto largo se parte en renglones) o el aviso con que la CLI resume un pegado.
   */
  shows(id: string, text: string): boolean {
    const e = this.live.get(id)
    if (!e) return false
    const flat = (s: string) => s.replace(/\s+/g, '')
    const screen = flat(e.reader.screen())
    const tail = flat(text).slice(-14)
    return /\[pasted/i.test(screen) || (tail.length > 0 && screen.includes(tail))
  }

  atPrompt(id: string): boolean {
    const e = this.live.get(id)
    if (!e) return false
    if (e.employee.state !== 'idle') {
      e.promptSince = undefined
      return false
    }
    // Sin patrones comprobados no se sabe leer su prompt: al menos que ya haya dibujado algo.
    const visible = getProvider(e.employee.provider).verified ? e.reader.promptVisible() : e.reader.screen().trim().length > 0
    if (!visible) {
      e.promptSince = undefined
      return false
    }
    const settle = this.opts.settleMs ?? 800
    // Quieta y con su prompt a la vista: lista.
    if (Date.now() - e.lastDataAt >= settle) return true
    // No está quieta, pero puede que nunca lo esté: hay CLIs que animan un aviso o su barra de
    // estado sin parar, y esperar al silencio dejaba sin entregar todo lo que se le escribía.
    // Si su prompt lleva un rato a la vista sin que se ponga a trabajar, también está lista.
    e.promptSince ??= Date.now()
    return Date.now() - e.promptSince >= Math.max(settle * 3, PROMPT_STEADY_MS)
  }

  /** Por qué está detenida, si lo está por una pantalla que se reconoce. */
  blockedBy(id: string): BlockKind | undefined {
    const e = this.live.get(id)
    if (!e || e.employee.state !== 'blocked') return undefined
    const screen = e.reader.screen()
    return BLOCKS.find(([, pattern]) => pattern.test(screen))?.[0] ?? 'permission'
  }

  /** Si lo que la detiene es una pregunta de permiso reconocida, su pantalla; si no, undefined. */
  approvalPrompt(id: string): string | undefined {
    if (this.blockedBy(id) !== 'permission') return undefined
    const screen = this.live.get(id)!.reader.screen()
    return APPROVAL_PROMPTS.some((p) => p.test(screen)) ? screen : undefined
  }

  /**
   * Contesta la pantalla que la detiene eligiendo en su menú la opción que toca (ver ANSWERS),
   * moviendo el cursor hasta ella: en Claude Code la que viene marcada al preguntar por la
   * carpeta es «No, exit». Si la pantalla no es la esperada no se teclea nada.
   */
  answerBlock(id: string) {
    const e = this.mustGet(id)
    const kind = this.blockedBy(id)
    const wanted = kind && ANSWERS[kind]
    const lines = e.reader.screen().split('\n')
    const target = wanted ? lines.findIndex((l) => wanted.test(l)) : -1
    // El cursor del menú es el más cercano a esa opción: más arriba puede verse el del prompt de la CLI.
    const cursor = lines.map((l, i) => (MENU_CURSOR.test(l) ? i : -1)).filter((i) => i >= 0).sort((x, y) => Math.abs(x - target) - Math.abs(y - target))[0] ?? -1
    if (target < 0 || cursor < 0) throw new Error(T`No encontré esa pregunta en su pantalla. Ábrele la terminal y contesta ahí.`)
    const steps = target - cursor
    e.pty.write((steps > 0 ? '\x1b[B' : '\x1b[A').repeat(Math.abs(steps)))
    setTimeout(() => this.live.get(id) === e && e.pty.write('\r'), 200)
  }

  isLive(id: string): boolean {
    const e = this.live.get(id)
    return !!e && e.employee.state !== 'exited'
  }

  write(id: string, data: string) {
    this.mustGet(id).pty.write(data)
  }

  resize(id: string, cols: number, rows: number) {
    const e = this.mustGet(id)
    e.pty.resize(cols, rows)
    e.reader.resize(cols, rows)
  }

  /** Despide: mata la CLI y, si se pide, quita su oficina (la rama queda). */
  async fire(id: string, repo: string, opts: { removeOffice?: boolean } = {}) {
    const entry = this.mustGet(id)
    clearTimeout(entry.quietTimer)
    if (entry.employee.state !== 'exited') entry.pty.kill()
    this.live.delete(id)
    if (opts.removeOffice) await removeOffice(repo, entry.employee.office, true)
  }

  shutdown() {
    for (const entry of this.live.values()) {
      clearTimeout(entry.quietTimer)
      if (entry.employee.state !== 'exited') entry.pty.kill()
    }
    this.live.clear()
  }

  private mustGet(id: string): Live {
    const entry = this.live.get(id)
    if (!entry) throw new Error(T`Empleado desconocido: ${id}`)
    return entry
  }
}
