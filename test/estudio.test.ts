import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliStatus } from '../src/core/detect.js'
import { EmployeeManager, type Spawner } from '../src/core/employees.js'
import { startMcpServer, type McpHandle } from '../src/core/mcp.js'
import { BOSS_ID, Studio } from '../src/core/studio.js'
import { TrazoMcp, type TrazoRequest } from '../src/core/trazomcp.js'
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
const launched = new Map<string, string[]>()
const fakeSpawn: Spawner = (_file, args, o) => {
  const id = o.env.ORQUEST_EMPLOYEE_ID
  typed.set(id, '')
  launched.set(id, args)
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
let mcp: McpHandle | undefined
afterEach(async () => {
  studio?.shutdown()
  await mcp?.close()
  mcp = undefined
})

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
    // La carpeta temporal puede tener otro nombre (/private/var en macOS, RUNNER~1 en Windows): se mira el final.
    expect(await s.designFile()).toMatch(/[\\/]diseno[\\/]tienda\.trazo$/)
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

describe('Estudio: el MCP «trazo» del diseñador', () => {
  it('el diseñador nace conectado a trazo y lo que pide llega al editor; nadie más entra', async () => {
    const repo = await makeRepo()
    const manager = new EmployeeManager(fakeSpawn, { quietMs: 20, settleMs: 0 })
    const seen: TrazoRequest[] = []
    const trazo = new TrazoMcp({ forward: async (req) => (seen.push(req), { result: { tools: [{ name: 'get_context' }] } }) })
    let s!: Studio
    mcp = await startMcpServer((token) => {
      const caller = s.caller(token)
      return caller && { studio: s, caller }
    }, trazo)
    s = studio = await new Studio({ repo, manager, detect: async () => CLIS, mcpUrl: (t) => mcp!.url(t), trazoUrl: (t) => mcp!.trazoUrl(t), replyTimeoutMs: 2000, submitDelayMs: 0 }).init()
    await s.hireBoss({ provider: 'claude', goal: 'Tienda' })
    const hired = await s.hireDesigner({ provider: 'claude', name: 'Dalia' })

    const args = launched.get(hired.id)!
    const config = JSON.parse(args[args.indexOf('--mcp-config') + 1])
    const url: string = config.mcpServers.trazo.url
    expect(url).toMatch(/\/trazo\/[A-Za-z0-9_-]+$/)
    expect(JSON.parse(args[args.indexOf('--settings') + 1]).permissions.allow).toContain('mcp__trazo')
    // El jefe no lo recibe.
    const bossArgs = launched.get(BOSS_ID)!
    expect(JSON.parse(bossArgs[bossArgs.indexOf('--mcp-config') + 1]).mcpServers.trazo).toBeUndefined()

    const post = (u: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
    const init = await post(url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'claude-code' } } })
    const sid = init.headers.get('mcp-session-id')!
    expect((await init.json()).result.serverInfo.name).toBe('trazo')
    const list = await post(url, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-session-id': sid })
    expect((await list.json()).result.tools[0].name).toBe('get_context')
    expect(seen[0]).toMatchObject({ method: 'tools/list', run: hired.id, client: 'claude-code', project: s.root })
    expect((await post(url, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)

    // El token del jefe no sirve para trazo, ni una página web, ni un token inventado.
    const bossUrl = JSON.parse(bossArgs[bossArgs.indexOf('--mcp-config') + 1]).mcpServers.orquest.url.replace('/mcp/', '/trazo/')
    expect((await post(bossUrl, { jsonrpc: '2.0', id: 1, method: 'ping' })).status).toBe(401)
    expect((await post(url, { jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'https://malo.com' })).status).toBe(403)
    expect((await post(url.replace(/[^/]+$/, 'inventado'), { jsonrpc: '2.0', id: 1, method: 'ping' })).status).toBe(401)
    expect((await fetch(url)).status).toBe(405)
    expect((await fetch(url, { method: 'DELETE', headers: { 'mcp-session-id': sid } })).status).toBe(200)
    expect(trazo.list()).toEqual([])
  })
})

describe('Estudio: el diseñador le contesta al usuario', () => {
  it('responder_al_usuario es solo del diseñador y queda para el chat', async () => {
    const { studio: s } = await setup()
    await s.hireBoss({ provider: 'claude', goal: 'Tienda' })
    const d = await s.hireDesigner({ provider: 'claude', name: 'Dalia' })
    expect(await s.call({ kind: 'employee', id: d.id }, 'responder_al_usuario', { mensaje: 'Listo el inicio: hero con dos botones.' })).toContain('chat del Estudio')
    expect(s.board.messages.at(-1)).toMatchObject({ from: d.id, to: 'usuario', text: 'Listo el inicio: hero con dos botones.' })
    await expect(s.call({ kind: 'employee', id: d.id }, 'responder_al_usuario', { mensaje: '  ' })).rejects.toThrow(/vacío/)
    // Otro empleado no le habla directo al usuario.
    s.board.addSlot({ role: 'backend', provider: 'claude', name: 'Beto' })
    s.board.hired(s.board.slots.at(-1)!, { id: 'beto-backend', role: 'backend', provider: 'claude' })
    await expect(s.call({ kind: 'employee', id: 'beto-backend' }, 'responder_al_usuario', { mensaje: 'hola' })).rejects.toThrow(/Solo el diseñador/)
  })
})
