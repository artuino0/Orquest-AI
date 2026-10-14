import { describe, expect, it } from 'vitest'
import { parseAgyUsage, probeAgyUsage } from '../src/core/agyusage.js'
import type { Pty, Spawner } from '../src/core/employees.js'

// Como sale en la pantalla de `/usage` de agy 1.3.5 (sin el renglón de la cuenta).
const SCREEN = `└ Models & Quota

GEMINI MODELS
  Models within this group: Gemini Flash, Gemini Pro

  Weekly Limit Remaining
    [█████████████████████████████████████████████████░] 98.76%
    Refreshes in 148h 7m

  Five Hour Limit Remaining
    [██████████████████████████████████████████████████] 100.00%
    Quota available


CLAUDE AND GPT MODELS
  Models within this group: Claude Opus, Claude Sonnet, GPT-OSS

  Weekly Limit Remaining
    [████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░] 47.5%
    Refreshes in 2d 3h

  Five Hour Limit Remaining
    [░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 0.00%
    Refreshes in 45m
`

describe('consumo de Antigravity, leído de su /usage', () => {
  it('cada grupo con su semana y sus 5 horas, como lo usado (agy cuenta lo que queda)', () => {
    const now = 1_000_000
    const u = parseAgyUsage(SCREEN, now)!
    expect(u.at).toBe(now)
    expect(u.windows.map((w) => [w.label, w.minutes, w.used])).toEqual([
      ['Gemini · semana', 10080, 1.2],
      ['Gemini · 5 horas', 300, 0],
      ['Claude y GPT · semana', 10080, 52.5],
      ['Claude y GPT · 5 horas', 300, 100],
    ])
    expect(u.windows[0].resetsAt).toBe(now + (148 * 60 + 7) * 60_000)
    expect(u.windows[1].resetsAt).toBeUndefined()
    expect(u.windows[2].resetsAt).toBe(now + (2 * 24 + 3) * 3_600_000)
  })

  it('una pantalla sin cuotas no da dato', () => {
    expect(parseAgyUsage('> \n? for shortcuts', 1)).toBeUndefined()
  })

  it('abre agy aparte, confía en su carpeta, cierra avisos, pide /usage y lo lee; luego la cierra', async () => {
    const typed: string[] = []
    let feed = (_d: string) => {}
    let killed = false
    const spawn: Spawner = () => {
      const p: Pty = {
        pid: 1,
        onData: (cb) => {
          feed = cb
          setTimeout(() => feed('\x1b[2J\x1b[HDo you trust the contents of this project?\r\n> Yes, I trust this folder\r\n'), 20)
        },
        onExit: () => {},
        write: (d) => {
          typed.push(d)
          if (d === '\r' && typed.length === 1) setTimeout(() => feed('\x1b[2J\x1b[H ┃ esc to dismiss\r\n────\r\n>\r\n────\r\n'), 20)
          if (d === '\x1b' && !typed.includes('/usage')) setTimeout(() => feed('\x1b[2J\x1b[H────\r\n>\r\n────\r\n'), 10)
          if (d === '\r' && typed.includes('/usage')) setTimeout(() => feed(`\x1b[2J\x1b[H${SCREEN.replace(/\n/g, '\r\n')}`), 20)
        },
        resize: () => {},
        kill: () => (killed = true),
      }
      return p
    }
    const u = await probeAgyUsage({ binary: 'agy', dir: '.', spawn, timeoutMs: 10_000, now: () => 5 })
    expect(u?.windows).toHaveLength(4)
    expect(typed.slice(0, 2)).toEqual(['\r', '\x1b'])
    expect(typed).toContain('/usage')
    expect(killed).toBe(true)
  })
})
