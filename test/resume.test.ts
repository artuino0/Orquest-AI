import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EmployeeManager, type Pty, type Spawner } from '../src/core/employees.js'
import { StudioStore } from '../src/core/store.js'
import { BOSS_ID, Studio } from '../src/core/studio.js'

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orquest-retoma-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@orquest.dev')
  git('config', 'user.name', 'Orquest')
  await writeFile(join(dir, 'README.md'), '# tienda\n')
  git('add', '.')
  git('commit', '-qm', 'inicio')
  return dir
}

/** CLI de mentira que solo recuerda con qué argumentos la lanzaron. */
function recorder() {
  const launches: { id: string; args: string[] }[] = []
  const spawn: Spawner = (_file, args, o) => {
    launches.push({ id: o.env.ORQUEST_EMPLOYEE_ID, args })
    let onExit: (e: { exitCode: number }) => void = () => {}
    const pty: Pty = { pid: 1, onData: () => {}, onExit: (cb) => (onExit = cb), write: () => {}, resize: () => {}, kill: () => onExit({ exitCode: 0 }) }
    return pty
  }
  return { launches, spawn }
}

const open = async (repo: string, store: StudioStore, spawn: Spawner) => {
  const s = await new Studio({ repo, manager: new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 }), store, detect: async () => [], mcpUrl: (t) => `http://127.0.0.1:1/mcp/${t}` }).init()
  studios.push(s)
  return s
}
const studios: Studio[] = []
afterEach(() => studios.splice(0).forEach((s) => s.shutdown()))

const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1]

describe('retomar sesiones al reabrir la app', () => {
  it('el jefe vuelve solo, con la misma conversación', async () => {
    const repo = await makeRepo()
    const store = new StudioStore(join(await mkdtemp(join(tmpdir(), 'orquest-db-')), 'estudio.db'))

    const first = recorder()
    const a = await open(repo, store, first.spawn)
    await a.resume() // proyecto nuevo: no hay a quién retomar
    expect(first.launches).toHaveLength(0)
    await a.hireBoss({ provider: 'claude', model: 'opus', effort: 'high', goal: 'Tienda en línea' })
    const session = after(first.launches[0].args, '--session-id')
    expect(session).toMatch(/^[0-9a-f-]{36}$/)
    expect(a.snapshot().boss).toMatchObject({ provider: 'claude', model: 'opus', effort: 'high', sessionId: session })
    a.shutdown()

    // Se cierra la app y se vuelve a abrir el proyecto.
    const second = recorder()
    const b = await open(repo, store, second.spawn)
    expect(b.snapshot().bossOnline).toBe(false)
    await b.resume()
    expect(second.launches.map((l) => l.id)).toEqual([BOSS_ID])
    const args = second.launches[0].args
    expect(after(args, '--resume')).toBe(session)
    expect(args).not.toContain('--session-id')
    expect(after(args, '--model')).toBe('opus')
    expect(b.snapshot().bossOnline).toBe(true)
    // Retomar dos veces no lo duplica.
    await b.resume()
    expect(second.launches).toHaveLength(1)
  })

  it('a quien despediste no se le retoma', async () => {
    const repo = await makeRepo()
    const store = new StudioStore(join(await mkdtemp(join(tmpdir(), 'orquest-db-')), 'estudio.db'))
    const first = recorder()
    const a = await open(repo, store, first.spawn)
    await a.hireBoss({ provider: 'claude', goal: 'Tienda' })
    await a.fire(BOSS_ID)
    a.shutdown()

    const second = recorder()
    const b = await open(repo, store, second.spawn)
    await b.resume()
    expect(second.launches).toHaveLength(0)
  })

  it('cada CLI retoma a su manera', async () => {
    const repo = await makeRepo()
    const { launches, spawn } = recorder()
    const manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const office = { path: repo, branch: 'main' }
    // Codex no deja fijar el id: continúa la última de su carpeta, y el subcomando va primero.
    const codex = await manager.hire({ id: 'c1', provider: 'codex', model: 'gpt-x', role: 'backend', repo, office, session: { resume: true } })
    // (En Windows, instalado con npm, antes va el script que corre node.)
    const at = launches[0].args.indexOf('resume')
    expect(launches[0].args.slice(at, at + 4)).toEqual(['resume', '--last', '-m', 'gpt-x'])
    expect(at).toBeLessThanOrEqual(1)
    expect(codex).toMatchObject({ resumed: true, sessionId: undefined })
    // Sin pedir retomar, Codex arranca normal.
    await manager.hire({ id: 'c2', provider: 'codex', role: 'backend', repo, office })
    expect(launches[1].args).not.toContain('resume')
    // Claude sin id guardado no puede retomar: nace una conversación nueva con su id.
    const claude = await manager.hire({ id: 'k1', provider: 'claude', role: 'qa', repo, office, session: { resume: true } })
    expect(launches[2].args).toContain('--session-id')
    expect(launches[2].args).not.toContain('--resume')
    expect(claude.resumed).toBe(false)
    // Kimi no sabe retomar: arranca de cero.
    const kimi = await manager.hire({ id: 'm1', provider: 'kimi', role: 'qa', repo, office, session: { resume: true } })
    expect(launches[3].args.join(' ')).not.toMatch(/resume|continue|session/)
    expect(kimi.resumed).toBe(false)
    manager.shutdown?.()
  })
})
