import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { cliArgs, cliFields, installCli } from '../src/core/cli.js'
import type { CliStatus } from '../src/core/detect.js'
import { EmployeeManager, type Pty, type Spawner } from '../src/core/employees.js'
import { startMcpServer, TOOLS, type McpHandle } from '../src/core/mcp.js'
import { BOSS_ID, Studio } from '../src/core/studio.js'

const SCRIPT = resolve('src/cli/orquest.mjs')

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orquest-cli-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@orquest.dev')
  git('config', 'user.name', 'Orquest')
  await writeFile(join(dir, 'README.md'), '# cli\n')
  git('add', '.')
  git('commit', '-qm', 'inicio')
  return dir
}

/** CLI de mentira: guarda el entorno con que nació y lo que se le escribe. */
const envs = new Map<string, Record<string, string>>()
const typed = new Map<string, string>()
const fakeSpawn: Spawner = (_file, _args, o) => {
  const id = o.env.ORQUEST_EMPLOYEE_ID
  envs.set(id, o.env)
  typed.set(id, '')
  let exit: (e: { exitCode: number }) => void = () => {}
  const pty: Pty = {
    pid: 1,
    onData: (cb) => setTimeout(() => cb('\x1b[2J\x1b[H> \r\n'), 5),
    onExit: (cb) => (exit = cb),
    write: (d) => typed.set(id, typed.get(id) + d),
    resize: () => {},
    kill: () => exit({ exitCode: 0 }),
  }
  return pty
}

/** Ejecuta un comando como lo haría el agente en su terminal. Asíncrono: el servidor vive en este proceso. */
function exec(file: string, args: string[], env: Record<string, string>, o: { input?: string; shell?: boolean } = {}) {
  return new Promise<{ code: number; out: string; err: string }>((done) => {
    const child = spawn(file, args, { env, shell: o.shell })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('close', (code) => done({ code: code ?? -1, out: out.trim(), err: err.trim() }))
    child.stdin.end(o.input ?? '')
  })
}

const orquest = (id: string, args: string[], input?: string) => exec(process.execPath, [SCRIPT, ...args], envs.get(id)!, { input })

// Ninguno habla MCP: solo tienen el comando.
const CLIS: CliStatus[] = [
  { id: 'grok', name: 'Grok', installed: true, session: null },
  { id: 'kimi', name: 'Kimi', installed: true, session: null },
]

let mcp: McpHandle | undefined
let studio: Studio | undefined
afterEach(async () => {
  studio?.shutdown()
  await mcp?.close()
})

async function setup(withCli = true) {
  const repo = await makeRepo()
  const manager = new EmployeeManager(fakeSpawn, { quietMs: 20, settleMs: 0 })
  const dir = await installCli(await mkdtemp(join(tmpdir(), 'orquest-bin-')), { runtime: process.execPath, script: SCRIPT })
  let s!: Studio
  mcp = await startMcpServer((token) => {
    const caller = s.caller(token)
    return caller && { studio: s, caller }
  })
  s = await new Studio({
    repo,
    manager,
    detect: async () => CLIS,
    mcpUrl: (t) => mcp!.url(t),
    replyTimeoutMs: 2000,
    submitDelayMs: 0,
    ...(withCli && { cli: { url: (t) => mcp!.cliUrl(t), dir } }),
  }).init()
  studio = s
  return { s, manager, dir }
}

describe('comando orquest: herramientas para CLIs sin MCP', () => {
  it('lee los campos de una línea de comandos', () => {
    const { input } = TOOLS.asignar_tarea
    expect(cliArgs(input, { empleado: 'ana', titulo: 'API', depende_de: ['T1', 'T2'] })).toEqual({ empleado: 'ana', titulo: 'API', depende_de: ['T1', 'T2'] })
    // Una sola dependencia y una lista en JSON.
    expect(cliArgs(input, { depende_de: 'T1' }).depende_de).toEqual(['T1'])
    expect(cliArgs(input, { depende_de: '["T1","T2"]' }).depende_de).toEqual(['T1', 'T2'])
    expect(cliArgs(TOOLS.hablar_con.input, { empleado: 'ana', mensaje: 'hola', esperar_respuesta: 'no' }).esperar_respuesta).toBe(false)
    expect(cliArgs(TOOLS.proponer_plantilla.input, { puestos: '{"puesto":"qa","proveedor":"kimi","motivo":"x"}' }).puestos).toHaveLength(1)

    expect(() => cliArgs(input, { empleada: 'ana' })).toThrow(/Campo desconocido: --empleada\. Campos: --empleado/)
    expect(() => cliArgs(TOOLS.hablar_con.input, { empleado: 'ana' })).toThrow('Falta --mensaje.')
    expect(() => cliArgs(TOOLS.hablar_con.input, { empleado: 'ana', mensaje: true })).toThrow('Falta el valor de --mensaje.')
    expect(() => cliArgs(TOOLS.reportar_estado.input, { estado: 'durmiendo' })).toThrow(/Argumentos inválidos: estado/)
    expect(() => cliArgs(TOOLS.proponer_plantilla.input, { puestos: '{roto' })).toThrow('--puestos no es JSON válido.')

    expect(cliFields({ a: z.string(), b: z.array(z.string()).optional(), c: z.enum(['x', 'y']).describe('elige') })).toEqual([
      { nombre: 'a', tipo: 'texto', requerido: true },
      { nombre: 'b', tipo: 'lista', requerido: false },
      { nombre: 'c', tipo: 'x|y', requerido: true, descripcion: 'elige' },
    ])
  })

  it('sin el comando, una CLI sin MCP no puede ser jefe', async () => {
    const { s } = await setup(false)
    await expect(s.hireBoss({ provider: 'grok', goal: 'x' })).rejects.toThrow(/aún no sabe conectarse/)
  })

  it('un jefe y un empleado sin MCP llevan una tarea de punta a punta desde su terminal', async () => {
    const { s, manager, dir } = await setup()
    await s.hireBoss({ provider: 'grok', goal: 'API de productos' })

    // Cada terminal nace con su identidad y con el comando al frente del PATH.
    const bossEnv = envs.get(BOSS_ID)!
    expect(bossEnv.ORQUEST_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/cli\/[\w-]+$/)
    const pathKey = Object.keys(bossEnv).filter((k) => k.toUpperCase() === 'PATH')
    expect(pathKey).toHaveLength(1)
    expect(bossEnv[pathKey[0]].split(delimiter)[0]).toBe(dir)
    await new Promise((r) => setTimeout(r, 80))
    expect(typed.get(BOSS_ID)).toContain('orquest ayuda')

    // El lanzador instalado se encuentra por el PATH, como lo teclearía el agente.
    expect(await exec('orquest', ['quien'], bossEnv, { shell: true })).toMatchObject({ code: 0, out: 'jefe jefe' })

    const help = await orquest(BOSS_ID, ['ayuda'])
    expect(help.out).toContain('Eres jefe (jefe).')
    expect(help.out).toContain('--depende_de <lista> (opcional)')
    expect(help.out).not.toContain('leer_tarea')

    // La plantilla es una lista de objetos: entra por la entrada estándar.
    const plan = JSON.stringify({ puestos: [{ puesto: 'backend', proveedor: 'kimi', motivo: 'sin historial' }] })
    const proposed = await orquest(BOSS_ID, ['proponer_plantilla', '--json', '-'], plan)
    expect(proposed).toMatchObject({ code: 0 })
    expect(proposed.out).toContain('Propuesta enviada al usuario')
    s.approveTemplate(s.board.slots.map((x) => ({ id: x.id, role: x.role, provider: x.provider })))

    const up = await orquest(BOSS_ID, ['levantar-empleado', '--puesto', 'backend'])
    expect(up.out).toContain('comando orquest')
    const emp = s.board.staff[0].id
    expect(envs.get(emp)!.ORQUEST_URL).not.toBe(bossEnv.ORQUEST_URL)
    expect((await orquest(emp, ['quien'])).out).toBe(`empleado ${emp}`)

    expect((await orquest(BOSS_ID, ['asignar_tarea', '--empleado', emp, '--titulo', 'API de productos', '--descripcion=GET /productos'])).code).toBe(0)
    const task = JSON.parse((await orquest(emp, ['leer_tarea'])).out)
    expect(task).toMatchObject({ titulo: 'API de productos' })

    // Las reglas son las mismas que por MCP y el motivo llega a la terminal.
    expect(await orquest(emp, ['leer_proyecto'])).toMatchObject({ code: 1, err: expect.stringMatching(/^Rechazado: leer_proyecto no es una herramienta tuya\. Las tuyas: leer_tarea/) })
    expect(await orquest(emp, ['reportar_estado', '--estado', 'durmiendo'])).toMatchObject({ code: 1, err: expect.stringContaining('Argumentos inválidos: estado') })
    expect((await orquest(emp, ['reportar_estado', '--estado', 'trabajando', '--nota', 'voy a la mitad'])).code).toBe(0)

    await writeFile(join(manager.get(emp)!.office.path, 'api.js'), 'ok\n')
    expect((await orquest(emp, ['entregar', '--reporte', 'Lista la API.\nPrueba con npm test.'])).out).toContain('Entrega recibida')
    expect((await orquest(BOSS_ID, ['revisar_entrega', '--tarea', 'T1', '--decision', 'aprobar'])).code).toBe(0)
    await s.merge('T1')
    expect(s.board.task('T1').status).toBe('merged')
  })

  it('una terminal ajena o despedida recibe un motivo claro', async () => {
    await setup()
    const base = { ...(process.env as Record<string, string>) }
    delete base.ORQUEST_URL
    expect(await exec(process.execPath, [SCRIPT, 'ayuda'], base)).toMatchObject({ code: 2, err: 'Esta terminal no la lanzó Orquest (falta ORQUEST_URL).' })
    expect(await exec(process.execPath, [SCRIPT, 'ayuda'], { ...base, ORQUEST_URL: mcp!.cliUrl('nadie') })).toMatchObject({ code: 2, err: expect.stringContaining('no reconoce esta terminal') })
    expect(await exec(process.execPath, [SCRIPT, 'ayuda'], { ...base, ORQUEST_URL: 'http://127.0.0.1:1/cli/x' })).toMatchObject({ code: 2, err: expect.stringContaining('no responde') })
  })
})
