import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
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
import { RuleError } from '../src/core/board.js'

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
const envs = new Map<string, Record<string, string>>()
const spawn: Spawner = (_f, args, o) => {
  launched.set(o.env.ORQUEST_EMPLOYEE_ID, args)
  envs.set(o.env.ORQUEST_EMPLOYEE_ID, o.env)
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
  { id: 'codex', name: 'Codex', installed: true, session: true },
  { id: 'antigravity', name: 'Antigravity', installed: true, session: null },
]

let mcp: McpHandle | undefined
const studios: Studio[] = []
afterEach(async () => {
  for (const s of studios.splice(0)) s.shutdown()
  await mcp?.close()
})

async function open(repo: string, library: Library, extra: { handoffTimeoutMs?: number; home?: string } = {}) {
  const manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
  let s!: Studio
  mcp = await startMcpServer((t) => {
    const c = s.caller(t)
    return c && { studio: s, caller: c }
  })
  s = await new Studio({ repo, manager, library, detect: async () => CLIS, mcpUrl: (t) => mcp!.url(t), submitDelayMs: 0, ...extra }).init()
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

  it('lo que el usuario cambia en la plantilla (modelo y esfuerzo) es con lo que se lanza la terminal', async () => {
    const repo = await makeRepo()
    const { s, call } = await open(repo, new Library())
    expect((await call('proponer_plantilla', { puestos: [{ puesto: 'backend', proveedor: 'claude', modelo: 'opus', esfuerzo: 'high', motivo: 'x' }] })).error).toBe(false)
    const slot = s.board.slots[0]
    expect(slot).toMatchObject({ model: 'opus', effort: 'high' })
    // El usuario lo ajusta antes de aprobar.
    s.approveTemplate([{ id: slot.id, role: 'backend', provider: 'claude', model: 'sonnet', effort: 'low' }])
    const up = await call('levantar_empleado', { puesto: slot.id })
    expect(up.error).toBe(false)
    const id = s.board.staff[0].id
    const args = launched.get(id)!
    expect(args[args.indexOf('--model') + 1]).toBe('sonnet')
    expect(args[args.indexOf('--effort') + 1]).toBe('low')
    expect(s.board.staff[0]).toMatchObject({ model: 'sonnet', effort: 'low' })
  })

  it('al cambiarle modelo y esfuerzo a un empleado, deja su traspaso y vuelve a entrar con lo nuevo', async () => {
    const repo = await makeRepo()
    const { s, call } = await open(repo, new Library(), { handoffTimeoutMs: 50 })
    await call('proponer_plantilla', { puestos: [{ puesto: 'backend', proveedor: 'claude', modelo: 'opus', esfuerzo: 'high', motivo: 'x' }] })
    s.approveTemplate([{ id: s.board.slots[0].id, role: 'backend', provider: 'claude', model: 'opus', effort: 'high' }])
    await call('levantar_empleado', { puesto: s.board.slots[0].id })
    const id = s.board.staff[0].id
    const before = launched.get(id)!
    // El proveedor de un empleado no se cambia.
    await expect(s.retune(id, { provider: 'codex', model: 'gpt-5' })).rejects.toThrow(/no se cambia/)
    await s.retune(id, { model: 'sonnet', effort: 'low' })
    expect(s.board.staff[0]).toMatchObject({ model: 'sonnet', effort: 'low' })
    expect(s.board.slots[0]).toMatchObject({ model: 'sonnet', effort: 'low' })
    // Deja su traspaso (aquí, se acaba el tiempo) y vuelve a entrar con el modelo nuevo.
    await expect.poll(() => launched.get(id) !== before, { timeout: 5000 }).toBe(true)
    const args = launched.get(id)!
    expect(args[args.indexOf('--model') + 1]).toBe('sonnet')
    expect(args[args.indexOf('--effort') + 1]).toBe('low')
  })

  it('la cuenta también se cambia desde Plantilla: sigue en su puesto y vuelve a entrar con ella', async () => {
    const repo = await makeRepo()
    // Una segunda cuenta de Claude Code con sesión (solo se mira que exista su archivo).
    const home = await mkdtemp(join(tmpdir(), 'orquest-home-'))
    await mkdir(join(home, '.claude-2'), { recursive: true })
    await writeFile(join(home, '.claude-2', '.credentials.json'), '{}')
    const { s, call } = await open(repo, new Library(), { handoffTimeoutMs: 50, home })
    await call('proponer_plantilla', { puestos: [{ puesto: 'backend', proveedor: 'claude', motivo: 'x' }] })
    s.approveTemplate([{ id: s.board.slots[0].id, role: 'backend', provider: 'claude' }])
    await call('levantar_empleado', { puesto: s.board.slots[0].id })
    const id = s.board.staff[0].id
    expect(envs.get(id)!.CLAUDE_CONFIG_DIR).toBeUndefined()
    const before = launched.get(id)!
    // Una que no existe no se acepta, y no se toca nada.
    await expect(s.retune(id, { account: '.claude-9' })).rejects.toThrow(/no está en esta máquina/)
    expect(s.board.staff[0].account).toBeUndefined()
    await s.retune(id, { account: '.claude-2' })
    expect(s.board.staff[0].account).toBe('.claude-2')
    expect(s.board.slots[0].account).toBe('.claude-2')
    await expect.poll(() => launched.get(id) !== before, { timeout: 5000 }).toBe(true)
    expect(envs.get(id)!.CLAUDE_CONFIG_DIR).toBe(join(home, '.claude-2'))
    // De vuelta a la principal: la variable ya no va.
    const again = launched.get(id)!
    await s.retune(id, { account: '' })
    await expect.poll(() => launched.get(id) !== again, { timeout: 5000 }).toBe(true)
    expect(envs.get(id)!.CLAUDE_CONFIG_DIR).toBeUndefined()
  })

  it('al jefe se le puede cambiar hasta el proveedor: deja su traspaso y entra el relevo', async () => {
    const repo = await makeRepo()
    const { s } = await open(repo, new Library(), { handoffTimeoutMs: 50 })
    const before = launched.get(BOSS_ID)!
    await s.retune(BOSS_ID, { provider: 'codex', model: 'gpt-5', effort: 'medium' })
    await expect.poll(() => launched.get(BOSS_ID) !== before, { timeout: 5000 }).toBe(true)
    const args = launched.get(BOSS_ID)!
    expect(args).toEqual(expect.arrayContaining(['-m', 'gpt-5']))
    expect(s.board.boss).toMatchObject({ provider: 'codex', model: 'gpt-5', effort: 'medium' })
    // Un proveedor que no sabe conectarse a Orquest no puede ser jefe.
    await expect.poll(() => s.snapshot().bossOnline, { timeout: 5000 }).toBe(true)
    await expect(s.retune(BOSS_ID, { provider: 'grok' })).rejects.toThrow(RuleError)
  })
})
