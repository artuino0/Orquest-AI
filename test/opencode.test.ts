import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EmployeeManager, type Pty, type Spawner } from '../src/core/employees.js'
import { opencodePermissions } from '../src/core/providers.js'
import { Studio } from '../src/core/studio.js'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'orquest-opencode-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(dir, 'a.txt'), 'hola')
  git('add', '.')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'Inicio')
  return dir
}

/** Terminal de mentira: la prueba decide qué se ve en pantalla, mira qué se le teclea y con qué entorno nació. */
function screenPty() {
  const terminals: { feed: (data: string) => void; typed: string[]; env: Record<string, string> }[] = []
  const spawn: Spawner = (_file, _args, o) => {
    const t = { feed: (_d: string) => {}, typed: [] as string[], env: o.env }
    terminals.push(t)
    const pty: Pty = { pid: 1, onData: (cb) => (t.feed = cb), onExit: () => {}, write: (d) => t.typed.push(d), resize: () => {}, kill: () => {} }
    return pty
  }
  return { terminals, spawn }
}

// Tal como las pinta OpenCode 1.19 (vistas con su CLI real).
const CLEAR = '\x1b[2J\x1b[H'
const box = (...lines: string[]) => `${CLEAR}${lines.join('\r\n')}\r\n`
const OC_IDLE = box(
  '  /update to upgrade to OpenCode 2.0',
  '  ┃',
  '  ┃  Ask anything… "What is the tech stack of this project?"',
  '  ┃',
  '  ┃  Build · Big Pickle OpenCode',
  '  ╹▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
  '                     tab agents  ctrl+p commands',
)
const OC_WORKING = (bar: string) =>
  box('  ┃  Run the shell command: git status', '     ▣  Build · Big Pickle', '  ┃', '  ┃  Build · Big Pickle OpenCode', '  ╹▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀', `   ${bar}  esc interrupt             59.3K (30%)  ctrl+p commands`)
const OC_PERMISSION = box(
  '     ▣  Build · Big Pickle',
  '  ┃  △ Permission required',
  '  ┃    # Shell command',
  '  ┃  $ git status',
  '  ┃   Allow once   Allow always   Reject        ctrl+f fullscreen  ⇆ select  enter confirm',
)
const OC_BAD_MODEL = box('  ┃  Model anthropic/claude-sonnet-4-5 is not valid', '  ┃', '  ┃  Ask anything… "Fix broken tests"', '  ┃  Build · Qwen3.8 Max Alibaba', '           tab agents  ctrl+p commands')
const OC_NO_CREDIT = box(
  '  ┃  di hola',
  '  ┃  Access denied, please make sure your account is in good standing. For details, see: https://www.alibabacloud.com/',
  '  ┃  help/en/model-studio/error-code#overdue-payment',
  '     ▣  Build · Qwen3.8 Max',
  '  ┃  Build · Qwen3.8 Max Alibaba',
  '   C:\\repo                          tab agents  ctrl+p commands',
)
const CLAUDE_PROMPT = `${CLEAR}──────────────────────\r\n❯ \r\n──────────────────────\r\n  ? for shortcuts\r\n`

let manager: EmployeeManager | undefined
let studio: Studio | undefined
afterEach(() => {
  studio?.shutdown()
  manager?.shutdown()
  studio = manager = undefined
})

describe('OpenCode en pantalla', () => {
  it('se le ve esperar, trabajar y pedir permiso; el jefe le contesta «Allow once» con Enter', async () => {
    const { terminals, spawn } = screenPty()
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const dir = repo()
    await manager.hire({ id: 'ana', provider: 'opencode', role: 'backend', repo: dir, office: { path: dir, branch: 'main' } })
    const [t] = terminals
    t.feed(OC_IDLE)
    await wait(60)
    expect(manager.get('ana')?.state).toBe('idle')
    // Trabajando: su barra se mueve junto a «esc interrupt».
    t.feed(OC_WORKING('⬝⬝⬝⬝⬝⬝■■'))
    await wait(10)
    t.feed(OC_WORKING('■■■■⬝⬝⬝⬝'))
    await wait(60)
    expect(manager.get('ana')?.state).toBe('working')
    expect(manager.get('ana')?.context).toBe(30)
    // Pide permiso: detenida, es una pregunta de permiso y «Allow once» ya viene marcada.
    t.feed(OC_PERMISSION)
    await wait(60)
    expect(manager.get('ana')?.state).toBe('blocked')
    expect(manager.approvalPrompt('ana')).toBeDefined()
    manager.answerBlock('ana')
    expect(t.typed.join('')).toBe('\r')
  })

  it('avisa cuando no puede usar su modelo y lo borra cuando ya trabaja', async () => {
    const { terminals, spawn } = screenPty()
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const seen: (string | null)[] = []
    manager.on('failure', (_id, p) => seen.push(p))
    const dir = repo()
    await manager.hire({ id: 'ana', provider: 'opencode', role: 'backend', repo: dir, office: { path: dir, branch: 'main' } })
    const [t] = terminals
    // Un modelo que no tiene: lo avisa y sigue con su modelo por defecto, en espera.
    t.feed(OC_BAD_MODEL)
    await wait(400)
    expect(manager.get('ana')?.state).toBe('idle')
    expect(manager.get('ana')?.problem).toBe('Model anthropic/claude-sonnet-4-5 is not valid')
    // Su modelo por defecto es de paga y la cuenta no tiene saldo.
    t.feed(OC_NO_CREDIT)
    await wait(400)
    expect(manager.get('ana')?.problem).toMatch(/^Access denied, please make sure your account is in good standing/)
    // Ya pudo: trabaja y el aviso no está.
    t.feed(OC_WORKING('⬝⬝■■■■■■'))
    await wait(400)
    expect(manager.get('ana')?.problem).toBeUndefined()
    expect(seen).toEqual(['Model anthropic/claude-sonnet-4-5 is not valid', expect.stringMatching(/^Access denied/), null])
  })
})

describe('permisos del puesto en OpenCode', () => {
  it('pregunta todo lo que el manual no permite; lo prohibido gana y el comando orquest pasa', () => {
    const p = opencodePermissions({ edit: false, allow: ['npm test'], deny: ['git push'], install: false })
    expect(p.edit).toBe('ask')
    expect(Object.entries(p.bash)).toEqual([
      ['*', 'ask'],
      ['orquest', 'allow'],
      ['orquest *', 'allow'],
      ['npm test', 'allow'],
      ['npm test *', 'allow'],
      ['git push', 'deny'],
      ['git push *', 'deny'],
    ])
    expect(opencodePermissions({ edit: true, allow: [], deny: [] }).edit).toBe('allow')
  })

  it('al empleado le llegan en OPENCODE_PERMISSION; si no puede trabajar se avisa al usuario y al jefe', async () => {
    const { terminals, spawn } = screenPty()
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const clis = [
      { id: 'claude' as const, name: 'Claude Code', installed: true, session: true },
      { id: 'opencode' as const, name: 'OpenCode', installed: true, session: true },
    ]
    studio = await new Studio({ repo: repo(), manager, detect: async () => clis, mcpUrl: (t) => `http://127.0.0.1:1/mcp/${t}`, cli: { url: (t) => `http://127.0.0.1:1/cli/${t}`, dir: tmpdir() }, submitDelayMs: 0 }).init()
    const notices: string[] = []
    studio.on('notice', (n) => notices.push(n))
    await studio.hireBoss({ provider: 'claude', goal: 'Tienda' })
    terminals[0].feed(CLAUDE_PROMPT)
    const boss = { kind: 'boss' } as Parameters<Studio['call']>[0]
    await studio.call(boss, 'proponer_plantilla', { puestos: [{ puesto: 'backend', proveedor: 'opencode', modelo: 'anthropic/claude-sonnet-4-5', motivo: 'x' }] })
    studio.approveTemplate([{ id: studio.board.slots[0].id, role: 'backend', provider: 'opencode', model: 'anthropic/claude-sonnet-4-5' }])
    await studio.call(boss, 'levantar_empleado', { puesto: studio.board.slots[0].id })
    const t = terminals[1]
    const rules = JSON.parse(t.env.OPENCODE_PERMISSION)
    expect(rules.bash['*']).toBe('ask')
    expect(rules.bash['orquest *']).toBe('allow')
    // El jefe (Claude Code) no recibe esa variable.
    expect(terminals[0].env.OPENCODE_PERMISSION).toBeUndefined()

    // Su manual le llega pegado de una vez (tecleado tardaba más de un minuto en entrar).
    t.feed(OC_IDLE)
    await expect.poll(() => t.typed.find((x) => x.startsWith('\x1b[200~[Orquest]') && x.endsWith('\x1b[201~')), { timeout: 5000 }).toBeTruthy()

    terminals[0].typed.length = 0
    t.feed(OC_BAD_MODEL)
    await expect.poll(() => notices.some((n) => n.includes('Model anthropic/claude-sonnet-4-5 is not valid')), { timeout: 3000 }).toBe(true)
    await expect.poll(() => terminals[0].typed.join('').includes('is not valid'), { timeout: 5000 }).toBe(true)
  })
})

describe('avisos de no poder trabajar: solo los suyos', () => {
  it('el de su CLI cuenta; una cita del error de otro (en un mensaje o en lo que escribe) no', async () => {
    const { terminals, spawn } = screenPty()
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const seen: (string | null)[] = []
    manager.on('failure', (id, p) => seen.push(`${id}: ${p}`))
    const dir = repo()
    const office = { path: dir, branch: 'main' }
    await manager.hire({ id: 'jefe', provider: 'claude', role: 'jefe', repo: dir, office })
    await manager.hire({ id: 'beto', provider: 'codex', role: 'frontend', repo: dir, office })
    const [jefe, beto] = terminals
    // Lo que pasó: al jefe le llegó la respuesta del usuario citando el error de Beto, y lo comentó.
    const quoted = '[Orquest] El usuario contestó P11 (Beto (frontend) choca con "You\'ve hit your usage limit. Upgrade to Pro" usando Codex gpt-6-sol)'
    manager.write('jefe', quoted)
    jefe.feed(`${CLEAR}──────────────────────\r\n❯ ${quoted}\r\n──────────────────────\r\n● Beto no puede trabajar: su terminal dice "You've hit your usage limit".\r\n`)
    // Un renglón partido que abre justo con la frase, pero es lo que Orquest le escribió.
    jefe.feed('You\'ve hit your usage limit. Upgrade to Pro" usando Codex gpt-6-sol)\r\n')
    // Beto sí lo tiene: es el aviso de su CLI.
    beto.feed(`${CLEAR}■ You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro) or try again at 12:37 PM.\r\n› Ask Codex to do anything\r\n`)
    await wait(500)
    expect(manager.get('jefe')?.problem).toBeUndefined()
    expect(manager.get('beto')?.problem).toMatch(/^You’ve hit your usage limit/)
    expect(seen).toEqual([expect.stringMatching(/^beto: You’ve hit/)])
  })
})
