import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
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
}

export interface ManagerEvents {
  hired: [Employee]
  data: [id: string, data: string]
  state: [id: string, state: EmployeeState]
  exit: [id: string, exitCode: number]
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

    let pty: Pty
    try {
      pty = this.spawn(req.binary ?? adapter.binaries[0], [...adapter.buildArgs(launch), ...(req.extraArgs ?? [])], {
        cwd: office.path,
        cols: this.opts.cols ?? 120,
        rows: this.opts.rows ?? 32,
        env: { ...(process.env as Record<string, string>), ...this.opts.env, ORQUEST_EMPLOYEE_ID: id },
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
    }
    const entry: Live = { employee, pty, reader: undefined as unknown as ScreenReader, buffer: '', lastDataAt: Date.now() }
    entry.reader = new ScreenReader(adapter.screen, {
      cols: this.opts.cols ?? 120,
      rows: this.opts.rows ?? 32,
      onChange: (s) => this.setState(entry, s),
    })
    this.live.set(id, entry)

    pty.onData((data) => this.onData(entry, data))
    pty.onExit(({ exitCode }) => {
      clearTimeout(entry.quietTimer)
      entry.reader.dispose()
      employee.exitCode = exitCode
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
