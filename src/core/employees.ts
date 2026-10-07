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
      cols?: number
      rows?: number
      env?: Record<string, string>
    } = {},
  ) {
    super()
  }

  async hire(req: HireRequest): Promise<Employee> {
    const adapter = getProvider(req.provider)
    const id = `${req.role}-${req.provider}-${randomUUID().slice(0, 6)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const office = await createOffice(req.repo, id)
    const launch = { model: req.model, effort: req.effort, systemPrompt: req.systemPrompt }

    let pty: Pty
    try {
      pty = this.spawn(req.binary ?? adapter.binaries[0], adapter.buildArgs(launch), {
        cwd: office.path,
        cols: this.opts.cols ?? 120,
        rows: this.opts.rows ?? 32,
        env: { ...(process.env as Record<string, string>), ...this.opts.env, ORQUEST_EMPLOYEE_ID: id },
      })
    } catch (err) {
      await removeOffice(req.repo, office, true).catch(() => {})
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
    const entry: Live = { employee, pty, reader: new ScreenReader(adapter.screen), buffer: '' }
    this.live.set(id, entry)

    pty.onData((data) => this.onData(entry, data))
    pty.onExit(({ exitCode }) => {
      clearTimeout(entry.quietTimer)
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
    this.emit('data', entry.employee.id, data)

    const next = entry.reader.feed(data)
    if (next) this.setState(entry, next)

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

  write(id: string, data: string) {
    this.mustGet(id).pty.write(data)
  }

  resize(id: string, cols: number, rows: number) {
    this.mustGet(id).pty.resize(cols, rows)
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
