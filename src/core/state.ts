import { Terminal } from '@xterm/headless'
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

/**
 * Las TUIs separan palabras moviendo el cursor (ESC[nC avanza, ESC[nG va a la
 * columna n) en lugar de escribir espacios. Para leer la pantalla se siguen la
 * columna de cada línea y esos saltos se vuelven espacios.
 */
// eslint-disable-next-line no-control-regex
const CURSOR = /\x1b\[(\d*)([CG])/y

export function stripAnsi(s: string): string {
  let out = ''
  let col = 0
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '\x1b') {
      CURSOR.lastIndex = i
      const m = CURSOR.exec(s)
      if (m) {
        const n = Math.min(Number(m[1] || 1), 500)
        const pad = m[2] === 'C' ? n : Math.max(n - 1 - col, col > 0 && n - 1 <= col ? 1 : 0)
        out += ' '.repeat(pad)
        col += pad
        i = CURSOR.lastIndex
        continue
      }
      ANSI.lastIndex = 0
      const rest = s.slice(i)
      const seq = rest.match(ANSI_AT_START)
      if (seq) {
        i += seq[0].length
        continue
      }
    }
    if (ch === '\n' || ch === '\r') col = 0
    else col++
    out += ch
    i++
  }
  return out
}

// eslint-disable-next-line no-control-regex
const ANSI_AT_START = /^(?:\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_])/

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
 * Lee la pantalla de respaldo. Emula la terminal (xterm headless) para ver lo
 * que de verdad está en pantalla: las TUIs redibujan en su lugar, y leer la
 * salida como texto deja restos de pantallas viejas. Decide el estado por los
 * patrones del proveedor sobre las últimas líneas visibles. Bloqueado gana
 * sobre trabajando porque una pregunta de permiso suele convivir con restos
 * del spinner.
 */
export class ScreenReader {
  private term: Terminal
  private hookState: EmployeeState | undefined
  private hookAt = 0
  private last: EmployeeState | undefined
  private hookTtlMs: number
  private now: () => number
  private onChange?: (s: EmployeeState) => void

  constructor(
    private patterns: ScreenPatterns,
    opts: {
      cols?: number
      rows?: number
      /** Tras este tiempo sin señal de hook, se vuelve a leer la pantalla. */
      hookTtlMs?: number
      now?: () => number
      onChange?: (s: EmployeeState) => void
    } = {},
  ) {
    this.hookTtlMs = opts.hookTtlMs ?? 30_000
    this.now = opts.now ?? Date.now
    this.onChange = opts.onChange
    this.term = new Terminal({ cols: opts.cols ?? 120, rows: opts.rows ?? 32, allowProposedApi: true, scrollback: 0 })
    this.term.parser.registerOscHandler(7777, (data) => {
      const m = /^orquest:state=(working|blocked|idle)$/.exec(data)
      if (m) {
        this.hookState = m[1] as EmployeeState
        this.hookAt = this.now()
      }
      return true
    })
  }

  feed(chunk: string) {
    this.term.write(chunk, () => {
      const s = this.current()
      if (s && s !== this.last) {
        this.last = s
        this.onChange?.(s)
      }
    })
  }

  /** Espera a que se procese lo escrito (pruebas). */
  settle(): Promise<void> {
    return new Promise((ok) => this.term.write('', ok))
  }

  /** Atajo para pruebas: escribe, espera y devuelve el estado. */
  async write(chunk: string): Promise<EmployeeState | undefined> {
    this.feed(chunk)
    await this.settle()
    return this.current()
  }

  resize(cols: number, rows: number) {
    this.term.resize(cols, rows)
  }

  /** Texto visible, línea por línea. */
  screen(): string {
    const buf = this.term.buffer.active
    const lines: string[] = []
    for (let y = 0; y < this.term.rows; y++) lines.push(buf.getLine(buf.viewportY + y)?.translateToString(true) ?? '')
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    return lines.join('\n')
  }

  /** Solo las últimas líneas cuentan: lo de arriba ya es historia. */
  private recent(): string {
    return this.screen().split('\n').filter((l) => l.trim()).slice(-12).join('\n')
  }

  /** Se ve el prompt listo para recibir texto: ni trabajando ni preguntando nada. */
  promptVisible(): boolean {
    const recent = this.recent()
    return (
      this.patterns.idle.some((r) => r.test(recent)) &&
      !this.patterns.blocked.some((r) => r.test(recent)) &&
      !this.patterns.working.some((r) => r.test(recent))
    )
  }

  current(): EmployeeState | undefined {
    if (this.hookState && this.now() - this.hookAt < this.hookTtlMs) return this.hookState
    const recent = this.recent()
    if (this.patterns.blocked.some((r) => r.test(recent))) return 'blocked'
    if (this.patterns.working.some((r) => r.test(recent))) return 'working'
    if (this.patterns.idle.some((r) => r.test(recent))) return 'idle'
    return undefined
  }

  dispose() {
    this.term.dispose()
  }
}
