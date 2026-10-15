import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EmployeeManager, type Pty, type Spawner } from '../src/core/employees.js'
import { PROVIDERS } from '../src/core/providers.js'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'orquest-agy-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(dir, 'a.txt'), 'hola')
  git('add', '.')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'Inicio')
  return dir
}

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

// Tal como las pinta agy 1.3.6 (vistas con su CLI real).
const CLEAR = '\x1b[2J\x1b[H'
const box = (...lines: string[]) => `${CLEAR}${lines.join('\r\n')}\r\n`
const LINE = '─'.repeat(60)
const AGY_TRUST = box(' Accessing workspace:', ' Do you trust the contents of this project?', ' > Yes, I trust this folder', '   No, exit', ' ↑/↓ Navigate · enter Confirm')
const AGY_IDLE = box(LINE, '>', LINE, '? for shortcuts                                 Gemini 3.8 Flash · high')
const AGY_WORKING = (frame: string) => box('> Run the shell command: git status', LINE, `${frame} Generating...`, '>', LINE, 'esc to cancel                                   Gemini 3.8 Flash · high')

let manager: EmployeeManager | undefined
afterEach(() => {
  manager?.shutdown()
  manager = undefined
})

describe('agy en pantalla', () => {
  it('pregunta si confías en la carpeta, espera y trabaja', async () => {
    const { terminals, spawn } = screenPty()
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const dir = repo()
    await manager.hire({ id: 'ana', provider: 'antigravity', role: 'backend', repo: dir, office: { path: dir, branch: 'main' } })
    const [t] = terminals
    t.feed(AGY_TRUST)
    await wait(60)
    expect(manager.get('ana')?.state).toBe('blocked')
    expect(manager.blockedBy('ana')).toBe('trust')
    manager.answerBlock('ana')
    await wait(260)
    expect(t.typed.join('')).toBe('\r')
    t.feed(AGY_IDLE)
    await wait(60)
    expect(manager.get('ana')?.state).toBe('idle')
    t.feed(AGY_WORKING('⣯'))
    await wait(10)
    t.feed(AGY_WORKING('⢿'))
    await wait(60)
    expect(manager.get('ana')?.state).toBe('working')
  })
})

describe('lo prohibido del manual en agy', () => {
  const permissions = { edit: true, allow: ['npm test'], deny: ['git push', 'rm -rf'] }

  it('su oficina recibe el gancho, fuera de git, y su terminal la lista de prohibidos', async () => {
    const { terminals, spawn } = screenPty()
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const dir = repo()
    const a = PROVIDERS.antigravity
    const emp = await manager.hire({
      id: 'ana',
      provider: 'antigravity',
      role: 'backend',
      repo: dir,
      env: a.connectEnv!({ url: 'x', permissions }),
      files: a.workspaceFiles!({ url: 'x', permissions }),
    })
    const hooks = JSON.parse(readFileSync(join(emp.office.path, '.agents', 'hooks.json'), 'utf8'))
    expect(hooks.orquest.PreToolUse[0]).toMatchObject({ matcher: 'run_command', hooks: [{ type: 'command', command: 'orquest gancho-agy' }] })
    expect(JSON.parse(terminals[0].env.ORQUEST_DENY)).toEqual(['git push', 'rm -rf'])
    // No se cuela en una entrega.
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: emp.office.path, encoding: 'utf8' })).toBe('')
    expect(emp.warnings.join(' ')).not.toMatch(/ya trae/)
  })

  it('si el proyecto ya trae su .agents/hooks.json, no se toca y se avisa', async () => {
    const { spawn } = screenPty()
    manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const dir = repo()
    const theirs = '{"suyo": {}}\n'
    const office = { path: dir, branch: 'main' }
    mkdirSync(join(dir, '.agents'), { recursive: true })
    writeFileSync(join(dir, '.agents', 'hooks.json'), theirs)
    const emp = await manager.hire({ id: 'ana', provider: 'antigravity', role: 'backend', repo: dir, office, files: PROVIDERS.antigravity.workspaceFiles!({ url: 'x', permissions }) })
    expect(readFileSync(join(dir, '.agents', 'hooks.json'), 'utf8')).toBe(theirs)
    expect(emp.warnings.join(' ')).toMatch(/ya trae \.agents\/hooks\.json/)
  })

  it('el gancho niega lo prohibido, también encadenado, y deja pasar lo demás', () => {
    const hook = (line: string, name = 'run_command') =>
      JSON.parse(
        execFileSync(process.execPath, [resolve('src/cli/orquest.mjs'), 'gancho-agy'], {
          input: JSON.stringify({ toolCall: { name, args: { CommandLine: line } } }),
          env: { ...process.env, ORQUEST_DENY: JSON.stringify(permissions.deny), ORQUEST_URL: '' },
          encoding: 'utf8',
        }),
      )
    expect(hook('git push origin main')).toMatchObject({ decision: 'deny' })
    expect(hook('cd api && git push')).toMatchObject({ decision: 'deny' })
    expect(hook('rm -rf dist')).toMatchObject({ decision: 'deny' })
    expect(hook('git pushy')).toEqual({ decision: 'allow' })
    expect(hook('npm test')).toEqual({ decision: 'allow' })
    expect(hook('git push', 'view_file')).toEqual({ decision: 'allow' })
  })
})
