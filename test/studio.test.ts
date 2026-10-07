import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliStatus } from '../src/core/detect.js'
import { EmployeeManager, type Pty, type Spawner } from '../src/core/employees.js'
import { startMcpServer, type McpHandle } from '../src/core/mcp.js'
import { StudioStore } from '../src/core/store.js'
import { BOSS_ID, Studio } from '../src/core/studio.js'

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orquest-p2-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@orquest.dev')
  git('config', 'user.name', 'Orquest')
  await writeFile(join(dir, 'README.md'), '# tienda\n')
  git('add', '.')
  git('commit', '-qm', 'inicio')
  return dir
}

/** CLI de mentira: queda lista enseguida y guarda lo que se le escribe. */
const typed = new Map<string, string>()
/** Simula que la CLI terminó su turno y vuelve a mostrar su prompt. */
const prompts = new Map<string, () => void>()
const fakeSpawn: Spawner = (_file, args, o) => {
  const id = o.env.ORQUEST_EMPLOYEE_ID
  typed.set(id, '')
  let onData: (d: string) => void = () => {}
  let onExit: (e: { exitCode: number }) => void = () => {}
  const pty: Pty & { args: string[] } = {
    pid: 1,
    args,
    onData: (cb) => {
      onData = cb
      const show = () => onData('\x1b[2J\x1b[H> \r\n? for shortcuts · ⏎ send')
      prompts.set(id, show)
      setTimeout(show, 5)
    },
    onExit: (cb) => (onExit = cb),
    write: (d) => typed.set(id, typed.get(id) + d),
    resize: () => {},
    kill: () => onExit({ exitCode: 0 }),
  }
  return pty
}

const CLIS: CliStatus[] = [
  { id: 'claude', name: 'Claude Code', installed: true, session: true, version: '2' },
  { id: 'codex', name: 'Codex', installed: true, session: true },
  { id: 'grok', name: 'Grok', installed: false, session: null },
]

let mcp: McpHandle | undefined
let studio: Studio | undefined
afterEach(async () => {
  studio?.shutdown()
  await mcp?.close()
})

async function setup(storePath = ':memory:') {
  const repo = await makeRepo()
  const manager = new EmployeeManager(fakeSpawn, { quietMs: 20, settleMs: 0 })
  const store = new StudioStore(storePath)
  let s!: Studio
  mcp = await startMcpServer((token) => {
    const caller = s.caller(token)
    return caller && { studio: s, caller }
  })
  s = await new Studio({
    repo,
    manager,
    store,
    detect: async () => CLIS,
    mcpUrl: (t) => mcp!.url(t),
   
    replyTimeoutMs: 2000,
  }).init()
  studio = s
  return { repo, manager, studio: s, store }
}

/** Cliente MCP real conectado con la URL que recibió cada CLI. */
async function connect(manager: EmployeeManager, id: string, spawnedArgs: string[]) {
  const i = spawnedArgs.indexOf('--mcp-config')
  const codex = spawnedArgs.find((a) => a.startsWith('mcp_servers.orquest.url='))
  const url = i >= 0 ? JSON.parse(spawnedArgs[i + 1]).mcpServers.orquest.url : JSON.parse(codex!.split('=').slice(1).join('='))
  const client = new Client({ name: id, version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url)))
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] }
    return { error: !!r.isError, text: r.content[0].text }
  }
  return { client, call }
}

/** Argumentos con que se lanzó cada agente. */
const launched = new Map<string, string[]>()
const spawnSpy: Spawner = (file, args, o) => {
  launched.set(o.env.ORQUEST_EMPLOYEE_ID, args)
  return fakeSpawn(file, args, o)
}

const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms))

describe('fase 2: un proyecto chico de punta a punta', () => {
  it('jefe propone, el usuario aprueba, trabajan con dependencias, QA rechaza y aprueba, el usuario integra', async () => {
    const repo = await makeRepo()
    const manager = new EmployeeManager(spawnSpy, { quietMs: 20, settleMs: 0 })
    let s!: Studio
    mcp = await startMcpServer((token) => {
      const caller = s.caller(token)
      return caller && { studio: s, caller }
    })
    s = await new Studio({ repo, manager, detect: async () => CLIS, mcpUrl: (t) => mcp!.url(t), replyTimeoutMs: 2000 }).init()
    studio = s
    const notices: string[] = []
    s.on('notice', (n) => notices.push(n))

    // Contratar al jefe.
    await s.hireBoss({ provider: 'claude', goal: 'Tienda con API de productos y página que los lista' })
    expect(launched.get(BOSS_ID)).toContain('--mcp-config')
    expect(launched.get(BOSS_ID)!.join(' ')).toContain('--append-system-prompt')
    await tick()
    expect(typed.get(BOSS_ID)).toContain('propón la plantilla')
    const boss = await connect(manager, BOSS_ID, launched.get(BOSS_ID)!)

    // El jefe solo ve sus herramientas.
    const names = (await boss.client.listTools()).tools.map((t) => t.name)
    expect(names).toContain('proponer_plantilla')
    expect(names).not.toContain('entregar')

    expect(JSON.parse((await boss.call('leer_proyecto')).text).objetivo).toContain('Tienda')
    const exp = JSON.parse((await boss.call('leer_expedientes')).text)
    expect(exp.find((e: any) => e.proveedor === 'grok').disponible).toBe(false)

    // Proponer: un proveedor no instalado se rechaza con motivo.
    const bad = await boss.call('proponer_plantilla', { puestos: [{ puesto: 'backend', proveedor: 'grok', motivo: 'x' }] })
    expect(bad).toEqual({ error: true, text: expect.stringContaining('grok no está instalado') })

    await boss.call('proponer_plantilla', {
      puestos: [
        { puesto: 'backend', proveedor: 'claude', motivo: 'bueno en APIs' },
        { puesto: 'frontend', proveedor: 'codex', motivo: 'rápido en UI' },
        { puesto: 'qa', proveedor: 'claude', motivo: 'revisa con cuidado' },
      ],
    })
    expect(notices.at(-1)).toContain('propone una plantilla de 3')

    // Sin aprobación no se levanta a nadie.
    expect((await boss.call('levantar_empleado', { puesto: 'backend' })).text).toContain('espera la aprobación del usuario')

    // El usuario aprueba ajustando el modelo de frontend.
    s.approveTemplate(s.board.slots.map((x) => ({ id: x.id, role: x.role, provider: x.provider, model: x.role === 'frontend' ? 'gpt-5' : undefined })))
    await tick()
    expect(typed.get(BOSS_ID)).toContain('aprobó la plantilla')

    const ids: Record<string, string> = {}
    for (const role of ['backend', 'frontend', 'qa']) {
      const r = await boss.call('levantar_empleado', { puesto: role })
      expect(r.error).toBe(false)
      ids[role] = s.board.staff.find((m) => m.role === role)!.id
    }
    expect(launched.get(ids.frontend)).toEqual(expect.arrayContaining(['-m', 'gpt-5']))
    const backend = await connect(manager, ids.backend, launched.get(ids.backend)!)
    const frontend = await connect(manager, ids.frontend, launched.get(ids.frontend)!)
    const qa = await connect(manager, ids.qa, launched.get(ids.qa)!)

    // Un empleado no puede usar herramientas del jefe.
    expect((await backend.call('asignar_tarea', { empleado: ids.qa, titulo: 'x' })).error).toBe(true)

    // Tareas con dependencia; el ciclo se rechaza.
    expect((await boss.call('asignar_tarea', { empleado: ids.backend, titulo: 'API de productos', descripcion: 'GET /productos' })).text).toContain('T1')
    expect((await boss.call('asignar_tarea', { empleado: ids.frontend, titulo: 'Página de productos', depende_de: ['T1'] })).text).toContain('esperando a T1')
    expect((await boss.call('asignar_tarea', { tarea_id: 'T1', depende_de: ['T2'] })).text).toContain('Dependencia circular: T1 → T2 → T1')
    await tick()
    expect(typed.get(ids.backend)).toContain('Tienes una tarea nueva (T1')
    expect(typed.get(ids.frontend)).toContain('espera a T1')

    // Frontend espera; no puede entregar.
    expect((await frontend.call('leer_tarea')).text).toContain('espera a T1')
    expect((await frontend.call('entregar', { reporte: 'x' })).text).toContain('sigue esperando a T1')
    expect(s.board.hint(ids.frontend)).toEqual({ state: 'waiting', blockedBy: ids.backend })

    // Backend trabaja en su oficina y entrega.
    expect(JSON.parse((await backend.call('leer_tarea')).text).titulo).toBe('API de productos')
    const office = manager.get(ids.backend)!.office
    await writeFile(join(office.path, 'api.js'), 'export const productos = []\n')
    await backend.call('reportar_estado', { estado: 'trabajando', nota: 'creando endpoint' })
    expect(manager.get(ids.backend)!.state).toBe('working')
    prompts.get(ids.backend)!()
    await backend.call('entregar', { reporte: 'GET /productos devuelve []' })
    expect(s.board.task('T1').delivery?.diffStat).toContain('api.js')
    await tick()
    expect(typed.get(BOSS_ID)).toContain('entregó T1')

    // QA rechaza: regresa al mismo empleado con el reporte.
    await boss.call('mandar_a_qa', { tarea: 'T1', empleado_qa: ids.qa, instrucciones: 'prueba que liste productos' })
    expect(JSON.parse((await qa.call('leer_tarea')).text).revisa_a.id).toBe('T1')
    await qa.call('entregar', { reporte: 'devuelve lista vacía siempre', veredicto: 'no_pasa' })
    expect(s.board.task('T1')).toMatchObject({ status: 'in_progress', returns: 1 })
    await tick()
    expect(typed.get(ids.backend)).toContain('QA rechazó T1: devuelve lista vacía siempre')
    expect(JSON.parse((await backend.call('leer_tarea')).text).ultimo_qa.veredicto).toBe('fail')

    // Corrige, QA aprueba, el jefe aprueba.
    await writeFile(join(office.path, 'api.js'), "export const productos = [{ id: 1, nombre: 'taza' }]\n")
    await backend.call('entregar', { reporte: 'ahora devuelve productos' })
    await boss.call('revisar_entrega', { tarea: 'T1', decision: 'qa', empleado_qa: ids.qa, notas: 'repite la prueba' })
    await qa.call('entregar', { reporte: 'lista productos', veredicto: 'pasa' })
    expect((await boss.call('revisar_entrega', { tarea: 'T1', decision: 'aprobar' })).text).toContain('bandeja del usuario')
    expect(s.board.inbox().map((t) => t.id)).toEqual(['T1'])
    expect(await s.diff('T1')).toContain("+export const productos = [{ id: 1, nombre: 'taza' }]")

    // El usuario integra: el código llega a main y frontend se libera con contexto.
    const released = await s.merge('T1')
    expect(released.map((t) => t.id)).toEqual(['T2'])
    expect(await readFile(join(repo, 'api.js'), 'utf8')).toContain('taza')
    await tick()
    expect(typed.get(ids.frontend)).toContain('git merge main')
    expect(typed.get(ids.frontend)).toContain('ahora devuelve productos')
    expect(JSON.parse((await frontend.call('leer_tarea')).text).dependencias[0]).toMatchObject({ id: 'T1', estado: 'merged' })

    // El jefe pregunta y el empleado responde por su herramienta.
    const asking = boss.call('hablar_con', { empleado: ids.frontend, mensaje: '¿Cuánto te falta?' })
    await tick()
    await frontend.call('reportar_estado', { estado: 'trabajando', respuesta: 'Diez minutos' })
    expect((await asking).text).toBe('Diez minutos')
    prompts.get(ids.frontend)!()

    // Las preguntas de empleados van al jefe.
    await frontend.call('preguntar_al_jefe', { pregunta: '¿Paginamos?' })
    await tick()
    expect(typed.get(BOSS_ID)).toContain('pregunta: ¿Paginamos?')

    for (const c of [boss, backend, frontend, qa]) await c.client.close()
  }, 30_000)

  it('un conflicto al integrar no rompe el repo y avisa al jefe', async () => {
    const { repo, manager, studio: s } = await setup()
    await s.hireBoss({ provider: 'claude', goal: 'x' })
    s.board.propose([{ role: 'backend', provider: 'claude' }], () => true)
    s.approveTemplate([{ id: s.board.slots[0].id, role: 'backend', provider: 'claude' }])
    await s.call({ kind: 'boss' }, 'levantar_empleado', { puesto: 'backend' })
    const id = s.board.staff[0].id
    await s.call({ kind: 'boss' }, 'asignar_tarea', { empleado: id, titulo: 'README' })
    await s.call({ kind: 'employee', id }, 'leer_tarea', {})
    await writeFile(join(manager.get(id)!.office.path, 'README.md'), '# de backend\n')
    await s.call({ kind: 'employee', id }, 'entregar', { reporte: 'cambié el README' })
    await s.call({ kind: 'boss' }, 'revisar_entrega', { tarea: 'T1', decision: 'aprobar' })
    // Mientras, alguien cambia lo mismo en main.
    await writeFile(join(repo, 'README.md'), '# de main\n')
    execFileSync('git', ['commit', '-qam', 'main'], { cwd: repo })

    await expect(s.merge('T1')).rejects.toThrow(/Conflicto al integrar .*README.md/)
    expect(await readFile(join(repo, 'README.md'), 'utf8')).toBe('# de main\n')
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' })).toBe('')
    expect(s.board.task('T1').status).toBe('approved')
  })

  it('el tablero se guarda en SQLite y se retoma al reabrir', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orquest-db-'))
    const path = join(dir, 'studio.db')
    const { repo, studio: s } = await setup(path)
    await s.hireBoss({ provider: 'claude', goal: 'persistir' })
    s.board.propose([{ role: 'backend', provider: 'claude' }], () => true)
    s.approveTemplate([{ id: s.board.slots[0].id, role: 'backend', provider: 'claude' }])
    await s.call({ kind: 'boss' }, 'levantar_empleado', { puesto: 'backend' })
    await s.call({ kind: 'boss' }, 'asignar_tarea', { empleado: s.board.staff[0].id, titulo: 'algo' })
    expect(existsSync(path)).toBe(true)

    const again = new Studio({
      repo,
      manager: new EmployeeManager(fakeSpawn),
      store: new StudioStore(path),
      detect: async () => CLIS,
      mcpUrl: () => '',
    })
    expect(again.board.goal).toBe('persistir')
    expect(again.board.tasks.map((t) => t.title)).toEqual(['algo'])
    expect(again.board.staff.every((m) => !m.online)).toBe(true)
    again.shutdown()
  })
})
