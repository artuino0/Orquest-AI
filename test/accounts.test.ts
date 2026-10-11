import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { accountEnv, listAccounts, parseClaudeLimits, parseCodexLimits } from '../src/core/accounts.js'
import { RuleError } from '../src/core/board.js'

let home: string
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'orquest-cuentas-'))
})
afterEach(() => rmSync(home, { recursive: true, force: true, maxRetries: 5 }))

/** Carpeta de una CLI con sesión iniciada. */
const account = (dir: string, marker = 'auth.json') => {
  mkdirSync(join(home, dir), { recursive: true })
  writeFileSync(join(home, dir, marker), '{}')
}
const NOW = Date.UTC(2026, 9, 10, 18)
const limits = (primary: number, secondary: number, resets = NOW / 1000 + 3600) =>
  `{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"limit_id":"codex","primary":{"used_percent":${primary},"window_minutes":300,"resets_at":${resets}},"secondary":{"used_percent":${secondary},"window_minutes":10080,"resets_at":${resets + 86400}},"credits":{"has_credits":false}}}}\n`
const session = (dir: string, name: string, text: string) => {
  const day = join(home, dir, 'sessions', '2026', '10', '10')
  mkdirSync(day, { recursive: true })
  writeFileSync(join(day, name), text)
}

describe('cuentas de una CLI', () => {
  it('cada carpeta hermana con sesión es una cuenta; la de siempre va primero', () => {
    account('.codex2')
    account('.codex')
    account('.codex-trabajo')
    mkdirSync(join(home, '.codex3')) // sin sesión: no cuenta
    account('.codexbak.old') // nombre raro: no cuenta
    const found = listAccounts(home, NOW).filter((a) => a.provider === 'codex')
    expect(found.map((a) => [a.dir, a.label, a.main])).toEqual([
      ['.codex', 'Principal', true],
      ['.codex-trabajo', 'trabajo', false],
      ['.codex2', '2', false],
    ])
  })

  it('también reconoce las de Claude Code', () => {
    account('.claude', '.credentials.json')
    account('.claude-2', '.credentials.json')
    expect(listAccounts(home, NOW).filter((a) => a.provider === 'claude').map((a) => a.dir)).toEqual(['.claude', '.claude-2'])
  })

  it('la principal se lanza tal cual y las demás con la variable que le dice dónde vive', () => {
    account('.codex')
    account('.codex2')
    expect(accountEnv('codex', undefined, home)).toEqual({})
    expect(accountEnv('codex', '.codex', home)).toEqual({})
    expect(accountEnv('codex', '.codex2', home)).toEqual({ CODEX_HOME: join(home, '.codex2') })
  })

  it('una cuenta que no existe, sin sesión o que sale de la carpeta del usuario se rechaza con su motivo', () => {
    account('.codex')
    mkdirSync(join(home, '.codex3'))
    expect(() => accountEnv('codex', '.codex9', home)).toThrow(RuleError)
    expect(() => accountEnv('codex', '.codex3', home)).toThrow(/sesión/)
    expect(() => accountEnv('codex', '.codex/../otra', home)).toThrow(RuleError)
    expect(() => accountEnv('codex', '../.codex2', home)).toThrow(RuleError)
    expect(() => accountEnv('opencode', '.opencode2', home)).toThrow(/otra cuenta/)
  })
})

describe('uso de la cuenta', () => {
  it('Codex: se lee el último dato que dejó en su sesión más reciente', () => {
    account('.codex')
    session('.codex', 'rollout-2026-10-10T10-00-00-a.jsonl', limits(80, 40))
    session('.codex', 'rollout-2026-10-10T17-00-00-b.jsonl', limits(5, 2) + limits(17, 3))
    const [a] = listAccounts(home, NOW)
    expect(a.usage?.windows).toEqual([
      { label: '5 horas', minutes: 300, used: 17, resetsAt: NOW + 3600_000 },
      { label: 'Semana', minutes: 10080, used: 3, resetsAt: NOW + 3600_000 + 86400_000 },
    ])
  })

  it('Codex: si la sesión más nueva aún no trae el dato, sirve la anterior', () => {
    account('.codex')
    session('.codex', 'rollout-2026-10-10T10-00-00-a.jsonl', limits(33, 9))
    session('.codex', 'rollout-2026-10-10T17-00-00-b.jsonl', '{"type":"session_meta"}\n')
    expect(listAccounts(home, NOW)[0].usage?.windows[0].used).toBe(33)
  })

  it('un tramo cuyo reinicio ya pasó cuenta como cero', () => {
    const u = parseCodexLimits(limits(90, 50, NOW / 1000 - 60), NOW, NOW)
    expect(u?.windows[0]).toEqual({ label: '5 horas', minutes: 300, used: 0, resetsAt: undefined })
    expect(u?.windows[1].used).toBe(50)
  })

  it('sin sesiones o con texto roto no hay dato, sin tronar', () => {
    account('.codex')
    expect(listAccounts(home, NOW)[0].usage).toBeUndefined()
    expect(parseCodexLimits('"rate_limits":{"primary":{"used_percent":', NOW)).toBeUndefined()
    expect(parseCodexLimits('"rate_limits":null', NOW)).toBeUndefined()
  })

  it('Claude Code: sale de lo que manda su barra de estado', () => {
    const u = parseClaudeLimits({ context_window: { used_percentage: 20 }, rate_limits: { five_hour: { used_percentage: 41.5, resets_at: NOW / 1000 + 600 }, seven_day: { used_percentage: 12 } } }, NOW)
    expect(u).toEqual({
      at: NOW,
      windows: [
        { label: '5 horas', minutes: 300, used: 41.5, resetsAt: NOW + 600_000 },
        { label: 'Semana', minutes: 10080, used: 12, resetsAt: undefined },
      ],
    })
    expect(parseClaudeLimits({ context_window: { used_percentage: 20 } }, NOW)).toBeUndefined()
    expect(parseClaudeLimits(null, NOW)).toBeUndefined()
  })
})
