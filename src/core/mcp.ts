/**
 * Servidor MCP local de Orquest. Cada agente se conecta a /mcp/<token>; el
 * token dice quién es (jefe o qué empleado) y solo ve sus herramientas. Toda
 * llamada pasa por Studio.call, que valida contra el tablero.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { RuleError } from './board.js'
import type { Caller, Studio } from './studio.js'

const PROVIDERS = ['claude', 'codex', 'antigravity', 'opencode', 'commandcode', 'kimi', 'grok'] as const
const ROLES = 'desarrollo, backend, frontend, dba, infra o qa'

interface ToolDef {
  who: Caller['kind'] | 'both'
  description: string
  input: z.ZodRawShape
}

export const TOOLS: Record<string, ToolDef> = {
  leer_proyecto: {
    who: 'boss',
    description: 'Repo, objetivo, plantilla, empleados, tablero de tareas y lo que espera al usuario.',
    input: {},
  },
  leer_expedientes: {
    who: 'boss',
    description: 'Proveedores en esta máquina: si están disponibles, versión y si se conectan a Orquest.',
    input: {},
  },
  proponer_plantilla: {
    who: 'boss',
    description: 'Propone puestos con proveedor, modelo y esfuerzo. Queda pendiente de la aprobación del usuario.',
    input: {
      puestos: z
        .array(
          z.object({
            puesto: z.string().describe(ROLES),
            proveedor: z.enum(PROVIDERS),
            modelo: z.string().optional(),
            esfuerzo: z.enum(['low', 'medium', 'high']).optional(),
            motivo: z.string().describe('Por qué este proveedor para este puesto'),
          }),
        )
        .min(1),
    },
  },
  levantar_empleado: {
    who: 'boss',
    description: 'Lanza a un empleado de un puesto ya aprobado por el usuario, en su propia oficina (worktree).',
    input: { puesto: z.string().describe('Id del puesto (S1) o nombre del puesto (backend)') },
  },
  asignar_tarea: {
    who: 'boss',
    description:
      'Crea una tarea para un empleado, con dependencias. Con tarea_id cambia el responsable o las dependencias de una existente. Rechaza dependencias circulares.',
    input: {
      empleado: z.string().optional().describe('Id del empleado'),
      titulo: z.string().optional(),
      descripcion: z.string().optional(),
      depende_de: z.array(z.string()).optional().describe('Ids de tareas que deben integrarse antes'),
      tarea_id: z.string().optional().describe('Para modificar una tarea existente'),
    },
  },
  hablar_con: {
    who: 'boss',
    description: 'Manda una instrucción o pregunta a un empleado y espera su respuesta.',
    input: {
      empleado: z.string(),
      mensaje: z.string(),
      esperar_respuesta: z.boolean().optional().describe('Por defecto true'),
    },
  },
  revisar_entrega: {
    who: 'boss',
    description: 'Decide sobre una entrega: aprobar (pasa al usuario para integrar), regresar (con notas) o qa.',
    input: {
      tarea: z.string(),
      decision: z.enum(['aprobar', 'regresar', 'qa']),
      notas: z.string().optional(),
      empleado_qa: z.string().optional().describe('Requerido si decision es qa'),
    },
  },
  mandar_a_qa: {
    who: 'boss',
    description: 'Asigna una entrega a un empleado de QA con instrucciones de prueba.',
    input: { tarea: z.string(), empleado_qa: z.string(), instrucciones: z.string() },
  },
  leer_tarea: {
    who: 'employee',
    description: 'Tu tarea actual: descripción, dependencias con su contexto, historial y formato de entrega.',
    input: {},
  },
  preguntar_al_jefe: {
    who: 'employee',
    description: 'Única vía para dudas o para pedir algo de otro empleado.',
    input: { pregunta: z.string() },
  },
  reportar_estado: {
    who: 'employee',
    description: 'Avance, bloqueo o espera. Si el jefe te preguntó algo, contesta en respuesta.',
    input: {
      estado: z.enum(['trabajando', 'bloqueado', 'esperando']),
      nota: z.string().optional(),
      respuesta: z.string().optional(),
    },
  },
  escribir_traspaso: {
    who: 'both',
    description:
      'Guarda tu traspaso en tu bitácora: qué hiciste, decisiones, pendientes, trampas del código y siguiente paso. Lo lees al volver de descansar o lo lee quien ocupe tu puesto. Reemplaza el anterior; máximo 6000 caracteres.',
    input: { traspaso: z.string().describe('Markdown breve') },
  },
  entregar: {
    who: 'employee',
    description: 'Cierra tu tarea. La app hace commit de tu oficina. QA debe dar veredicto.',
    input: {
      reporte: z.string().describe('Qué hiciste y cómo probarlo'),
      capturas: z.array(z.string()).optional().describe('Rutas de capturas'),
      veredicto: z.enum(['pasa', 'no_pasa']).optional().describe('Solo QA'),
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
        const reason = err instanceof RuleError ? err.message : `Error interno: ${(err as Error).message}`
        return { isError: true, content: [{ type: 'text' as const, text: `Rechazado: ${reason}` }] }
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

export interface McpHandle {
  url(token: string): string
  statusUrl(token: string): string
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
    const m = /^\/mcp\/([A-Za-z0-9_-]+)\/?$/.exec(req.url ?? '')
    const found = m && resolve(m[1])
    if (!found) {
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'token inválido' }))
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
    close: () => new Promise((ok) => http.close(() => ok())),
  }
}
