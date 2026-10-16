import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Devices } from '../src/core/devices.js'
import { EmployeeManager, type Pty, type Spawner } from '../src/core/employees.js'
import { localAddresses, Mobile } from '../src/core/mobile.js'
import { REMOTE_PORT } from '../src/core/remote.js'
import { createServer } from 'node:http'
import { Studio } from '../src/core/studio.js'

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'orquest-movil-'))
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

const mobiles: Mobile[] = []
const studios: Studio[] = []
afterEach(async () => {
  for (const m of mobiles.splice(0)) await m.stop()
  for (const s of studios.splice(0)) s.shutdown()
})

describe('direcciones para el celular', () => {
  it('sin las que no llevan a nada: Tailscale apagado (169.254), VirtualBox, Hyper-V, WSL', () => {
    // Las de una compu real con Tailscale apagado, VirtualBox y WSL: solo una sirve.
    const nets = {
      Tailscale: [{ address: '169.254.83.107', family: 'IPv4', internal: false, mac: '00:00:00:00:00:00' }],
      Ethernet: [{ address: '192.168.1.23', family: 'IPv4', internal: false, mac: '10:ff:e0:e1:f6:75' }],
      'Ethernet 2': [{ address: '192.168.56.1', family: 'IPv4', internal: false, mac: '0a:00:27:00:00:14' }],
      'vEthernet (Default Switch)': [{ address: '172.17.160.1', family: 'IPv4', internal: false, mac: '00:15:5d:07:6f:fa' }],
      'vEthernet (WSL (Hyper-V firewall))': [{ address: '192.168.208.1', family: 'IPv4', internal: false, mac: '00:15:5d:41:69:9e' }],
    } as unknown as Parameters<typeof localAddresses>[0]
    expect(localAddresses(nets)).toEqual([{ ip: '192.168.1.23', via: 'lan' }])
  })

  it('la red de la casa y Tailscale (primero), sin la interna ni IPv6', () => {
    const nets = {
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      wifi: [
        { address: '192.168.1.40', family: 'IPv4', internal: false },
        { address: 'fe80::1', family: 'IPv6', internal: false },
      ],
      tailscale0: [{ address: '100.101.12.7', family: 'IPv4', internal: false }],
    } as unknown as Parameters<typeof localAddresses>[0]
    expect(localAddresses(nets)).toEqual([
      { ip: '100.101.12.7', via: 'tailscale' },
      { ip: '192.168.1.40', via: 'lan' },
    ])
  })
})

describe('acceso desde el celular', () => {
  async function setup(port: number | undefined = 0) {
    const manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const root = repo()
    const clis = [{ id: 'claude' as const, name: 'Claude Code', installed: true, session: true }]
    const s = await new Studio({ repo: root, manager, detect: async () => clis, mcpUrl: (t) => `http://127.0.0.1:1/mcp/${t}`, submitDelayMs: 0 }).init()
    studios.push(s)
    const devices = new Devices(join(mkdtempSync(join(tmpdir(), 'orquest-disp-')), 'dispositivos.json'))
    const sent: { title: string; body: string }[] = []
    const post = (async (_u: string, init: RequestInit) => {
      sent.push(...JSON.parse(String(init.body)))
      return new Response('{"data":[]}')
    }) as typeof fetch
    const map = new Map([[root, s]])
    const mobile = new Mobile({ devices, studios: () => map, manager, computer: 'ARTURO-PC', appVersion: '0.6.0', port, hostname: '127.0.0.1', post, addresses: () => [{ ip: '100.101.12.7', via: 'tailscale' }] })
    mobiles.push(mobile)
    return { root, s, devices, mobile, sent }
  }

  it('apagado de fábrica; al prender da el código y su QR, y avisa cuando el jefe pregunta', async () => {
    const { root, s, devices, mobile, sent } = await setup()
    expect((await mobile.status()).enabled).toBe(false)
    await mobile.start()
    const { code } = mobile.newCode()
    const st = await mobile.status()
    expect(st.enabled).toBe(true)
    expect(JSON.parse(st.pairing!.qr)).toEqual({ orquest: 1, compu: 'ARTURO-PC', hosts: ['100.101.12.7'], port: st.port, code })
    await devices.pair(code, 'iPhone', 'ExponentPushToken[abc]')

    await s.hireBoss({ provider: 'claude', goal: 'Tienda' })
    await s.call({ kind: 'boss' }, 'preguntar_al_usuario', { preguntas: [{ pregunta: '¿Qué base de datos?', opciones: ['PostgreSQL', 'SQLite'] }] })
    mobile.changed(root)
    await expect.poll(() => sent.length, { timeout: 3000 }).toBeGreaterThan(0)
    expect(sent[0]).toMatchObject({ to: 'ExponentPushToken[abc]', title: 'El jefe te pregunta algo' })
    // Sin detalle de fábrica: la pregunta no sale de la compu.
    expect(JSON.stringify(sent)).not.toContain('base de datos')

    await mobile.stop()
    expect((await mobile.status()).enabled).toBe(false)
  })

  it('con el puerto de siempre ocupado (Orca usa el 6768; otro programa el 7717) toma el siguiente y el QR lo lleva', async () => {
    const blocker = createServer()
    await new Promise<void>((done, fail) => blocker.once('error', fail).listen(REMOTE_PORT, '127.0.0.1', () => done()))
    try {
      const { mobile } = await setup(undefined)
      await mobile.start()
      mobile.newCode()
      const st = await mobile.status()
      expect(st.enabled).toBe(true)
      expect(st.port).toBeGreaterThan(REMOTE_PORT)
      expect(JSON.parse(st.pairing!.qr).port).toBe(st.port)
    } finally {
      blocker.close()
    }
  })

  it('si el puerto está ocupado, lo dice', async () => {
    const a = await setup(0)
    await a.mobile.start()
    const busy = (await a.mobile.status()).port!
    const b = await setup(busy)
    await b.mobile.start()
    const st = await b.mobile.status()
    expect(st.enabled).toBe(false)
    expect(st.error).toContain(`${busy}`)
  })
})
