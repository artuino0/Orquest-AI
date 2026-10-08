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
}

interface Live {
  employee: Employee
  pty: Pty
  reader: ScreenReader
  buffer: string
  lastDataAt: number
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
    if (this.live.has(id)) throw new Error(`Ya existe el empleado ${id}`)
    const ownOffice = !req.office
    const office = req.office ?? (await createOffice(req.repo, id))
    const launch = { model: req.model, effort: req.effort, systemPrompt: req.systemPrompt }

    const env: Record<string, string> = { ...(process.env as Record<string, string>), ...this.opts.env, ...req.env, ORQUEST_EMPLOYEE_ID: id }
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

    clearTimeout(entry.quietTimer)
    entry.quietTimer = setTimeout(() => {
      const s = entry.employee.state
      if (s === 'working' || s === 'starting') this.setState(entry, entry.reader.current() ?? 'idle')
    }, this.opts.quietMs ?? 4000)
  }

  private setState(entry: Live, state: EmployeeState) {
    if (entry.employee.state === state || entry.employee.state === 'exited') return
    entry.employee.state = state
    this.emit('state', entry.employee.id, state)
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
  atPrompt(id: string): boolean {
    const e = this.live.get(id)
    if (!e || e.employee.state !== 'idle') return false
    // La TUI sigue dibujando: lo tecleado ahora se puede perder.
    if (Date.now() - e.lastDataAt < (this.opts.settleMs ?? 800)) return false
    return getProvider(e.employee.provider).verified ? e.reader.promptVisible() : true
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
    if (!entry) throw new Error(`Empleado desconocido: ${id}`)
    return entry
  }
}
