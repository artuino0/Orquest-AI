/**
 * Lo que lleva usado Antigravity (`agy`) de su cuota. No lo anota en ningún
 * archivo: lo dice su comando `/usage`, dentro de su terminal. Para no tocar la
 * terminal de ningún agente, Orquest abre una suya, aparte y oculta, en una
 * carpeta propia y vacía: escribe `/usage`, lee la pantalla y la cierra. No se
 * le manda nada al modelo.
 *
 * `agy` cuenta lo que queda («Remaining»); aquí se guarda lo usado, como en las
 * demás cuentas.
 */
import { Terminal } from '@xterm/headless'
import { T } from './i18n.js'
import type { AccountUsage, UsageWindow } from './accounts.js'
import type { Spawner } from './employees.js'

const WINDOWS: Record<string, number> = { weekly: 7 * 24 * 60, 'five hour': 5 * 60 }

/** «148h 7m», «2d 3h», «45m» → milisegundos. */
function duration(text: string): number | undefined {
  let ms = 0
  let any = false
  for (const [, n, unit] of text.matchAll(/(\d+)\s*([dhm])/g)) {
    any = true
    ms += Number(n) * (unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : 60_000)
  }
  return any ? ms : undefined
}

/** «GEMINI MODELS» → «Gemini»; «CLAUDE AND GPT MODELS» → «Claude y GPT». */
function groupName(header: string): string {
  const words = header.replace(/\s+MODELS?\s*$/i, '').trim().split(/\s+/)
  return words
    .map((w) => (/^(gpt|oss|ai)$/i.test(w) ? w.toUpperCase() : /^and$/i.test(w) ? T`y` : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
}

/** Lee la pantalla de `/usage`; undefined si no trae ninguna cuota. */
export function parseAgyUsage(screen: string, now: number): AccountUsage | undefined {
  const lines = screen.split('\n')
  const windows: UsageWindow[] = []
  let group = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (/^[A-Z][A-Z0-9 &/-]*MODELS?$/.test(line)) {
      group = groupName(line)
      continue
    }
    const kind = /^(Weekly|Five Hour) Limit Remaining/i.exec(line)?.[1]?.toLowerCase()
    if (!kind) continue
    // El porcentaje viene al final de la barra, en el renglón siguiente; luego, cuándo se repone.
    const pct = /(\d+(?:\.\d+)?)\s*%/.exec(lines[i + 1] ?? '')?.[1]
    if (pct === undefined) continue
    const refresh = /Refreshes in (.+)$/i.exec((lines[i + 2] ?? '').trim())?.[1]
    const left = Math.max(0, Math.min(100, Number(pct)))
    const minutes = WINDOWS[kind]
    const span = refresh ? duration(refresh) : undefined
    const label = kind === 'weekly' ? T`semana` : T`5 horas`
    windows.push({ label: group ? `${group} · ${label}` : label, minutes, used: Math.round((100 - left) * 10) / 10, resetsAt: span !== undefined ? now + span : undefined })
  }
  return windows.length ? { windows, at: now } : undefined
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Abre `agy` aparte en `dir` (una carpeta de Orquest, vacía), le pide `/usage`
 * y devuelve lo que lee. Si algo no sale como se espera, undefined: no es
 * grave, solo no hay dato esta vez.
 */
export async function probeAgyUsage(opts: { binary: string; dir: string; spawn: Spawner; env?: Record<string, string>; timeoutMs?: number; now?: () => number }): Promise<AccountUsage | undefined> {
  const cols = 160
  const rows = 60
  const term = new Terminal({ cols, rows, allowProposedApi: true, scrollback: 0 })
  const screen = () => {
    const b = term.buffer.active
    const out: string[] = []
    for (let i = 0; i < rows; i++) out.push(b.getLine(b.viewportY + i)?.translateToString(true) ?? '')
    return out.join('\n')
  }
  const env = { ...(process.env as Record<string, string>), TERM: 'xterm-256color', ...opts.env }
  const p = opts.spawn(opts.binary, [], { cwd: opts.dir, cols, rows, env })
  p.onData((d) => term.write(d))
  const deadline = Date.now() + (opts.timeoutMs ?? 40_000)
  const until = async (test: (s: string) => boolean) => {
    while (Date.now() < deadline) {
      if (test(screen())) return true
      await wait(250)
    }
    return false
  }
  try {
    // Lista para escribir: su caja de entrada, o la pregunta de confianza de esta carpeta (es de Orquest y está vacía).
    if (!(await until((s) => /trust the contents/i.test(s) || /^\s*>\s*$/m.test(s)))) return undefined
    if (/trust the contents/i.test(screen())) {
      p.write('\r')
      if (!(await until((s) => /^\s*>\s*$/m.test(s) && !/trust the contents/i.test(s)))) return undefined
    }
    // Avisos de novedades encima de la caja: se cierran con Esc.
    for (let i = 0; i < 3 && /esc to dismiss/i.test(screen()); i++) {
      p.write('\x1b')
      await wait(500)
    }
    p.write('/usage')
    await wait(800)
    p.write('\r')
    if (!(await until((s) => /Limit Remaining[\s\S]*?\d+(?:\.\d+)?\s*%/i.test(s)))) return undefined
    // Un respiro para que termine de dibujar todos los grupos.
    await wait(800)
    return parseAgyUsage(screen(), (opts.now ?? Date.now)())
  } finally {
    p.write('\x1b')
    p.kill()
    term.dispose()
  }
}
