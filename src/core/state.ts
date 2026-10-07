import type { ScreenPatterns } from './providers.js'

/**
 * Estados reales de un empleado. Cada animación de la oficina sale de aquí.
 * - starting: la CLI se está levantando.
 * - working: piensa o ejecuta herramientas.
 * - blocked: espera una decisión del usuario.
 * - idle: terminó su turno y espera instrucción.
 * - exited: la CLI terminó.
 */
export type EmployeeState = 'starting' | 'working' | 'blocked' | 'idle' | 'exited'

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g

export function stripAnsi(s: string): string {
  return s.replace(ANSI, '')
}

/**
 * Señal explícita por OSC, para CLIs con hooks (p. ej. un hook de Claude Code
 * que imprime `\x1b]7777;orquest:state=working\x07`). Si existe, gana sobre la
 * lectura de pantalla.
 */
const OSC_STATE = /\x1b\]7777;orquest:state=(working|blocked|idle)(?:\x07|\x1b\\)/g

export function parseOscState(chunk: string): EmployeeState | undefined {
  let last: EmployeeState | undefined
  for (const m of chunk.matchAll(OSC_STATE)) last = m[1] as EmployeeState
  return last
}

/**
 * Lee la pantalla de respaldo. Guarda una cola de la salida reciente y decide
 * el estado por patrones del proveedor. Bloqueado gana sobre trabajando porque
 * una pregunta de permiso suele convivir con restos del spinner.
 */
export class ScreenReader {
  private tail = ''
  private hookState: EmployeeState | undefined
  private hookAt = 0

  constructor(
    private patterns: ScreenPatterns,
    private maxTail = 4000,
    /** Tras este tiempo sin señal de hook, se vuelve a leer la pantalla. */
    private hookTtlMs = 30_000,
    private now: () => number = Date.now,
  ) {}

  feed(chunk: string): EmployeeState | undefined {
    const osc = parseOscState(chunk)
    if (osc) {
      this.hookState = osc
      this.hookAt = this.now()
    }
    this.tail = (this.tail + stripAnsi(chunk)).slice(-this.maxTail)
    return this.current()
  }

  current(): EmployeeState | undefined {
    if (this.hookState && this.now() - this.hookAt < this.hookTtlMs) return this.hookState
    // Solo las últimas líneas cuentan: lo de arriba ya es historia.
    const recent = this.tail.split(/\r?\n/).slice(-12).join('\n')
    if (this.patterns.blocked.some((r) => r.test(recent))) return 'blocked'
    if (this.patterns.working.some((r) => r.test(recent))) return 'working'
    if (this.patterns.idle.some((r) => r.test(recent))) return 'idle'
    return undefined
  }
}
