/**
 * El servidor para la app del celular. Solo corre si el usuario activa el
 * acceso remoto, y escucha en la red (por defecto en el puerto 6768): en la red
 * de la casa o por Tailscale, que además cifra el camino. Todo pide el token
 * del celular (ver devices.ts), salvo emparejar, que pide el código del momento.
 *
 * El celular es control remoto, no oficina: ve los proyectos abiertos y
 * contesta lo que espera al usuario. Toda acción pasa por Studio, con las
 * mismas reglas que en el escritorio. Para enterarse de cambios pide la foto
 * del proyecto con la versión que ya tiene y la respuesta espera hasta que
 * cambie (o medio minuto): sin WebSockets ni dependencias.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { basename } from 'node:path'
import { RuleError } from './board.js'
import type { Devices } from './devices.js'
import type { EmployeeManager } from './employees.js'
import { T } from './i18n.js'
import type { Studio } from './studio.js'

export const REMOTE_PORT = 6768
/** Cuánto espera una foto pedida «desde la versión N» antes de contestar sin cambios. */
const LONG_POLL_MS = 25_000
const MAX_BODY = 64 * 1024

/** Las terminales de un proyecto son las que trabajan dentro de su carpeta (como en el escritorio). */
export function inProject(root: string, path: string): boolean {
  const norm = (p: string) => {
    const n = p.replace(/\\/g, '/').replace(/\/+$/, '')
    return process.platform === 'win32' ? n.toLowerCase() : n
  }
  return norm(path) === norm(root) || norm(path).startsWith(`${norm(root)}/`)
}

export interface RemoteDeps {
  devices: Devices
  /** Los proyectos abiertos, por su carpeta. */
  studios: () => Map<string, Studio>
  manager: EmployeeManager
  /** Nombre de esta compu, para que el celular la reconozca. */
  computer: string
  appVersion: string
}

/** Versión de lo que ve el celular: sube con cada cambio de cualquier proyecto o terminal. */
export class Changes {
  version = 1
  private waiting = new Set<() => void>()
  bump() {
    this.version++
    for (const w of this.waiting) w()
    this.waiting.clear()
  }
  /** Espera a que la versión pase de `since`, o hasta `ms`. */
  wait(since: number, ms: number): Promise<void> {
    if (this.version > since) return Promise.resolve()
    return new Promise((done) => {
      const finish = () => {
        clearTimeout(timer)
        this.waiting.delete(finish)
        done()
      }
      const timer = setTimeout(finish, ms)
      this.waiting.add(finish)
    })
  }
}

export interface RemoteHandle {
  port: number
  changes: Changes
  close(): Promise<void>
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > MAX_BODY) throw new RuleError(T`El mensaje es demasiado grande.`)
    chunks.push(c as Buffer)
  }
  if (!size) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    throw new RuleError(T`El mensaje no es JSON válido.`)
  }
}

const text = (v: unknown) => (typeof v === 'string' ? v : '')

export async function startRemoteServer(deps: RemoteDeps, port = REMOTE_PORT, hostname = '0.0.0.0'): Promise<RemoteHandle> {
  const changes = new Changes()
  const { devices, manager } = deps

  const project = (root: string) => {
    const s = deps.studios().get(root)
    if (!s) throw new RuleError(T`Ese proyecto no está abierto en la compu.`)
    return s
  }
  const view = (root: string, s: Studio) => {
    const snapshot = s.snapshot()
    const employees = manager
      .list()
      .filter((e) => inProject(snapshot.repo, e.office.path))
      .map((e) => ({ id: e.id, provider: e.provider, model: e.model, effort: e.effort, role: e.role, state: e.state, problem: e.problem, context: e.context }))
    return { root, name: basename(root), snapshot, employees }
  }

  const routes: Record<string, (req: IncomingMessage, url: URL, device: { id: string } | undefined) => Promise<unknown>> = {
    'POST /api/emparejar': async (req) => {
      const b = await readBody(req)
      const paired = await devices.pair(text(b.codigo), text(b.nombre), text(b.avisos) || undefined)
      return { ...paired, compu: deps.computer, version: deps.appVersion }
    },
    'GET /api/hola': async () => ({ compu: deps.computer, version: deps.appVersion }),
    'PUT /api/avisos': async (req, _url, device) => {
      const b = await readBody(req)
      await devices.setPush(device!.id, text(b.token) || undefined)
      return { ok: true }
    },
    'GET /api/proyectos': async () => ({
      version: changes.version,
      proyectos: [...deps.studios().entries()].map(([root, s]) => {
        const v = view(root, s)
        return {
          root,
          name: v.name,
          bossOnline: v.snapshot.bossOnline,
          trabajando: v.employees.filter((e) => e.state === 'working').length,
          teNecesitan: v.employees.filter((e) => e.state === 'blocked' || e.problem).length,
          entregas: v.snapshot.tasks.filter((t) => t.status === 'approved').length,
          preguntas: v.snapshot.questions.filter((q) => q.status === 'open').length,
        }
      }),
    }),
    'GET /api/proyecto': async (_req, url) => {
      const since = Number(url.searchParams.get('version')) || 0
      await changes.wait(since, Number(url.searchParams.get('espera') ?? LONG_POLL_MS))
      const root = text(url.searchParams.get('raiz'))
      return { version: changes.version, ...view(root, project(root)) }
    },
    'GET /api/pantalla': async (_req, url) => {
      const root = text(url.searchParams.get('raiz'))
      const id = text(url.searchParams.get('empleado'))
      const v = view(root, project(root))
      if (!v.employees.some((e) => e.id === id)) throw new RuleError(T`${id} no está en la oficina.`)
      // Solo lo de abajo: es lo que importa y no se manda la pantalla entera cada vez.
      return { text: manager.screenText(id).split('\n').slice(-40).join('\n') }
    },
    'POST /api/accion': async (req) => {
      const b = await readBody(req)
      const root = text(b.raiz)
      const s = project(root)
      const id = text(b.empleado)
      switch (b.accion) {
        case 'decir_al_jefe':
          s.sayToBoss(text(b.texto))
          return { ok: true }
        case 'contestar':
          s.answerQuestion(text(b.pregunta), text(b.texto))
          return { ok: true }
        case 'escribir':
          s.say(id, text(b.texto))
          return { ok: true }
        case 'detener':
          return { ok: true, ...(await s.stop(id || undefined)) }
        case 'contestar_terminal': {
          // Lo que su CLI pregunta y se sabe contestar desde la app (permiso, confiar en la carpeta, otro modelo).
          if (!view(root, s).employees.some((e) => e.id === id)) throw new RuleError(T`${id} no está en la oficina.`)
          if (!manager.blockedBy(id)) throw new RuleError(T`${id} no está esperando una respuesta.`)
          manager.answerBlock(id)
          return { ok: true }
        }
        case 'integrar':
          await s.merge(text(b.tarea))
          return { ok: true }
        case 'regresar':
          s.userReturn(text(b.tarea), text(b.notas))
          return { ok: true }
        case 'descartar':
          return { ok: true, rama: await s.discard(text(b.tarea), text(b.motivo) || undefined) }
        default:
          throw new RuleError(T`No conozco esa acción.`)
      }
    },
  }

  const server: Server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://celular')
      const route = routes[`${req.method} ${url.pathname}`]
      if (!route) return json(res, 404, { ok: false, motivo: T`No existe.` })
      let device: { id: string } | undefined
      if (url.pathname !== '/api/emparejar') {
        device = await devices.authenticate(/^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1])
        if (!device) return json(res, 401, { ok: false, motivo: T`Este celular no está emparejado con la compu. Vuelve a emparejarlo.` })
      }
      json(res, 200, await route(req, url, device))
    } catch (err) {
      const rule = err instanceof RuleError
      json(res, rule ? 400 : 500, { ok: false, motivo: rule ? (err as Error).message : T`Algo falló en la compu.` })
    }
  })

  await new Promise<void>((done, fail) => {
    server.once('error', fail)
    server.listen(port, hostname, () => done())
  })
  const actual = (server.address() as { port: number }).port
  return {
    port: actual,
    changes,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections?.()
        server.close(() => done())
      }),
  }
}
