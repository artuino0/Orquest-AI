import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EmployeeManager, type Pty, type Spawner } from '../src/core/employees.js'
import { Studio } from '../src/core/studio.js'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'orquest-pantallas-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(dir, 'a.txt'), 'hola')
  git('add', '.')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'Inicio')
  return dir
}

/** Terminal de mentira: la prueba decide qué se ve en pantalla y mira qué se le teclea. */
function screenPty() {
  const terminals: { feed: (data: string) => void; typed: string[]; exit: () => void }[] = []
  const spawn: Spawner = () => {
    const t = { feed: (_d: string) => {}, typed: [] as string[], exit: () => {} }
    terminals.push(t)
    const pty: Pty = {
      pid: 1,
      onData: (cb) => (t.feed = cb),
      onExit: (cb) => (t.exit = () => cb({ exitCode: 0 })),
      write: (d) => t.typed.push(d),
      resize: () => {},
      kill: () => t.exit(),
    }
    return pty
  }
  return { terminals, spawn }
}

// Tal como las pintan las CLIs reales (Claude Code y Codex) en una carpeta nueva.
const CLEAR = '\x1b[2J\x1b[H'
const CLAUDE_TRUST = `${CLEAR} Accessing workspace:\r\n Quick safety check: Is this a project you created or one you trust?\r\n Security guide\r\n ❯ No, exit\r\n   Yes, I trust this folder\r\n Enter to confirm · Esc to cancel\r\n`
const CLAUDE_OFFER = `${CLEAR} Get to finished work sooner with Opus 5.5. Switch anytime with /model.\r\n──────────────────────\r\n❯ Try "how do I log an error?"\r\n──────────────────────\r\n ❯ 1. Yes, try it\r\n   2. Not now\r\n Enter to confirm · Esc to cancel\r\n`
const CODEX_TRUST = `${CLEAR}  Trust this folder? Codex can read, edit, and run files here.\r\n› 1. Trust and continue\r\n  2. Back to Agent Command Center\r\n  enter continue · esc back\r\n`
const CLAUDE_PROMPT = `${CLEAR}──────────────────────\r\n❯ \r\n──────────────────────\r\n  ? for shortcuts\r\n`

let manager: EmployeeManager | undefined
let studio: Studio | undefined
afterEach(() => {
  studio?.shutdown()
  manager?.shutdown()
  studio = manager = undefined
})

describe('pantallas que detienen a una CLI', () => {
  it('se reconoce cuál es y se contesta desde la app eligiendo la opción correcta del menú', async () => {
    const { terminals, spawn } = screenPty()
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const dir = repo()
    await manager.hire({ id: 'jefe', provider: 'claude', role: 'jefe', repo: dir, office: { path: dir, branch: 'main' } })
    const [t] = terminals

    // Claude pregunta por la carpeta y trae marcado «No, exit»: hay que bajar una y confirmar.
    t.feed(CLAUDE_TRUST)
    await wait(60)
    expect(manager.get('jefe')?.state).toBe('blocked')
    expect(manager.blockedBy('jefe')).toBe('trust')
    expect(manager.atPrompt('jefe')).toBe(false)
    manager.answerBlock('jefe')
    await wait(260)
    expect(t.typed.join('')).toBe('\x1b[B\r')

    // Luego ofrece otro modelo, con su prompt visible arriba: sigue detenida y se le dice «Not now».
    t.typed.length = 0
    t.feed(CLAUDE_OFFER)
    await wait(60)
    expect(manager.get('jefe')?.state).toBe('blocked')
    expect(manager.blockedBy('jefe')).toBe('offer')
    expect(manager.atPrompt('jefe')).toBe(false)
    manager.answerBlock('jefe')
    await wait(260)
    expect(t.typed.join('')).toBe('\x1b[B\r')

    // Ya en su prompt no hay nada que contestar: no se teclea.
    t.typed.length = 0
    t.feed(CLAUDE_PROMPT)
    await wait(60)
    expect(manager.blockedBy('jefe')).toBeUndefined()
    expect(() => manager!.answerBlock('jefe')).toThrow()
    expect(t.typed).toEqual([])
  })

  it('en Codex la opción de confiar ya viene marcada: solo se confirma', async () => {
    const { terminals, spawn } = screenPty()
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const dir = repo()
    await manager.hire({ id: 'ana', provider: 'codex', role: 'backend', repo: dir, office: { path: dir, branch: 'main' } })
    terminals[0].feed(CODEX_TRUST)
    await wait(60)
    expect(manager.blockedBy('ana')).toBe('trust')
    manager.answerBlock('ana')
    await wait(260)
    expect(terminals[0].typed.join('')).toBe('\r')
  })
})

describe('reiniciar una terminal atorada', () => {
  it('cierra la CLI y entra otra con conversación nueva; lo que no había llegado se entrega después', async () => {
    const { terminals, spawn } = screenPty()
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    studio = await new Studio({ repo: repo(), manager, detect: async () => [], mcpUrl: (t) => `http://127.0.0.1:1/mcp/${t}`, submitDelayMs: 0 }).init()
    await studio.hireBoss({ provider: 'claude', goal: 'Tienda' })
    // Se queda en la oferta de otro modelo: lo que el usuario le escribe no entra.
    terminals[0].feed(CLAUDE_OFFER)
    await wait(60)
    studio.sayToBoss('¿Cómo vamos?')
    await wait(120)
    expect(terminals[0].typed.join('')).not.toContain('Cómo vamos')

    await studio.restart('jefe')
    expect(terminals).toHaveLength(2)
    expect(studio.bossOnline).toBe(true)
    // La nueva llega a su prompt y recibe el aviso del reinicio y el mensaje pendiente.
    terminals[1].feed(CLAUDE_PROMPT)
    await wait(1500)
    const typed = terminals[1].typed.join('')
    expect(typed).toContain('Tu terminal se reinició')
    expect(typed).toContain('Cómo vamos')
  })
})
