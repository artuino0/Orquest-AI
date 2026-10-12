/**
 * Servidor MCP local de Orquest. Cada agente se conecta a /mcp/<token>; el
 * token dice quién es (jefe o qué empleado) y solo ve sus herramientas. Toda
 * llamada pasa por Studio.call, que valida contra el tablero. Las CLIs que no
 * hablan MCP usan las mismas herramientas por /cli/<token> (comando `orquest`).
 */
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { RuleError } from './board.js'
import { cliArgs, cliFields } from './cli.js'
import { T } from './i18n.js'
import { EFFORTS } from './providers.js'
import type { Caller, Studio } from './studio.js'

const PROVIDERS = ['claude', 'codex', 'antigravity', 'opencode', 'commandcode', 'kimi', 'grok'] as const
// T se evalúa al usarse, no al cargar el módulo: por eso las descripciones y los campos van en getters.
const roles = () => T`desarrollo, backend, frontend, dba, infra, qa o diseno`

interface ToolDef {
  who: Caller['kind'] | 'both'
  readonly description: string
  readonly input: z.ZodRawShape
}

export const TOOLS: Record<string, ToolDef> = {
  leer_proyecto: {
    who: 'boss',
    get description() {
      return T`Repo, objetivo, plantilla, empleados, tablero de tareas y lo que espera al usuario.`
    },
    input: {},
  },
  leer_expedientes: {
    who: 'boss',
    get description() {
      return T`Proveedores en esta máquina: si están disponibles, versión y si se conectan a Orquest.`
    },
    input: {},
  },
  proponer_plantilla: {
    who: 'boss',
    get description() {
      return T`Propone puestos con proveedor, modelo y esfuerzo. Queda pendiente de la aprobación del usuario.`
    },
    get input() {
      return {
        puestos: z
          .array(
            z.object({
              puesto: z.string().describe(roles()),
              proveedor: z.enum(PROVIDERS),
              modelo: z.string().optional(),
              esfuerzo: z.enum(EFFORTS).optional(),
              cuenta: z.string().optional().describe(T`Cuenta del proveedor, como sale en \`cuentas\` de leer_expedientes; sin ella, la principal`),
              motivo: z.string().describe(T`Por qué este proveedor para este puesto`),
            }),
          )
          .min(1),
      }
    },
  },
  levantar_empleado: {
    who: 'boss',
    get description() {
      return T`Lanza a un empleado de un puesto ya aprobado por el usuario, en su propia oficina (worktree).`
    },
    get input() {
      return { puesto: z.string().describe(T`Id del puesto (S1) o nombre del puesto (backend)`) }
    },
  },
  asignar_tarea: {
    who: 'boss',
    get description() {
      return T`Crea una tarea para un empleado, con dependencias. Con tarea_id cambia el responsable o las dependencias de una existente. Rechaza dependencias circulares.`
    },
    get input() {
      return {
        empleado: z.string().optional().describe(T`Id del empleado`),
        titulo: z.string().optional(),
        descripcion: z.string().optional(),
        repositorio: z.string().optional().describe(T`Solo si el proyecto agrupa varios repositorios: a cuál pertenece la tarea (el nombre de su carpeta, como sale en leer_proyecto)`),
        depende_de: z.array(z.string()).optional().describe(T`Ids de tareas que deben integrarse antes`),
        tarea_id: z.string().optional().describe(T`Para modificar una tarea existente`),
      }
    },
  },
  decir_al_usuario: {
    who: 'boss',
    get description() {
      return T`Le contesta o avisa algo al usuario. Él no ve tu terminal: solo lee lo que mandes con esta herramienta.`
    },
    input: {
      mensaje: z.string(),
    },
  },
  preguntar_al_usuario: {
    who: 'boss',
    get description() {
      return T`Le pregunta al usuario algo que solo él puede decidir o saber. Cada pregunta queda pendiente a su vista hasta que conteste, y Orquest te avisa con su respuesta. Úsala en vez de decir_al_usuario siempre que necesites una respuesta para seguir.`
    },
    get input() {
      return {
        preguntas: z
          .array(
            z.object({
              pregunta: z.string().describe(T`Una sola decisión, escrita completa: el usuario la lee sin ver tu terminal ni el contexto`),
              opciones: z.array(z.string()).max(5).optional().describe(T`De 2 a 5 respuestas posibles, cortas y distintas entre sí. Omítelas si la respuesta es libre (un nombre, una URL)`),
              recomendada: z.string().optional().describe(T`La opción que tú elegirías, copiada tal cual de opciones`),
              detiene: z.string().optional().describe(T`Qué no puede avanzar mientras no conteste`),
              tareas: z.array(z.string()).optional().describe(T`Ids de las tareas que esperan esta respuesta`),
            }),
          )
          .min(1)
          .max(6),
      }
    },
  },
  cerrar_pregunta: {
    who: 'boss',
    get description() {
      return T`Cierra una pregunta pendiente al usuario. Con \`respuesta\`, registra lo que él te contestó por el chat. Con \`motivo\`, la retira porque ya no hace falta. No la uses para contestarla tú por él.`
    },
    get input() {
      return {
        pregunta: z.string().describe(T`Id de la pregunta: P1, P2…`),
        respuesta: z.string().optional().describe(T`Lo que contestó el usuario, con sus palabras`),
        motivo: z.string().optional().describe(T`Por qué ya no hace falta que conteste`),
      }
    },
  },
  guardar_plan: {
    who: 'boss',
    get description() {
      return T`Guarda un plan tuyo como documento del proyecto (Markdown). El usuario lo lee en Planes y tú lo recuperas en leer_proyecto. Guardar otra vez con el mismo título lo reemplaza.`
    },
    get input() {
      return {
        titulo: z.string().describe(T`De qué trata, corto: "Plan de la tienda", "Fase 2: pagos"`),
        contenido: z.string().describe(T`El plan completo en Markdown: objetivo, pasos, quién hace cada uno, dependencias y qué falta decidir`),
      }
    },
  },
  hablar_con: {
    who: 'boss',
    get description() {
      return T`Manda una instrucción o pregunta a un empleado y espera su respuesta.`
    },
    get input() {
      return {
        empleado: z.string(),
        mensaje: z.string(),
        esperar_respuesta: z.boolean().optional().describe(T`Por defecto true`),
      }
    },
  },
  revisar_entrega: {
    who: 'boss',
    get description() {
      return T`Decide sobre una entrega: aprobar (pasa al usuario para integrar), regresar (con notas) o qa.`
    },
    get input() {
      return {
        tarea: z.string(),
        decision: z.enum(['aprobar', 'regresar', 'qa']),
        notas: z.string().optional(),
        empleado_qa: z.string().optional().describe(T`Requerido si decision es qa`),
      }
    },
  },
  mandar_a_qa: {
    who: 'boss',
    get description() {
      return T`Asigna una entrega a un empleado de QA con instrucciones de prueba.`
    },
    input: { tarea: z.string(), empleado_qa: z.string(), instrucciones: z.string() },
  },
  leer_tarea: {
    who: 'employee',
    get description() {
      return T`Tu tarea actual: descripción, dependencias con su contexto, historial y formato de entrega.`
    },
    input: {},
  },
  preguntar_al_jefe: {
    who: 'employee',
    get description() {
      return T`Única vía para dudas o para pedir algo de otro empleado.`
    },
    input: { pregunta: z.string() },
  },
  reportar_estado: {
    who: 'employee',
    get description() {
      return T`Avance, bloqueo o espera. Si el jefe te preguntó algo, contesta en respuesta.`
    },
    input: {
      estado: z.enum(['trabajando', 'bloqueado', 'esperando']),
      nota: z.string().optional(),
      respuesta: z.string().optional(),
    },
  },
  escribir_traspaso: {
    who: 'both',
    get description() {
      return T`Guarda tu traspaso en tu bitácora: qué hiciste, decisiones, pendientes, trampas del código y siguiente paso. Lo lees al volver de descansar o lo lee quien ocupe tu puesto. Reemplaza el anterior; máximo 6000 caracteres.`
    },
    get input() {
      return { traspaso: z.string().describe(T`Markdown breve`) }
    },
  },
  entregar: {
    who: 'employee',
    get description() {
      return T`Cierra tu tarea. La app hace commit de tu oficina. QA debe dar veredicto.`
    },
    get input() {
      return {
        reporte: z.string().describe(T`Qué hiciste y cómo probarlo`),
        capturas: z.array(z.string()).optional().describe(T`Rutas de capturas`),
        veredicto: z.enum(['pasa', 'no_pasa']).optional().describe(T`Solo QA`),
      }
    },
  },
}

function buildServer(studio: Studio, caller: Caller): McpServer {
  const server = new McpServer({ name: 'orquest', version: '0.2.0' })
  for (const [name, def] of Object.entries(TOOLS)) {
    if (def.who !== 'both' && def.who !== caller.kind) continue
    server.registerTool(name, { description: def.description, inputSchema: def.input }, async (args: Record<string, unknown>) => {
      try {
        const text = await studio.call(caller, name, args ?? {})
        return { content: [{ type: 'text' as const, text }] }
      } catch (err) {
        const reason = err instanceof RuleError ? err.message : T`Error interno: ${(err as Error).message}`
        return { isError: true, content: [{ type: 'text' as const, text: T`Rechazado: ${reason}` }] }
      }
    })
  }
  return server
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : undefined
}

const visible = (def: ToolDef, caller: Caller) => def.who === 'both' || def.who === caller.kind

/** Quién es esta terminal y qué herramientas tiene: lo que imprime `orquest ayuda`. */
function cliWhoAmI(caller: Caller) {
  return {
    quien: caller.kind === 'boss' ? 'jefe' : 'empleado',
    id: caller.kind === 'boss' ? 'jefe' : caller.id,
    herramientas: Object.entries(TOOLS)
      .filter(([, def]) => visible(def, caller))
      .map(([nombre, def]) => ({ nombre, descripcion: def.description, campos: cliFields(def.input) })),
  }
}

/** Una llamada del comando `orquest`: mismas reglas que MCP, respuesta en JSON plano. */
async function cliCall(studio: Studio, caller: Caller, body: unknown): Promise<{ ok: true; texto: string } | { ok: false; motivo: string }> {
  try {
    const { herramienta, args } = (body ?? {}) as { herramienta?: unknown; args?: Record<string, unknown> }
    const def = TOOLS[String(herramienta)]
    if (!def || !visible(def, caller)) {
      const mine = Object.keys(TOOLS).filter((n) => visible(TOOLS[n], caller))
      throw new RuleError(herramienta ? T`${herramienta} no es una herramienta tuya. Las tuyas: ${mine.join(', ')}.` : T`Falta la herramienta. Las tuyas: ${mine.join(', ')}.`)
    }
    return { ok: true, texto: await studio.call(caller, String(herramienta), cliArgs(def.input, args ?? {})) }
  } catch (err) {
    return { ok: false, motivo: err instanceof RuleError ? err.message : T`Error interno: ${(err as Error).message}` }
  }
}

export interface McpHandle {
  url(token: string): string
  statusUrl(token: string): string
  /** URL que usa el comando `orquest` de una terminal. */
  cliUrl(token: string): string
  close(): Promise<void>
}

/**
 * Arranca en 127.0.0.1 en un puerto libre. `resolve` encuentra el estudio
 * dueño del token (uno por proyecto abierto).
 */
export async function startMcpServer(resolve: (token: string) => { studio: Studio; caller: Caller } | undefined): Promise<McpHandle> {
  const http: Server = createServer(async (req, res) => {
    // Barra de estado de la CLI: reporta % de contexto (y uso de la cuenta).
    const st = /^\/estado\/([A-Za-z0-9_-]+)\/?$/.exec(req.url ?? '')
    if (st && req.method === 'POST') {
      const found = resolve(st[1])
      if (!found) return void res.writeHead(401).end()
      try {
        found.studio.status(found.caller, await readBody(req))
      } catch {
        // Un reporte mal formado no importa: llegará otro.
      }
      return void res.writeHead(204).end()
    }
    // Comando `orquest`: GET dice quién eres y qué puedes hacer; POST llama una herramienta.
    const cli = /^\/cli\/([A-Za-z0-9_-]+)\/?$/.exec(req.url ?? '')
    if (cli) {
      const found = resolve(cli[1])
      const reply = (code: number, data: unknown) => void res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data))
      if (!found) return reply(401, { error: T`token inválido` })
      if (req.method === 'GET') return reply(200, cliWhoAmI(found.caller))
      if (req.method !== 'POST') return void res.writeHead(405, { allow: 'GET, POST' }).end()
      let body: unknown
      try {
        body = await readBody(req)
      } catch {
        return reply(400, { error: T`cuerpo inválido` })
      }
      return reply(200, await cliCall(found.studio, found.caller, body))
    }
    const m = /^\/mcp\/([A-Za-z0-9_-]+)\/?$/.exec(req.url ?? '')
    const found = m && resolve(m[1])
    if (!found) {
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: T`token inválido` }))
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' }).end()
      return
    }
    try {
      const body = await readBody(req)
      const server = buildServer(found.studio, found.caller)
      // Sin sesiones: cada petición es independiente y el token identifica.
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      res.on('close', () => {
        transport.close()
        server.close()
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
    } catch (err) {
      if (!res.headersSent) res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: (err as Error).message }))
    }
  })
  await new Promise<void>((ok) => http.listen(0, '127.0.0.1', ok))
  const { port } = http.address() as AddressInfo
  return {
    url: (token) => `http://127.0.0.1:${port}/mcp/${token}`,
    statusUrl: (token) => `http://127.0.0.1:${port}/estado/${token}`,
    cliUrl: (token) => `http://127.0.0.1:${port}/cli/${token}`,
    close: () => new Promise((ok) => http.close(() => ok())),
  }
}
