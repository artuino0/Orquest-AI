/**
 * Los diseños de Trazo (`.trazo`) leídos sin abrir el editor, para que todos
 * los agentes programen a partir del diseño y no de una captura o al tanteo
 * (herramienta `leer_diseno`). Un `.trazo` es un zip: `trazo.json` (nombre y
 * páginas), `pages/<id>.json` (raíces y nodos), `variables.json` (colores y
 * medidas con nombre) y `components.json`. Una página pesa cientos de KB: se
 * da un índice y, de lo que se pida, el detalle completo.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { RuleError } from './board.js'
import { T } from './i18n.js'

/** Un nodo tal cual lo guarda Trazo; `children` son ids. */
export interface DesignNode {
  type: string
  name?: string
  w?: number
  h?: number
  text?: string
  component?: string
  layout?: { direction?: string; gap?: number }
  children?: string[]
  [key: string]: unknown
}

export interface DesignPage {
  id: string
  name: string
  root: string[]
  nodes: Map<string, DesignNode>
}

export interface DesignComponent {
  id: string
  name: string
  root: string[]
  nodes: Map<string, DesignNode>
}

export interface Design {
  name: string
  pages: DesignPage[]
  /** `variables.json` tal cual: colores y medidas con nombre (`color/bg`). */
  variables: unknown
  components: DesignComponent[]
}

/** Tope del detalle de un nodo: más que esto, que pida uno más chico. */
const MAX_DETAIL = 60_000
/** Tope de renglones del índice de una página. */
const MAX_LINES = 400

/**
 * Los archivos de un zip, por nombre. Solo lo que usa Trazo: sin cifrado,
 * guardados tal cual o comprimidos con deflate.
 */
export function readZip(buf: Buffer): Map<string, Buffer> {
  // El directorio central se encuentra desde el final (registro con firma 0x06054b50).
  let end = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new RuleError(T`El archivo no es un diseño de Trazo (no es un zip).`)
  const count = buf.readUInt16LE(end + 10)
  let at = buf.readUInt32LE(end + 16)
  const files = new Map<string, Buffer>()
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) break
    const method = buf.readUInt16LE(at + 10)
    const size = buf.readUInt32LE(at + 20)
    const nameLen = buf.readUInt16LE(at + 28)
    const extraLen = buf.readUInt16LE(at + 30)
    const commentLen = buf.readUInt16LE(at + 32)
    const local = buf.readUInt32LE(at + 42)
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen)
    at += 46 + nameLen + extraLen + commentLen
    // El encabezado local trae su propio largo de nombre y extra.
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const data = buf.subarray(start, start + size)
    if (method === 0) files.set(name, data)
    else if (method === 8) files.set(name, inflateRawSync(data))
  }
  return files
}

const json = (files: Map<string, Buffer>, name: string): unknown => {
  const data = files.get(name)
  return data ? JSON.parse(data.toString('utf8')) : undefined
}

/** `nodes` viene como pares `[id, nodo]` (o como objeto): siempre un Map. */
function nodeMap(raw: unknown): Map<string, DesignNode> {
  if (Array.isArray(raw)) return new Map(raw as [string, DesignNode][])
  return new Map(Object.entries((raw ?? {}) as Record<string, DesignNode>))
}

export function parseDesign(buf: Buffer): Design {
  const files = readZip(buf)
  const meta = json(files, 'trazo.json') as { app?: string; name?: string; pages?: string[] } | undefined
  if (!meta || meta.app !== 'trazo') throw new RuleError(T`El archivo no es un diseño de Trazo (le falta trazo.json).`)
  const pages: DesignPage[] = []
  for (const id of meta.pages ?? []) {
    const p = json(files, `pages/${id}.json`) as { name?: string; root?: string[]; nodes?: unknown } | undefined
    if (p) pages.push({ id, name: p.name ?? id, root: p.root ?? [], nodes: nodeMap(p.nodes) })
  }
  const comps = (json(files, 'components.json') as { components?: Record<string, { name?: string; root?: string[]; nodes?: unknown }> } | undefined)?.components ?? {}
  return {
    name: meta.name ?? '',
    pages,
    variables: json(files, 'variables.json') ?? null,
    components: Object.entries(comps).map(([id, c]) => ({ id, name: c.name ?? id, root: c.root ?? [], nodes: nodeMap(c.nodes) })),
  }
}

/** Un renglón del índice: tipo, nombre, id, medida, acomodo, texto y de qué componente es. */
function line(d: Design, id: string, n: DesignNode, depth: number): string {
  const parts = [`${'  '.repeat(depth)}- ${n.type}`]
  if (n.name) parts.push(`«${n.name}»`)
  parts.push(`#${id}`)
  if (typeof n.w === 'number' && typeof n.h === 'number') parts.push(`${Math.round(n.w)}×${Math.round(n.h)}`)
  if (n.layout?.direction) parts.push(`${n.layout.direction}${n.layout.gap ? ` gap ${n.layout.gap}` : ''}`)
  if (n.component) parts.push(`→ ${d.components.find((c) => c.id === n.component)?.name ?? n.component}`)
  if (typeof n.text === 'string') parts.push(JSON.stringify(n.text.length > 80 ? `${n.text.slice(0, 80)}…` : n.text))
  return parts.join(' ')
}

function outline(d: Design, nodes: Map<string, DesignNode>, ids: string[], depth: number, maxDepth: number, out: string[]) {
  for (const id of ids) {
    if (out.length >= MAX_LINES) return
    const n = nodes.get(id)
    if (!n) continue
    out.push(line(d, id, n, depth))
    if (n.children?.length && depth + 1 < maxDepth) outline(d, nodes, n.children, depth + 1, maxDepth, out)
  }
}

/** Dónde vive un nodo: en qué página o componente. */
function locate(d: Design, id: string): Map<string, DesignNode> | undefined {
  for (const p of d.pages) if (p.nodes.has(id)) return p.nodes
  for (const c of d.components) if (c.nodes.has(id)) return c.nodes
  return undefined
}

/** El nodo con sus hijos adentro (en vez de sus ids), para leerlo de una vez. */
function expand(nodes: Map<string, DesignNode>, id: string): unknown {
  const n = nodes.get(id)
  if (!n) return null
  const { children, ...rest } = n
  return children ? { id, ...rest, children: children.map((c) => expand(nodes, c)) } : { id, ...rest }
}

/** Resumen del diseño: páginas con sus pantallas, componentes y variables. */
export function designSummary(d: Design): string {
  const out = [T`Diseño «${d.name}».`, '', T`Páginas (pide una con \`pagina\` para ver su árbol, o un nodo con \`nodo\` para su detalle):`]
  for (const p of d.pages) {
    out.push(`- ${p.name} (${p.id})`)
    outline(d, p.nodes, p.root, 1, 2, out)
  }
  if (d.components.length) out.push('', T`Componentes:`, ...d.components.map((c) => `- ${c.name} (${c.id})`))
  out.push('', T`Variables (colores y medidas con nombre; los nodos las usan como \`var\`):`, JSON.stringify(d.variables))
  return out.join('\n')
}

/** El árbol de una página (por id o por nombre), un renglón por nodo. */
export function designPage(d: Design, page: string): string {
  const p = d.pages.find((x) => x.id === page || x.name.toLowerCase() === page.toLowerCase())
  if (!p) throw new RuleError(T`No hay una página «${page}» en el diseño. Hay: ${d.pages.map((x) => x.name).join(', ')}.`)
  const out: string[] = []
  outline(d, p.nodes, p.root, 0, Infinity, out)
  if (out.length >= MAX_LINES) out.push(T`(Se cortó en ${MAX_LINES} renglones: pide un nodo con \`nodo\` para ver lo de adentro.)`)
  return [T`Página «${p.name}». Pide el detalle de un nodo con \`nodo\` y su id.`, '', ...out].join('\n')
}

/** Todo lo de un nodo y sus hijos: medidas, acomodo, rellenos, tipografía, textos. */
export function designNode(d: Design, id: string): string {
  const nodes = locate(d, id.replace(/^#/, ''))
  if (!nodes) throw new RuleError(T`No hay un nodo «${id}» en el diseño. Los ids salen en el árbol de cada página.`)
  const text = JSON.stringify(expand(nodes, id.replace(/^#/, '')), null, 1)
  if (text.length > MAX_DETAIL) throw new RuleError(T`Ese nodo es demasiado grande para leerlo de una vez; pide uno de sus hijos (sus ids salen en el árbol de la página).`)
  return text
}

/** Dónde guarda Orquest qué diseño es el del proyecto (fuera de git, como las bitácoras). */
export const DESIGN_CONFIG = '.orquest/estudio.json'

/** El diseño del proyecto: ruta completa, o null si el usuario aún no eligió. */
export async function designFile(root: string): Promise<string | null> {
  try {
    const { archivo } = JSON.parse(await readFile(join(root, ...DESIGN_CONFIG.split('/')), 'utf8')) as { archivo?: string }
    return archivo ? resolve(root, archivo) : null
  } catch {
    return null
  }
}

/** Anota cuál es el diseño del proyecto. Dentro del proyecto se guarda relativo: así sigue sirviendo si se mueve la carpeta. */
export async function setDesignFile(root: string, file: string): Promise<string> {
  if (!/\.trazo$/i.test(file)) throw new RuleError(T`El diseño tiene que ser un archivo .trazo.`)
  const full = resolve(file)
  const rel = relative(root, full)
  const inside = rel && !rel.startsWith('..') && !isAbsolute(rel)
  const config = join(root, ...DESIGN_CONFIG.split('/'))
  await mkdir(dirname(config), { recursive: true })
  await writeFile(config, `${JSON.stringify({ archivo: inside ? rel.split(sep).join('/') : full }, null, 2)}\n`, 'utf8')
  return full
}

/** Escribe el diseño sin dejarlo a medias: a un temporal y luego se renombra encima. */
export async function writeDesign(file: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, bytes)
  await rename(tmp, file)
}

/** Lo que contesta `leer_diseno`: el resumen, el árbol de una página o el detalle de un nodo. */
export async function readDesignTool(file: string | null, args: { pagina?: unknown; nodo?: unknown }): Promise<string> {
  if (!file) throw new RuleError(T`Este proyecto todavía no tiene diseño en Trazo.`)
  const buf = await readFile(file).catch(() => {
    throw new RuleError(T`No se encontró el diseño del proyecto en ${file}.`)
  })
  const d = parseDesign(buf)
  if (typeof args.nodo === 'string' && args.nodo.trim()) return designNode(d, args.nodo.trim())
  if (typeof args.pagina === 'string' && args.pagina.trim()) return designPage(d, args.pagina.trim())
  return designSummary(d)
}
