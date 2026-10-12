import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RuleError } from '../src/core/board.js'
import { readText } from '../src/core/files.js'
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

describe('prompt de Claude Code', () => {
  it('toda terminal nace diciendo que es un xterm, aunque la app no haya heredado ninguna', async () => {
    const envs: Record<string, string>[] = []
    const spawn: Spawner = (_file, _args, o) => {
      envs.push(o.env)
      return { pid: 1, onData: () => {}, onExit: () => {}, write: () => {}, resize: () => {}, kill: () => {} }
    }
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const dir = repo()
    await manager.hire({ id: 'jefe', provider: 'claude', role: 'jefe', repo: dir, office: { path: dir, branch: 'main' } })
    expect(envs[0]).toMatchObject({ TERM: 'xterm-256color', COLORTERM: 'truecolor' })
  })

  it('se reconoce también cuando lo dibuja con «>» en vez de «❯»', async () => {
    const { terminals, spawn } = screenPty()
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const dir = repo()
    await manager.hire({ id: 'jefe', provider: 'claude', role: 'jefe', repo: dir, office: { path: dir, branch: 'main' } })
    // Tal como salió con Claude Code real lanzado sin variables de terminal.
    terminals[0].feed(`${CLEAR}──────────────────────\r\n> Try "how do I log an error?"\r\n──────────────────────\r\n  ⏵⏵ auto mode on (shift+tab to cycle)\r\n`)
    await wait(60)
    expect(manager.get('jefe')?.state).toBe('idle')
    expect(manager.atPrompt('jefe')).toBe(true)
  })
})

describe('editar en la oficina de alguien', () => {
  it('no se guarda mientras su agente trabaja ni en el parpadeo entre dos pasos; quieto, sí', async () => {
    const { terminals, spawn } = screenPty()
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const dir = repo()
    writeFileSync(join(dir, 'nota.md'), 'uno\n')
    studio = await new Studio({ repo: dir, manager, detect: async () => [], mcpUrl: (t) => `http://127.0.0.1:1/mcp/${t}`, submitDelayMs: 0, editCalmMs: 1500 }).init()
    await studio.hireBoss({ provider: 'claude', goal: 'Tienda' })
    const stamp = (await readText(dir, 'nota.md')).stamp
    // No se cuentan milisegundos: se espera a ver cada estado, que en una máquina cargada tarda más.
    const state = () => manager?.get('jefe')?.state
    terminals[0].feed(`${CLEAR}✻ Pensando… (esc to interrupt)\r\n`)
    await expect.poll(state, { timeout: 5000 }).toBe('working')
    await expect(studio.saveFile('jefe', 'nota.md', 'dos\n', stamp)).rejects.toThrow(RuleError)
    // Se asoma al prompt un instante entre dos pasos: todavía no.
    terminals[0].feed(CLAUDE_PROMPT)
    await expect.poll(state, { timeout: 5000 }).toBe('idle')
    await expect(studio.saveFile('jefe', 'nota.md', 'dos\n', stamp)).rejects.toThrow(RuleError)
    expect(readFileSync(join(dir, 'nota.md'), 'utf8')).toBe('uno\n')
    // Ya lleva un rato quieto: se guarda, y el sello nuevo sirve para la siguiente.
    await wait(1800)
    const next = await studio.saveFile('jefe', 'nota.md', 'dos\n', stamp)
    expect(readFileSync(join(dir, 'nota.md'), 'utf8')).toBe('dos\n')
    await studio.saveFile('jefe', 'nota.md', 'tres\n', next.stamp)
    expect(readFileSync(join(dir, 'nota.md'), 'utf8')).toBe('tres\n')
  })

  it('el explorador del proyecto: no muestra .orquest, no escribe ahí y respeta al jefe mientras trabaja', async () => {
    const { terminals, spawn } = screenPty()
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const dir = repo()
    writeFileSync(join(dir, 'nota.md'), 'uno\n')
    studio = await new Studio({ repo: dir, manager, detect: async () => [], mcpUrl: (t) => `http://127.0.0.1:1/mcp/${t}`, submitDelayMs: 0, editCalmMs: 1500 }).init()
    // Sin jefe contratado nadie más escribe ahí: se puede guardar.
    const first = await studio.projectFile('nota.md')
    const saved = await studio.saveProjectFile('nota.md', 'dos\n', first.stamp)
    expect(readFileSync(join(dir, 'nota.md'), 'utf8')).toBe('dos\n')
    await studio.hireBoss({ provider: 'claude', goal: 'Tienda' })
    const names = (await studio.projectTree('')).map((e) => e.name)
    expect(names).toContain('nota.md')
    expect(names).not.toContain('.orquest')
    expect(names).not.toContain('.git')
    // La bitácora del jefe vive en .orquest: por aquí no se toca.
    await expect(studio.saveProjectFile('.orquest/bitacoras/jefe.md', 'x', 'lo-que-sea')).rejects.toThrow(RuleError)
    // El jefe trabaja: no se guarda, y el archivo queda como estaba.
    terminals[0].feed(`${CLEAR}✻ Pensando… (esc to interrupt)\r\n`)
    await expect.poll(() => manager?.get('jefe')?.state, { timeout: 5000 }).toBe('working')
    await expect(studio.saveProjectFile('nota.md', 'tres\n', saved.stamp)).rejects.toThrow(RuleError)
    expect(readFileSync(join(dir, 'nota.md'), 'utf8')).toBe('dos\n')
    // Lo cambiado sale marcado para el árbol.
    expect((await studio.projectChanges()).map((c) => c.path)).toContain('nota.md')
  })
})

describe('máquina lenta', () => {
  it('el Enter espera a que la CLI termine de recibir el texto, en vez de caer dentro de lo pegado', async () => {
    // Una CLI que tarda 6 s en recibir lo que se le escribe: un Enter que llegue antes es un salto
    // de línea más; el que llega después, envía.
    const SLOW = 6000
    let feed = (_d: string) => {}
    let received = 0
    const early: number[] = []
    let submittedAt = 0
    const t0 = Date.now()
    const spawn: Spawner = () => ({
      pid: 1,
      onData: (cb) => (feed = cb),
      onExit: () => {},
      write: (d) => {
        if (d === '\r') {
          if (received && Date.now() >= received) {
            submittedAt ||= Date.now() - t0
            feed(`${CLEAR}✻ Pensando… (esc to interrupt)\r\n`)
          } else early.push(Date.now() - t0)
          return
        }
        received = Date.now() + SLOW
        setTimeout(() => feed(`${CLEAR}──────────────────────\r\n❯ ${d}\r\n──────────────────────\r\n`), SLOW)
      },
      resize: () => {},
      kill: () => {},
    })
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    studio = await new Studio({ repo: repo(), manager, detect: async () => [], mcpUrl: (t) => `http://127.0.0.1:1/mcp/${t}`, submitDelayMs: 50 }).init()
    await studio.hireBoss({ provider: 'claude', goal: 'Tienda' })
    feed(CLAUDE_PROMPT)
    await wait(SLOW + 2500)
    // Ningún Enter antes de tiempo, y el mensaje sí se envió.
    expect(early).toEqual([])
    expect(submittedAt).toBeGreaterThan(SLOW)
  })
})

describe('terminal que nunca se queda quieta', () => {
  it('con el prompt a la vista se le escribe aunque algo se siga animando en pantalla', async () => {
    const { terminals, spawn } = screenPty()
    // Con el tiempo de asentamiento real: es justo lo que la animación nunca dejaba cumplir.
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 300 })
    const dir = repo()
    await manager.hire({ id: 'jefe', provider: 'claude', role: 'jefe', repo: dir, office: { path: dir, branch: 'main' } })
    const [t] = terminals
    t.feed(CLAUDE_PROMPT)
    // Un aviso que brilla: redibuja su renglón cada 100 ms, sin tocar el prompt.
    let frame = 0
    const shimmer = setInterval(() => t.feed(`\x1b7\x1b[1;1H${frame++ % 2 ? '✦' : '✧'} Aviso con brillo\x1b8`), 100)
    try {
      await wait(500)
      expect(manager.get('jefe')?.state).toBe('idle')
      // Aún no: puede estar dibujando todavía.
      expect(manager.atPrompt('jefe')).toBe(false)
      await wait(2800)
      expect(manager.atPrompt('jefe')).toBe(true)
    } finally {
      clearInterval(shimmer)
    }
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
