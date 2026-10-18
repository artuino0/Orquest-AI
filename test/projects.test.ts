import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EmployeeManager, type Pty, type Spawner } from '../src/core/employees.js'
import { Studio } from '../src/core/studio.js'

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'orquest-dos-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(dir, 'a.txt'), 'hola')
  git('add', '.')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'Inicio')
  return dir
}

const spawn: Spawner = () => {
  const pty: Pty = { pid: 1, onData: () => {}, onExit: () => {}, write: () => {}, resize: () => {}, kill: () => {} }
  return pty
}
const clis = [{ id: 'claude' as const, name: 'Claude Code', installed: true, session: true }]

let studios: Studio[] = []
afterEach(() => {
  for (const s of studios) {
    s.shutdown()
    s.manager.shutdown()
  }
  studios = []
})

async function open() {
  // Como en la app: cada proyecto con su propio manejador de terminales.
  const manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
  const s = await new Studio({ repo: repo(), manager, detect: async () => clis, mcpUrl: (t) => `http://127.0.0.1:1/mcp/${t}`, submitDelayMs: 0 }).init()
  studios.push(s)
  return s
}

describe('varios proyectos abiertos a la vez', () => {
  it('cada uno tiene su jefe, aunque los dos se llamen «jefe»', async () => {
    const a = await open()
    const b = await open()
    expect(b.bossOnline).toBe(false)
    await a.hireBoss({ provider: 'claude', goal: 'Tienda' })
    // El jefe de A no es el de B.
    expect(a.bossOnline).toBe(true)
    expect(b.bossOnline).toBe(false)
    await b.hireBoss({ provider: 'claude', goal: 'ERP' })
    expect(a.bossOnline).toBe(true)
    expect(b.bossOnline).toBe(true)
    expect(a.manager.get('jefe')?.office.path).not.toBe(b.manager.get('jefe')?.office.path)
  })
})
