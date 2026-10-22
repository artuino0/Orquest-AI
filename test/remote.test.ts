import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Devices } from '../src/core/devices.js'
import { EmployeeManager, type Pty, type Spawner } from '../src/core/employees.js'
import { startRemoteServer, type RemoteHandle } from '../src/core/remote.js'
import { Studio } from '../src/core/studio.js'

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'orquest-remoto-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(dir, 'a.txt'), 'hola')
  git('add', '.')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'Inicio')
  return dir
}

const CLEAR = '\x1b[2J\x1b[H'
const PROMPT = `${CLEAR}──────────────────────\r\n❯ \r\n──────────────────────\r\n  ? for shortcuts\r\n`
const TRUST = `${CLEAR} Accessing workspace:\r\n Quick safety check: Is this a project you created or one you trust?\r\n ❯ No, exit\r\n   Yes, I trust this folder\r\n Enter to confirm · Esc to cancel\r\n`

let remote: RemoteHandle | undefined
let studio: Studio | undefined
let manager: EmployeeManager | undefined
afterEach(async () => {
  await remote?.close()
  studio?.shutdown()
  manager?.shutdown()
  remote = studio = manager = undefined
})

async function setup() {
  const terminals: { feed: (d: string) => void; typed: string[] }[] = []
  const spawn: Spawner = () => {
    const t = { feed: (_d: string) => {}, typed: [] as string[] }
    terminals.push(t)
    const pty: Pty = { pid: 1, onData: (cb) => (t.feed = cb), onExit: () => {}, write: (d) => t.typed.push(d), resize: () => {}, kill: () => {} }
    return pty
  }
  manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
  const root = repo()
  const clis = [{ id: 'claude' as const, name: 'Claude Code', installed: true, session: true }]
  studio = await new Studio({ repo: root, manager, detect: async () => clis, mcpUrl: (t) => `http://127.0.0.1:1/mcp/${t}`, submitDelayMs: 0, stopSettleMs: 20 }).init()
  const devices = new Devices(join(mkdtempSync(join(tmpdir(), 'orquest-disp-')), 'dispositivos.json'))
  const studios = new Map([[root, studio]])
  const files = async (path: string) => (path === '/oficina.html' ? { body: new TextEncoder().encode('<html>oficina</html>'), type: 'text/html' } : undefined)
  remote = await startRemoteServer({ devices, studios: () => studios, computer: 'ARTURO-PC', appVersion: '0.6.0', files }, 0, '127.0.0.1')
  const base = `http://127.0.0.1:${remote.port}`
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: res.status, body: (await res.json()) as Record<string, any> }
  }
  return { root, devices, call, terminals, base }
}

describe('servidor para el celular', () => {
  it('sin emparejar no entra; con el código recibe su token y ve los proyectos abiertos', async () => {
    const { root, devices, call } = await setup()
    expect((await call('GET', '/api/proyectos')).status).toBe(401)
    expect((await call('POST', '/api/emparejar', { codigo: 'XXXXXX', nombre: 'iPhone' })).status).toBe(400)
    const { code } = devices.newCode()
    const paired = await call('POST', '/api/emparejar', { codigo: code, nombre: 'iPhone', avisos: 'ExponentPushToken[abc]' })
    expect(paired.body).toMatchObject({ compu: 'ARTURO-PC', version: '0.6.0' })
    const token = paired.body.token as string
    expect(await devices.pushTokens()).toEqual(['ExponentPushToken[abc]'])
    const list = await call('GET', '/api/proyectos', undefined, token)
    expect(list.body.proyectos).toEqual([expect.objectContaining({ root, name: basename(root), bossOnline: false })])
    // Quitado desde la compu, ya no entra.
    await devices.revoke(paired.body.id)
    expect((await call('GET', '/api/proyectos', undefined, token)).status).toBe(401)
  })

  it('la foto del proyecto espera a que algo cambie; las acciones pasan por el estudio', async () => {
    const { root, devices, call, terminals } = await setup()
    const { token } = await devices.pair(devices.newCode().code, 'Pixel')
    await studio!.hireBoss({ provider: 'claude', goal: 'Tienda' })
    const jefe = terminals[0]
    // Primero pregunta si confías en la carpeta: se contesta desde el celular.
    jefe.feed(TRUST)
    await expect.poll(() => manager!.blockedBy('jefe'), { timeout: 3000 }).toBe('trust')
    const first = await call('GET', `/api/proyecto?raiz=${encodeURIComponent(root)}&version=0`, undefined, token)
    expect(first.body.employees).toEqual([expect.objectContaining({ id: 'jefe', state: 'blocked' })])
    expect((await call('GET', `/api/pantalla?raiz=${encodeURIComponent(root)}&empleado=jefe`, undefined, token)).body.text).toContain('Yes, I trust this folder')
    await call('POST', '/api/accion', { raiz: root, accion: 'contestar_terminal', empleado: 'jefe' }, token)
    await expect.poll(() => jefe.typed.join(''), { timeout: 3000 }).toContain('\x1b[B')

    // Pedida «desde la versión que ya tengo», contesta cuando algo cambia.
    const version = first.body.version as number
    const waiting = call('GET', `/api/proyecto?raiz=${encodeURIComponent(root)}&version=${version}&espera=3000`, undefined, token)
    remote!.changes.bump()
    expect((await waiting).body.version).toBeGreaterThan(version)

    jefe.feed(PROMPT)
    await call('POST', '/api/accion', { raiz: root, accion: 'decir_al_jefe', texto: 'Empieza por el carrito' }, token)
    expect(studio!.snapshot().messages).toContainEqual(expect.objectContaining({ from: 'usuario', to: 'jefe', text: 'Empieza por el carrito' }))
    await expect.poll(() => jefe.typed.join(''), { timeout: 5000 }).toContain('Empieza por el carrito')

    // Trabajando: el celular ve en qué anda (el globo «ahora» del chat del jefe).
    jefe.feed(`${CLEAR}● Bash(npm test)
✶ Baking… (1m 5s · esc to interrupt)
`)
    await expect.poll(() => manager!.get('jefe')?.state, { timeout: 3000 }).toBe('working')
    const busy = await call('GET', `/api/proyecto?raiz=${encodeURIComponent(root)}&version=0`, undefined, token)
    expect(busy.body.employees[0].activity).toMatchObject({ label: 'Ejecutando', detail: 'npm test' })
    expect(manager!.activities()).toMatchObject({ jefe: { label: 'Ejecutando', detail: 'npm test' } })
    jefe.feed(PROMPT)
    await expect.poll(() => manager!.activities(), { timeout: 3000 }).toEqual({})

    // La oficina de píxel: sus archivos sin token, su foto con él (personajes como en el escritorio).
    const { base } = await (async () => ({ base: `http://127.0.0.1:${remote!.port}` }))()
    expect(await (await fetch(`${base}/oficina.html?fuente=movil`)).text()).toContain('oficina')
    expect((await fetch(`${base}/no-existe.js`)).status).toBe(404)
    expect((await call('GET', `/api/oficina?raiz=${encodeURIComponent(root)}`)).status).toBe(401)
    const office = await call('GET', `/api/oficina?raiz=${encodeURIComponent(root)}`, undefined, token)
    expect(office.body.estado).toMatchObject({ people: [expect.objectContaining({ id: 'jefe' })], sprites: { jefe: 'CHAR3' } })

    // Una regla rota llega tal cual; una acción que no existe, también.
    const bad = await call('POST', '/api/accion', { raiz: root, accion: 'integrar', tarea: 'T9' }, token)
    expect(bad.status).toBe(400)
    expect((await call('POST', '/api/accion', { raiz: root, accion: 'borrar_todo' }, token)).body.motivo).toMatch(/No conozco/)
    expect((await call('GET', '/api/proyecto?raiz=C%3A%2Fotro&version=0&espera=1', undefined, token)).body.motivo).toMatch(/no está abierto/)
  })

  it('la plantilla propuesta se aprueba desde el celular con los puestos que el usuario dejó', async () => {
    const { root, devices, call } = await setup()
    const { token } = await devices.pair(devices.newCode().code, 'Pixel')
    const act = (fields: Record<string, unknown>) => call('POST', '/api/accion', { raiz: root, accion: 'aprobar_plantilla', ...fields }, token)
    expect((await act({ puestos: ['S1'] })).body.motivo).toMatch(/No hay una plantilla/)

    await studio!.hireBoss({ provider: 'claude', goal: 'Tienda' })
    const boss = { kind: 'boss' } as Parameters<Studio['call']>[0]
    await studio!.call(boss, 'proponer_plantilla', {
      puestos: [
        { puesto: 'backend', proveedor: 'claude', modelo: 'opus', motivo: 'API de pagos' },
        { puesto: 'qa', proveedor: 'claude', motivo: 'Pruebas' },
      ],
    })
    const list = await call('GET', '/api/proyectos', undefined, token)
    expect(list.body.proyectos[0].plantilla).toBe(2)
    const [backend, qa] = studio!.snapshot().slots
    expect((await act({ puestos: [] })).body.motivo).toMatch(/al menos un puesto/)

    // Sin QA: se aprueba solo backend, tal cual lo propuso el jefe.
    expect((await act({ puestos: [backend.id, 'S99', 7] })).body).toEqual({ ok: true })
    expect(studio!.snapshot().slots).toEqual([expect.objectContaining({ id: backend.id, name: backend.name, role: 'backend', model: 'opus', status: 'approved' })])
    expect(studio!.snapshot().slots.some((x) => x.id === qa.id)).toBe(false)
    expect(studio!.snapshot().messages.at(-1)?.text ?? '').not.toContain('qa')
    expect((await call('GET', '/api/proyectos', undefined, token)).body.proyectos[0].plantilla).toBe(0)
  })
})
