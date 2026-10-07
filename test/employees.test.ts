import { execFileSync } from 'node:child_process'
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as pty from 'node-pty'
import { afterEach, describe, expect, it } from 'vitest'
import { EmployeeManager, type Spawner } from '../src/core/employees.js'
import type { EmployeeState } from '../src/core/state.js'
import { officeChanges } from '../src/core/worktree.js'

const realSpawn: Spawner = (file, args, o) => pty.spawn(file, args, { name: 'xterm-256color', ...o })

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orquest-repo-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@orquest.dev')
  git('config', 'user.name', 'Orquest')
  await writeFile(join(dir, 'README.md'), '# proyecto\n')
  git('add', '.')
  git('commit', '-qm', 'inicio')
  return dir
}

/** CLI falsa: anuncia que trabaja, escribe un archivo con sus argumentos y queda esperando. */
async function fakeCli(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orquest-bin-'))
  const file = join(dir, name)
  await writeFile(
    file,
    `#!/bin/sh
printf '\\033]7777;orquest:state=working\\007✻ Trabajando… (esc to interrupt)\\n'
echo "${name} $*" > trabajo-${name}.txt
sleep 0.3
printf '\\033]7777;orquest:state=idle\\007listo\\n> '
read linea
echo "recibido: $linea"
`,
  )
  await chmod(file, 0o755)
  return file
}

let manager: EmployeeManager | undefined
afterEach(() => manager?.shutdown())

describe('EmployeeManager', () => {
  it('tres empleados de proveedores distintos trabajan a la vez sin pisarse', async () => {
    const repo = await makeRepo()
    manager = new EmployeeManager(realSpawn, { quietMs: 5000 })
    const seen = new Map<string, EmployeeState[]>()
    manager.on('state', (id, s) => seen.set(id, [...(seen.get(id) ?? []), s]))

    const providers = ['claude', 'codex', 'opencode'] as const
    const team = await Promise.all(
      providers.map(async (p) =>
        manager!.hire({ provider: p, role: 'backend', repo, model: 'm1', binary: await fakeCli(p) }),
      ),
    )

    // Cada uno en su oficina y su rama.
    expect(new Set(team.map((e) => e.office.path)).size).toBe(3)
    expect(new Set(team.map((e) => e.office.branch)).size).toBe(3)

    await expect.poll(() => team.every((e) => e.state === 'idle'), { timeout: 10_000 }).toBe(true)

    for (const [i, e] of team.entries()) {
      const changes = await officeChanges(e.office)
      // Solo ve su propio archivo: nadie pisó a nadie.
      expect(changes.map((c) => c.path)).toEqual([`trabajo-${providers[i]}.txt`])
      expect(await readFile(join(e.office.path, changes[0].path), 'utf8')).toMatch(/(--model|-m) m1/)
      expect(seen.get(e.id)).toEqual(['working', 'idle'])
    }

    // Escribirle a uno llega solo a ese.
    const out: string[] = []
    manager.on('data', (id, d) => id === team[1].id && out.push(d))
    manager.write(team[1].id, 'hola\r')
    await expect.poll(() => out.join(''), { timeout: 5000 }).toContain('recibido: hola')
    await expect.poll(() => team[1].state, { timeout: 5000 }).toBe('exited')
    expect(team[0].state).toBe('idle')
    expect(manager.scrollback(team[0].id)).toContain('listo')
  }, 30_000)

  it('si la CLI no arranca, quita la oficina', async () => {
    const repo = await makeRepo()
    manager = new EmployeeManager(() => {
      throw new Error('no existe')
    })
    await expect(manager.hire({ provider: 'kimi', role: 'qa', repo })).rejects.toThrow('no existe')
    const list = execFileSync('git', ['worktree', 'list'], { cwd: repo, encoding: 'utf8' })
    expect(list.trim().split('\n')).toHaveLength(1)
  })
})
