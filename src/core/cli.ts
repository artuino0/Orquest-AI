/**
 * Canal por comando. Una CLI que no sabe hablar MCP igual puede ejecutar un
 * comando en su terminal: `orquest <herramienta> --campo valor`. El comando
 * llama al mismo servidor local con el token de esa terminal, así que pasa por
 * las mismas reglas que MCP. Aquí vive lo que el servidor necesita para
 * atenderlo (leer los campos tal como llegan de una línea de comandos) y la
 * instalación del comando en una carpeta que se antepone al PATH del agente.
 */
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { RuleError } from './board.js'

interface Prop {
  type?: string
  enum?: string[]
  description?: string
  items?: Prop
}

function props(input: z.ZodRawShape): { properties: Record<string, Prop>; required: string[] } {
  const s = z.toJSONSchema(z.object(input)) as { properties?: Record<string, Prop>; required?: string[] }
  return { properties: s.properties ?? {}, required: s.required ?? [] }
}

export interface CliField {
  nombre: string
  /** Cómo se escribe en el comando: texto, lista, sí/no, json o las opciones de un enum. */
  tipo: string
  requerido: boolean
  descripcion?: string
}

function kind(p: Prop): string {
  if (p.enum) return p.enum.join('|')
  if (p.type === 'array') return p.items?.type === 'object' ? 'lista json' : 'lista'
  if (p.type === 'boolean') return 'sí/no'
  if (p.type === 'object') return 'json'
  return 'texto'
}

/** Campos de una herramienta, para la ayuda del comando. */
export function cliFields(input: z.ZodRawShape): CliField[] {
  const { properties, required } = props(input)
  return Object.entries(properties).map(([nombre, p]) => ({
    nombre,
    tipo: kind(p),
    requerido: required.includes(nombre),
    ...(p.description && { descripcion: p.description }),
  }))
}

function json(key: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new RuleError(`--${key} no es JSON válido.`)
  }
}

function coerce(key: string, p: Prop, v: unknown): unknown {
  if (p.type === 'array') {
    const list = Array.isArray(v) ? v : [v]
    // Una sola pieza que ya es una lista JSON: --depende_de '["T1","T2"]'
    if (list.length === 1 && typeof list[0] === 'string' && list[0].trimStart().startsWith('[')) return json(key, list[0])
    return p.items?.type === 'object' ? list.map((x) => (typeof x === 'string' ? json(key, x) : x)) : list
  }
  // Una bandera repetida donde va un solo valor: gana la última.
  const one = Array.isArray(v) ? v.at(-1) : v
  if (p.type === 'boolean') {
    if (typeof one === 'boolean') return one
    const t = String(one).toLowerCase()
    if (['true', 'si', 'sí', '1'].includes(t)) return true
    if (['false', 'no', '0'].includes(t)) return false
    throw new RuleError(`--${key} es sí o no.`)
  }
  if (one === true) throw new RuleError(`Falta el valor de --${key}.`)
  if (p.type === 'object' && typeof one === 'string') return json(key, one)
  return one
}

/**
 * Argumentos de una línea de comandos (todo texto, banderas repetidas como
 * lista) convertidos a lo que pide la herramienta. Lo que no cuadra se rechaza
 * con un motivo que el agente pueda corregir.
 */
export function cliArgs(input: z.ZodRawShape, raw: Record<string, unknown>): Record<string, unknown> {
  const { properties, required } = props(input)
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    const p = properties[key]
    if (!p) throw new RuleError(`Campo desconocido: --${key}. Campos: ${Object.keys(properties).map((k) => `--${k}`).join(', ') || 'ninguno'}.`)
    out[key] = coerce(key, p, value)
  }
  const missing = required.filter((k) => out[k] === undefined)
  if (missing.length) throw new RuleError(`Falta ${missing.map((k) => `--${k}`).join(', ')}.`)
  const parsed = z.object(input).safeParse(out, { error: z.locales.es().localeError })
  if (!parsed.success) {
    throw new RuleError(`Argumentos inválidos: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'argumentos'}: ${i.message}`).join('; ')}`)
  }
  return parsed.data
}

export interface CliInstall {
  /** Node o Electron (corre como Node) con que se ejecuta el comando. */
  runtime: string
  /** Ruta de orquest.mjs. */
  script: string
}

/**
 * Deja el comando `orquest` en `dir`: un lanzador para cmd/PowerShell y otro
 * para shells POSIX (en Windows, Git Bash usa este). Devuelve `dir`, que se
 * antepone al PATH de cada agente.
 */
export async function installCli(dir: string, o: CliInstall): Promise<string> {
  await mkdir(dir, { recursive: true })
  const posix = (p: string) => p.replace(/\\/g, '/')
  await writeFile(join(dir, 'orquest.cmd'), `@echo off\r\nsetlocal\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${o.runtime}" "${o.script}" %*\r\n`)
  const sh = join(dir, 'orquest')
  await writeFile(sh, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${posix(o.runtime)}" "${posix(o.script)}" "$@"\n`)
  await chmod(sh, 0o755)
  return dir
}
