/**
 * El servidor MCP «trazo» del diseñador, como lo hace Trazo de escritorio
 * (`src-tauri/src/mcp.rs`): JSON-RPC por HTTP, solo respuestas JSON. El
 * documento vive en el editor, dentro del panel Estudio; aquí solo se lleva
 * el transporte (sesiones, skills como recursos) y lo demás se le reenvía al
 * editor (`forward`) y se espera su respuesta. Va en el servidor MCP de
 * Orquest (`/trazo/<token>`), no en el 7331: ahí puede estar Trazo de escritorio.
 */
import { randomBytes } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { T } from './i18n.js'

// La más nueva primero; Claude Code 2.1.314 pide 2025-11-25 y, si se le contesta una anterior, no sigue.
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
export const SKILLS_PREFIX = 'trazo://skills/'
/** Mismo texto que Trazo de escritorio: el agente se comporta igual en los dos. */
const instructions = () =>
  T`Trazo es un editor de diseño. Empieza siempre con get_context. Todo cambio va por apply_operations. Verifica con render_image e inspect_issues. Contrato: recurso trazo://docs/contrato.md. Antes de diseñar lee la skill trazo://skills/diseno-trazo/SKILL.md; ella dice qué otras skills de criterio visual usar (impeccable, frontend-design, ui-ux-pro-max y, para landings y sitios, web-alto-calibre), todas en trazo://skills/.`
const FORWARDED = new Set(['tools/list', 'tools/call', 'resources/list', 'resources/read', 'resources/templates/list'])

/** Tiempos de Trazo: `helpers_status` puede esperar a su equipo; un permiso espera al usuario. */
export function limitFor(params: Record<string, unknown>): number {
  if (params.name === 'helpers_status') return 660_000
  if (params.name === 'permission_prompt') return 3_600_000
  return 180_000
}

export interface TrazoSession {
  id: string
  client: string
  version: string
  run: string | null
  last_seen: number
}

/** Lo que se le manda al editor (`McpRequest` de la interfaz Host de Trazo). */
export interface TrazoRequest {
  id: number
  method: string
  params: Record<string, unknown>
  client: string | null
  run: string | null
  /** Carpeta del proyecto del diseñador: solo le contesta el editor de ese proyecto. */
  project: string
}
export type TrazoResponse = { result: unknown } | { error: { code: number; message: string } }

type Json = Record<string, unknown>
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })

export interface TrazoMcpOptions {
  /** Lleva la petición al editor y trae su respuesta, o rechaza si no hay editor. */
  forward(req: TrazoRequest, timeoutMs: number): Promise<TrazoResponse>
  /** Carpeta con las skills de diseño de Trazo, si el editor está instalado (puede llegar después). */
  skills?(): string | undefined
  /** Versión que se anuncia en `serverInfo` (la de Orquest). */
  version?: string
  /** Avisa cuando cambian las sesiones conectadas. */
  onSessions?(sessions: TrazoSession[]): void
}

export class TrazoMcp {
  private sessions = new Map<string, TrazoSession>()
  private seq = 0

  constructor(private opts: TrazoMcpOptions) {}

  list(): TrazoSession[] {
    return [...this.sessions.values()].sort((a, b) => b.last_seen - a.last_seen)
  }

  end(id: string) {
    if (this.sessions.delete(id)) this.opts.onSessions?.(this.list())
  }

  /**
   * Atiende un cuerpo JSON-RPC (un mensaje o un lote). `run` es quién llama
   * (el empleado dueño del token). Devuelve null si todo eran notificaciones.
   */
  async handle(body: unknown, sessionHeader: string | undefined, run: string, project: string): Promise<{ reply: unknown | null; session?: string }> {
    let session: string | undefined
    const one = async (msg: unknown) => {
      const r = await this.message(msg as Json, sessionHeader, run, project)
      if (r?.session) session = r.session
      return r?.reply
    }
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(one))).filter((r) => r !== undefined)
      return { reply: out.length ? out : null, session }
    }
    const reply = await one(body)
    return { reply: reply ?? null, session }
  }

  private async message(msg: Json, sessionHeader: string | undefined, run: string, project: string): Promise<{ reply: unknown; session?: string } | undefined> {
    if (!msg || typeof msg !== 'object' || !('id' in msg)) return undefined // notificación: no se responde
    const id = msg.id
    const method = typeof msg.method === 'string' ? msg.method : ''
    const params = (msg.params && typeof msg.params === 'object' ? msg.params : {}) as Json

    if (method === 'initialize') {
      const info = (params.clientInfo ?? {}) as Json
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOLS[0]
      const sid = randomBytes(16).toString('hex')
      this.sessions.set(sid, { id: sid, client: String(info.name ?? T`desconocido`), version: String(info.version ?? ''), run, last_seen: Math.floor(Date.now() / 1000) })
      this.opts.onSessions?.(this.list())
      return {
        session: sid,
        reply: {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOLS.includes(requested) ? requested : PROTOCOLS[0],
            capabilities: { tools: { listChanged: false }, resources: {} },
            // `version` es obligatorio en MCP: sin él, Claude Code descarta la respuesta y no sigue.
            serverInfo: { name: 'trazo', title: 'Trazo', version: this.opts.version ?? '0.0.0' },
            instructions: instructions(),
          },
        },
      }
    }
    if (method === 'ping') return { reply: { jsonrpc: '2.0', id, result: {} } }

    const s = sessionHeader ? this.sessions.get(sessionHeader) : undefined
    if (s) s.last_seen = Math.floor(Date.now() / 1000)
    const req = (m: string, p: Json): TrazoRequest => ({ id: ++this.seq, method: m, params: p, client: s?.client ?? T`desconocido`, run, project })

    // Las skills se sirven de aquí, sin pasar por el editor.
    const skills = this.opts.skills?.()
    if (skills && method === 'resources/read' && typeof params.uri === 'string' && params.uri.startsWith(SKILLS_PREFIX)) {
      try {
        return { reply: { jsonrpc: '2.0', id, result: await readSkill(skills, params.uri) } }
      } catch (e) {
        return { reply: rpcError(id, -32002, (e as Error).message) }
      }
    }
    if (skills && method === 'resources/list') {
      const r = await this.opts.forward(req(method, params), limitFor(params)).catch(() => null)
      const listed = r && 'result' in r ? ((r.result as { resources?: unknown[] })?.resources ?? []) : []
      return { reply: { jsonrpc: '2.0', id, result: { resources: [...listed, ...(await skillResources(skills))] } } }
    }
    if (FORWARDED.has(method)) {
      try {
        const r = await this.opts.forward(req(method, params), limitFor(params))
        return { reply: 'error' in r ? rpcError(id, r.error.code, r.error.message) : { jsonrpc: '2.0', id, result: r.result } }
      } catch (e) {
        return { reply: rpcError(id, -32603, (e as Error).message) }
      }
    }
    if (method === 'prompts/list') return { reply: { jsonrpc: '2.0', id, result: { prompts: [] } } }
    return { reply: rpcError(id, -32601, T`Método no soportado: ${method}`) }
  }
}

/** Las skills (carpetas con SKILL.md), ordenadas. */
async function skillNames(dir: string): Promise<string[]> {
  const names: string[] = []
  for (const n of await readdir(dir).catch(() => [] as string[])) {
    if (await stat(join(dir, n, 'SKILL.md')).then((s) => s.isFile(), () => false)) names.push(n)
  }
  return names.sort()
}

export async function skillResources(dir: string) {
  return (await skillNames(dir)).map((n) => ({ uri: `${SKILLS_PREFIX}${n}/SKILL.md`, name: `Skill «${n}»`, mimeType: 'text/markdown' }))
}

/** Lee `trazo://skills/<ruta>`; nunca fuera de la carpeta de skills. */
export async function readSkill(dir: string, uri: string) {
  const rel = uri.slice(SKILLS_PREFIX.length)
  const root = normalize(dir)
  const full = normalize(join(root, rel))
  if (!rel || rel.split(/[\\/]/).some((p) => p === '..' || p === '') || !full.startsWith(root + sep)) throw new Error(T`Ruta no permitida`)
  const text = await readFile(full, 'utf8').catch(() => {
    throw new Error(T`No existe ${uri}`)
  })
  const mime = ({ '.md': 'text/markdown', '.csv': 'text/csv', '.json': 'application/json' } as Record<string, string>)[extname(full)] ?? 'text/plain'
  return { contents: [{ uri, mimeType: mime, text }] }
}
