import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliStatus } from '../src/core/detect.js'
import { EmployeeManager, type Spawner } from '../src/core/employees.js'
import { BOSS_ID, Studio } from '../src/core/studio.js'
import { sample } from './trazozip.js'

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orquest-estudio-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@orquest.dev')
  git('config', 'user.name', 'Orquest')
  await writeFile(join(dir, 'README.md'), '# tienda\n')
  git('add', '.')
  git('commit', '-qm', 'inicio')
  return dir
}

/** CLI de mentira: muestra su prompt enseguida y guarda lo que se le escribe. */
const typed = new Map<string, string>()
const fakeSpawn: Spawner = (_file, _args, o) => {
  const id = o.env.ORQUEST_EMPLOYEE_ID
  typed.set(id, '')
  let onExit: (e: { exitCode: number }) => void = () => {}
  return {
    pid: 1,
    onData: (cb) => setTimeout(() => cb('\x1b[2J\x1b[H> \r\n? for shortcuts · ⏎ send'), 5),
    onExit: (cb) => (onExit = cb),
    write: (d) => typed.set(id, typed.get(id) + d),
    resize: () => {},
    kill: () => onExit({ exitCode: 0 }),
  }
}

const CLIS: CliStatus[] = [{ id: 'claude', name: 'Claude Code', installed: true, session: true, version: '2' }]

let studio: Studio | undefined
afterEach(() => studio?.shutdown())

async function setup() {
  const repo = await makeRepo()
  const manager = new EmployeeManager(fakeSpawn, { quietMs: 20, settleMs: 0 })
  studio = await new Studio({ repo, manager, detect: async () => CLIS, mcpUrl: (t) => `http://127.0.0.1:1/mcp/${t}`, replyTimeoutMs: 2000, submitDelayMs: 0 }).init()
  return { repo, studio }
}

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms))

describe('Estudio: el diseño del proyecto y su diseñador', () => {
  it('sin diseño, leer_diseno lo dice; elegido, lo leen el jefe y los empleados', async () => {
    const { repo, studio: s } = await setup()
    await s.hireBoss({ provider: 'claude', goal: 'Tienda' })
    const boss = { kind: 'boss' as const }
    await expect(s.call(boss, 'leer_diseno', {})).rejects.toThrow(/todavía no tiene diseño/)

    const file = join(repo, 'diseno', 'tienda.trazo')
    await s.chooseDesign(file)
    expect(await s.designFile()).toBe(file)
    // Dentro del proyecto se anota relativo.
    expect(JSON.parse(await readFile(join(repo, '.orquest', 'estudio.json'), 'utf8')).archivo).toBe('diseno/tienda.trazo')
    await expect(s.call(boss, 'leer_diseno', {})).rejects.toThrow(/No se encontró el diseño/)

    await s.saveDesign(sample())
    expect(await s.call(boss, 'leer_diseno', {})).toContain('Diseño «Tienda»')
    expect(await s.call(boss, 'leer_diseno', { pagina: 'Inicio' })).toContain('#titulo')
    expect(JSON.parse(await s.call(boss, 'leer_diseno', { nodo: 'titulo' })).text).toBe('Hola')
    expect(Buffer.from((await s.readDesign())!).equals(sample())).toBe(true)
    await tick()
    expect(typed.get(BOSS_ID)).toContain('leer_diseno')
  })

  it('un .trazo es lo único que se acepta como diseño', async () => {
    const { repo, studio: s } = await setup()
    await expect(s.chooseDesign(join(repo, 'notas.txt'))).rejects.toThrow(/\.trazo/)
  })

  it('el usuario contrata al diseñador sin el jefe y sin tocar su propuesta', async () => {
    const { studio: s } = await setup()
    await s.hireBoss({ provider: 'claude', goal: 'Tienda' })
    await s.call({ kind: 'boss' }, 'proponer_plantilla', { puestos: [{ puesto: 'backend', proveedor: 'claude', motivo: 'x' }] })

    const hired = await s.hireDesigner({ provider: 'claude', name: 'Dalia', model: 'opus' })
    expect(hired.name).toBe('Dalia')
    expect(s.designer()?.id).toBe(hired.id)
    expect(s.board.slots.filter((x) => x.status === 'proposed')).toHaveLength(1)
    await tick()
    expect(typed.get(hired.id)).toContain('Te contrató el usuario directamente')
    expect(typed.get(BOSS_ID)).toContain('como diseño')

    // Nombre repetido: no queda un puesto colgado.
    await expect(s.hireDesigner({ provider: 'claude', name: 'dalia' })).rejects.toThrow(/Ya hay alguien llamado/)
    expect(s.board.slots.filter((x) => x.role === 'diseno')).toHaveLength(1)

    // Lee el diseño como todos.
    await expect(s.call({ kind: 'employee', id: hired.id }, 'leer_diseno', {})).rejects.toThrow(/todavía no tiene diseño/)
  })
})
