import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Board } from '../src/core/board.js'
import type { CliStatus } from '../src/core/detect.js'
import { EmployeeManager, type Pty, type Spawner } from '../src/core/employees.js'
import { Journal, MAX_FACTS } from '../src/core/journal.js'
import { startMcpServer, type McpHandle } from '../src/core/mcp.js'
import { pickName, slug } from '../src/core/names.js'
import { PROVIDERS } from '../src/core/providers.js'
import { ScreenReader } from '../src/core/state.js'
import { BOSS_ID, Studio } from '../src/core/studio.js'

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orquest-mem-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@orquest.dev')
  git('config', 'user.name', 'Orquest')
  await writeFile(join(dir, 'README.md'), '# mem\n')
  git('add', '.')
  git('commit', '-qm', 'inicio')
  return dir
}

describe('nombres', () => {
  it('cada contratado recibe un nombre libre; el usuario lo cambia; no se repiten', () => {
    const b = new Board()
    b.propose([{ role: 'backend', provider: 'claude' }, { role: 'qa', provider: 'claude' }], () => true)
    expect(b.slots.map((s) => s.name)).toEqual(['Ana', 'Beto'])
    expect(() => b.approve(b.slots.map((s) => ({ id: s.id, role: s.role, provider: s.provider, name: 'Lupita' })))).toThrow('Ya hay alguien llamado Lupita')
    b.approve([
      { id: b.slots[0].id, role: 'backend', provider: 'claude', name: 'Lupita' },
      { id: b.slots[1].id, role: 'qa', provider: 'claude' },
    ])
    expect(b.slots.map((s) => s.name)).toEqual(['Lupita', 'Beto'])
    b.hired(b.takeSlot('lupita'), { id: 'lupita-backend', role: 'backend', provider: 'claude' })
    expect(b.member('LUPITA').id).toBe('lupita-backend')
    expect(pickName(['Ana', 'ana'])).toBe('Beto')
    expect(slug('Inés Peña')).toBe('ines-pena')
  })
})

describe('bitácora', () => {
  it('separa traspaso y hechos, recorta los hechos y no pierde escrituras simultáneas', async () => {
    const j = new Journal(await mkdtemp(join(tmpdir(), 'orquest-j-')))
    const o = { id: 'ana-backend', name: 'Ana', role: 'backend', provider: 'claude', model: 'haiku' }
    await j.open(o)
    await Promise.all(Array.from({ length: MAX_FACTS + 10 }, (_, i) => j.fact(o, `hecho ${i}`)))
    await j.handoff(o, '## Pendiente\nFalta paginar /tareas.')
    const text = await j.read('ana-backend')
    expect(text).toContain('# Bitácora de Ana (backend · claude haiku)')
    expect(text).toContain('Falta paginar /tareas.')
    expect(text.match(/^- /gm)).toHaveLength(MAX_FACTS)
    expect(text).toContain(`hecho ${MAX_FACTS + 9}`)
    expect(text).not.toContain('hecho 0\n')
    await expect(j.handoff(o, 'x'.repeat(7000))).rejects.toThrow(/Resume/)
  })
})

describe('contexto en pantalla', () => {
  it('lee el % de contexto que muestran Claude Code y Codex', async () => {
    const seen: number[] = []
    const r = new ScreenReader(PROVIDERS.claude.screen, { onContext: (p) => seen.push(p) })
    await r.write('> \r\n? for shortcuts   Context low (12% remaining)')
    expect(r.context()).toBe(88)
    expect(seen).toEqual([88])
    expect(PROVIDERS.codex.screen.context!('⏎ send   37% context left')).toBe(63)
  })
})

// ── Burnout de punta a punta ─────────────────────────────────────────────────

const launches = new Map<string, number>()
const typed = new Map<string, string>()
const cwds = new Map<string, string[]>()
const spawn: Spawner = (_f, _args, o) => {
  const id = o.env.ORQUEST_EMPLOYEE_ID
  launches.set(id, (launches.get(id) ?? 0) + 1)
  cwds.set(id, [...(cwds.get(id) ?? []), o.cwd])
  typed.set(id, '')
  let exit: (e: { exitCode: number }) => void = () => {}
  let data: (d: string) => void = () => {}
  const pty: Pty = {
    pid: 1,
    onData: (cb) => {
      data = cb
      setTimeout(() => data('\x1b[2J\x1b[H> \r\n? for shortcuts'), 5)
    },
    onExit: (cb) => (exit = cb),
    write: (d) => typed.set(id, typed.get(id) + d),
    resize: () => {},
    kill: () => setTimeout(() => exit({ exitCode: 0 }), 5),
  }
  return pty
}
const CLIS: CliStatus[] = [{ id: 'claude', name: 'Claude Code', installed: true, session: true }]
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms))

let mcp: McpHandle | undefined
let studio: Studio | undefined
afterEach(async () => {
  studio?.shutdown()
  await mcp?.close()
})

async function setup() {
  launches.clear()
  cwds.clear()
  const repo = await makeRepo()
  const manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
  let s!: Studio
  mcp = await startMcpServer((t) => {
    const c = s.caller(t)
    return c && { studio: s, caller: c }
  })
  s = await new Studio({
    repo,
    manager,
    detect: async () => CLIS,
    mcpUrl: (t) => mcp!.url(t),
    statusUrl: (t) => mcp!.statusUrl(t),
    burnoutAt: 80,
    handoffTimeoutMs: 3000,
    submitDelayMs: 0,
  }).init()
  studio = s
  await s.hireBoss({ provider: 'claude', goal: 'x' })
  s.board.propose([{ role: 'backend', provider: 'claude' }], () => true)
  s.approveTemplate([{ id: s.board.slots[0].id, role: 'backend', provider: 'claude', name: 'Ana' }])
  await s.call({ kind: 'boss' }, 'levantar_empleado', { puesto: 'Ana' })
  return { repo, manager, s, id: 'ana-backend' }
}

/** Lo que haría la barra de estado de Claude Code: POST con el JSON de estado. */
async function reportContext(s: Studio, id: string, pct: number) {
  const args = (s as any).launches.get(id).req.extraArgs as string[]
  const settings = JSON.parse(args[args.indexOf('--settings') + 1])
  const url = /'(http[^']+)'/.exec(settings.statusLine.command)![1]
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ context_window: { used_percentage: pct } }) })
  expect(r.status).toBe(204)
}

describe('burnout', () => {
  it('con el contexto lleno escribe su traspaso, juega, se reinicia limpio en su oficina y vuelve leyendo su bitácora', async () => {
    const { s, manager, id, repo } = await setup()
    await s.call({ kind: 'boss' }, 'asignar_tarea', { empleado: 'Ana', titulo: 'API de tareas' })
    await tick()

    await reportContext(s, id, 15)
    await reportContext(s, id, 85)
    await tick()
    expect(manager.get(id)!.context).toBe(85)
    expect(s.snapshot().hints[id]).toEqual({ state: 'gaming' })
    expect(typed.get(id)).toContain('escribir_traspaso')

    expect(await s.call({ kind: 'employee', id }, 'escribir_traspaso', { traspaso: 'Hice GET /tareas. Falta POST. Ojo: ids son uuid.' })).toContain('Ahora descansas')
    await tick(300)

    expect(launches.get(id)).toBe(2)
    expect(new Set(cwds.get(id))).toEqual(new Set([join(repo, '.orquest', 'oficinas', id)]))
    expect(typed.get(id)).toContain('Volviste de descansar')
    expect(typed.get(id)).toContain(join(repo, '.orquest', 'bitacoras', `${id}.md`))
    expect(s.board.staff.find((m) => m.id === id)!.online).toBe(true)
    expect(s.snapshot().hints[id]).toBeUndefined()

    const journal = await readFile(join(repo, '.orquest', 'bitacoras', `${id}.md`), 'utf8')
    expect(journal).toContain('Falta POST. Ojo: ids son uuid.')
    expect(journal).toMatch(/T1 asignada: API de tareas/)
    expect(journal).toMatch(/se fue a jugar videojuegos para limpiar contexto \(contexto al 85%\)/)
    expect(journal).toMatch(/volvió de descansar/)
    // Las bitácoras no se cuelan en git.
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' })).toBe('')
  })

  it('no entra en ciclo: tras volver, tiene que trabajar antes de descansar otra vez', async () => {
    const { s, id } = await setup()
    ;(s as any).opts.burnoutAt = 20
    // Arranca con 15% (manual y herramientas): es su piso.
    await reportContext(s, id, 15)
    await reportContext(s, id, 22)
    await tick()
    expect(s.snapshot().hints[id]).toBeUndefined()
    await reportContext(s, id, 26)
    await tick()
    expect(s.snapshot().hints[id]).toEqual({ state: 'gaming' })
    await s.call({ kind: 'employee', id }, 'escribir_traspaso', { traspaso: 'ok' })
    await tick(300)
    expect(launches.get(id)).toBe(2)
    // Sesión nueva: vuelve a reportar su piso y no se va a jugar otra vez.
    await reportContext(s, id, 21)
    await tick()
    expect(s.snapshot().hints[id]).toBeUndefined()
  })

  it('no lo interrumpe a media tarea: descansa al terminar su turno', async () => {
    const { s, manager, id } = await setup()
    await tick() // que pase el arranque
    manager.report(id, 'working')
    await reportContext(s, id, 15)
    await reportContext(s, id, 90)
    await tick()
    expect(s.snapshot().hints[id]).toBeUndefined()
    manager.report(id, 'idle')
    await tick()
    expect(s.snapshot().hints[id]).toEqual({ state: 'gaming' })
    await s.call({ kind: 'employee', id }, 'escribir_traspaso', { traspaso: 'listo' })
    await tick(300)
    expect(launches.get(id)).toBe(2)
  })

  it('si no escribe el traspaso a tiempo, se reinicia igual', async () => {
    const { s, id } = await setup()
    ;(s as any).opts.handoffTimeoutMs = 100
    await s.rest(id)
    expect(launches.get(id)).toBe(2)
  })

  it('el jefe también descansa', async () => {
    const { s } = await setup()
    const resting = s.rest(BOSS_ID)
    await tick()
    expect(s.snapshot().hints[BOSS_ID]).toEqual({ state: 'gaming' })
    await s.call({ kind: 'boss' }, 'escribir_traspaso', { traspaso: 'Plantilla: Ana en backend. Falta QA.' })
    await resting
    expect(launches.get(BOSS_ID)).toBe(2)
    await tick()
    expect(typed.get(BOSS_ID)).toContain('leer_proyecto')
  })
})

describe('capacitación', () => {
  it('al despedir, quien ocupe el puesto recibe la bitácora de su antecesor', async () => {
    const { s, id, repo } = await setup()
    await s.call({ kind: 'employee', id }, 'escribir_traspaso', { traspaso: 'El contrato vive en docs/api.md.' })
    await s.fire(id)
    s.board.propose([{ role: 'backend', provider: 'claude' }], () => true)
    s.approveTemplate([{ id: s.board.slots.find((x) => x.status === 'proposed')!.id, role: 'backend', provider: 'claude' }])
    const r = await s.call({ kind: 'boss' }, 'levantar_empleado', { puesto: 'backend' })
    const nuevo = s.board.staff.find((m) => m.online && m.role === 'backend')!
    expect(nuevo.name).not.toBe('Ana')
    expect(r).toContain(nuevo.name)
    await tick()
    expect(typed.get(nuevo.id)).toContain(`estuvo Ana: ${join(repo, '.orquest', 'bitacoras', `${id}.md`)}`)
    expect(await readFile(join(repo, '.orquest', 'bitacoras', `${id}.md`), 'utf8')).toContain('despedido')
  })
})
