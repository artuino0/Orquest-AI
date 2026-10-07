import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliStatus } from '../src/core/detect.js'
import { EmployeeManager, type Pty, type Spawner } from '../src/core/employees.js'
import { defaultManual, Library } from '../src/core/library.js'
import { startMcpServer, type McpHandle } from '../src/core/mcp.js'
import { StudioStore } from '../src/core/store.js'
import { BOSS_ID, Studio } from '../src/core/studio.js'

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orquest-p3-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@orquest.dev')
  git('config', 'user.name', 'Orquest')
  await writeFile(join(dir, 'README.md'), '# p3\n')
  git('add', '.')
  git('commit', '-qm', 'inicio')
  return dir
}

const launched = new Map<string, string[]>()
const spawn: Spawner = (_f, args, o) => {
  launched.set(o.env.ORQUEST_EMPLOYEE_ID, args)
  let exit: (e: { exitCode: number }) => void = () => {}
  const pty: Pty = {
    pid: 1,
    onData: (cb) => setTimeout(() => cb('\x1b[2J\x1b[H> \r\n? for shortcuts'), 5),
    onExit: (cb) => (exit = cb),
    write: () => {},
    resize: () => {},
    kill: () => exit({ exitCode: 0 }),
  }
  return pty
}

const CLIS: CliStatus[] = [
  { id: 'claude', name: 'Claude Code', installed: true, session: true },
  { id: 'antigravity', name: 'Antigravity', installed: true, session: null },
]

let mcp: McpHandle | undefined
const studios: Studio[] = []
afterEach(async () => {
  for (const s of studios.splice(0)) s.shutdown()
  await mcp?.close()
})

async function open(repo: string, library: Library) {
  const manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
  let s!: Studio
  mcp = await startMcpServer((t) => {
    const c = s.caller(t)
    return c && { studio: s, caller: c }
  })
  s = await new Studio({ repo, manager, library, detect: async () => CLIS, mcpUrl: (t) => mcp!.url(t) }).init()
  studios.push(s)
  await s.hireBoss({ provider: 'claude', goal: 'x' })
  const args = launched.get(BOSS_ID)!
  const url = JSON.parse(args[args.indexOf('--mcp-config') + 1]).mcpServers.orquest.url
  const client = new Client({ name: 'jefe', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url)))
  const call = async (name: string, a: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: a })) as { isError?: boolean; content: { text: string }[] }
    return { error: !!r.isError, text: r.content[0].text }
  }
  return { s, manager, call, client }
}

describe('fase 3: expedientes y manuales', () => {
  it('el juego impide un puesto prohibido: al proponer, al aprobar y al levantar', async () => {
    const repo = await makeRepo()
    const lib = new Library()
    const { s, call, client } = await open(repo, lib)

    // El jefe no puede proponer a Antigravity en backend; el motivo trae la nota del usuario.
    const r = await call('proponer_plantilla', { puestos: [{ puesto: 'backend', proveedor: 'antigravity', motivo: 'x' }] })
    expect(r.error).toBe(true)
    expect(r.text).toContain('solo permite qa; no backend')
    expect(r.text).toContain('malo escribiendo código')
    expect(s.board.slots).toHaveLength(0)

    // En QA sí.
    expect((await call('proponer_plantilla', { puestos: [{ puesto: 'qa', proveedor: 'antigravity', motivo: 'flujos en navegador' }] })).error).toBe(false)

    // El usuario tampoco puede aprobarlo en backend.
    expect(() => s.approveTemplate([{ role: 'backend', provider: 'antigravity' }])).toThrow(/no backend/)

    // Si el usuario cambia el expediente después de aprobar, levantar respeta el cambio.
    s.approveTemplate([{ id: s.board.slots[0].id, role: 'qa', provider: 'antigravity' }])
    lib.saveDossier({ provider: 'antigravity', model: '', allowedRoles: ['frontend'], enforce: 'block', notes: '' })
    const up = await call('levantar_empleado', { puesto: 'qa' })
    expect(up.error).toBe(true)
    expect(up.text).toContain('solo permite frontend')

    // En modo aviso se deja, y el jefe recibe el aviso.
    lib.saveDossier({ provider: 'antigravity', model: '', allowedRoles: ['frontend'], enforce: 'warn', notes: '' })
    const warned = await call('levantar_empleado', { puesto: 'qa' })
    expect(warned.error).toBe(false)
    expect(warned.text).toContain('Avisos')
    await client.close()
  })

  it('el historial se llena solo y el jefe lo lee en los expedientes, entre proyectos', async () => {
    const dbPath = join(await mkdtemp(join(tmpdir(), 'orquest-p3db-')), 'studio.db')
    const lib = new Library(new StudioStore(dbPath))
    const repo = await makeRepo()
    const { s, manager, call, client } = await open(repo, lib)
    const boss = { kind: 'boss' } as const

    await call('proponer_plantilla', {
      puestos: [
        { puesto: 'backend', proveedor: 'claude', modelo: 'sonnet', motivo: 'x' },
        { puesto: 'qa', proveedor: 'claude', modelo: 'haiku', motivo: 'y' },
      ],
    })
    s.approveTemplate(s.board.slots.map((x) => ({ id: x.id, role: x.role, provider: x.provider, model: x.model })))
    await call('levantar_empleado', { puesto: 'backend' })
    await call('levantar_empleado', { puesto: 'qa' })
    const be = s.board.staff.find((m) => m.role === 'backend')!.id
    const qa = s.board.staff.find((m) => m.role === 'qa')!.id

    // Entrega, QA rechaza, corrige, QA aprueba, jefe aprueba, usuario integra.
    await s.call(boss, 'asignar_tarea', { empleado: be, titulo: 'API' })
    await s.call({ kind: 'employee', id: be }, 'leer_tarea', {})
    await writeFile(join(manager.get(be)!.office.path, 'api.js'), 'v1\n')
    await s.call({ kind: 'employee', id: be }, 'entregar', { reporte: 'v1' })
    await s.call(boss, 'mandar_a_qa', { tarea: 'T1', empleado_qa: qa, instrucciones: 'prueba' })
    await s.call({ kind: 'employee', id: qa }, 'entregar', { reporte: 'falla', veredicto: 'no_pasa' })
    await writeFile(join(manager.get(be)!.office.path, 'api.js'), 'v2\n')
    await s.call({ kind: 'employee', id: be }, 'entregar', { reporte: 'v2' })
    await s.call(boss, 'revisar_entrega', { tarea: 'T1', decision: 'aprobar' })
    await s.merge('T1')

    // Segunda tarea: a la primera.
    await s.call(boss, 'asignar_tarea', { empleado: be, titulo: 'Docs' })
    await s.call({ kind: 'employee', id: be }, 'leer_tarea', {})
    await writeFile(join(manager.get(be)!.office.path, 'docs.md'), 'ok\n')
    await s.call({ kind: 'employee', id: be }, 'entregar', { reporte: 'docs' })
    // T2 fue la revisión de QA; esta es T3.
    await s.call(boss, 'revisar_entrega', { tarea: 'T3', decision: 'aprobar' })
    await s.merge('T3')
    await client.close()

    // Otro proyecto, otro estudio, misma biblioteca (SQLite): el jefe ve el historial.
    const other = await open(await makeRepo(), new Library(new StudioStore(dbPath)))
    const exp = JSON.parse((await other.call('leer_expedientes')).text)
    const claude = exp.find((e: any) => e.proveedor === 'claude')
    expect(claude.historial_contigo).toMatchObject({ entregas: 3, integradas: 2, a_la_primera: 1, rechazos_qa: 1, aprobadas_a_la_primera: 50 })
    expect(claude.por_modelo.sonnet.por_puesto.backend).toEqual({ integradas: 2, a_la_primera: 1 })
    expect(exp.find((e: any) => e.proveedor === 'antigravity')).toMatchObject({ puestos_permitidos: ['qa'], si_no_se_permite: 'el juego lo rechaza' })
    await other.client.close()
  })

  it('el manual del puesto define permisos, prompt y formato de entrega', async () => {
    const repo = await makeRepo()
    const lib = new Library()
    lib.saveManual({
      ...defaultManual('frontend'),
      prompt: 'Frontend con Vue 3.',
      docs: ['docs/estilo.md'],
      permissions: { edit: true, allow: ['npm run dev'], deny: ['git push'] },
      requireScreenshots: true,
    })
    lib.saveManual({ ...defaultManual('qa'), permissions: { edit: false, allow: ['npm test'], deny: [] } })
    const { s, call, client } = await open(repo, lib)
    await call('proponer_plantilla', {
      puestos: [
        { puesto: 'frontend', proveedor: 'claude', motivo: 'x' },
        { puesto: 'qa', proveedor: 'claude', motivo: 'y' },
      ],
    })
    s.approveTemplate(s.board.slots.map((x) => ({ id: x.id, role: x.role, provider: x.provider })))
    await call('levantar_empleado', { puesto: 'frontend' })
    await call('levantar_empleado', { puesto: 'qa' })
    const fe = s.board.staff.find((m) => m.role === 'frontend')!.id
    const qa = s.board.staff.find((m) => m.role === 'qa')!.id

    const perms = (id: string) => {
      const a = launched.get(id)!
      return JSON.parse(a[a.indexOf('--settings') + 1]).permissions
    }
    expect(perms(fe).allow).toEqual(expect.arrayContaining(['Edit', 'Bash(npm run dev:*)']))
    expect(perms(fe).deny).toContain('Bash(git push:*)')
    expect(perms(qa).deny).toEqual(expect.arrayContaining(['Edit', 'Write']))
    // El jefe no edita ni integra por su cuenta.
    expect(perms(BOSS_ID).deny).toEqual(expect.arrayContaining(['Edit', 'Bash(git merge:*)', 'Bash(git push:*)']))

    // El manual pide capturas: sin ellas, la entrega se rechaza con el formato.
    await s.call({ kind: 'boss' }, 'asignar_tarea', { empleado: fe, titulo: 'Pantalla' })
    const tarea = JSON.parse(await s.call({ kind: 'employee', id: fe }, 'leer_tarea', {}))
    expect(tarea.entrega_esperada).toContain('Capturas obligatorias')
    await expect(s.call({ kind: 'employee', id: fe }, 'entregar', { reporte: 'listo' })).rejects.toThrow(/pide capturas/)
    expect(await s.call({ kind: 'employee', id: fe }, 'entregar', { reporte: 'listo', capturas: ['shots/home.png'] })).toContain('Entrega recibida')
    await client.close()
  })
})
