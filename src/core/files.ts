/**
 * El explorador de archivos del panel de un empleado: qué hay en una carpeta de
 * su oficina y el texto de un archivo. Solo lee, y nunca fuera de la oficina.
 */
import { open, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { RuleError } from './board.js'
import { T } from './i18n.js'

export interface FileEntry {
  name: string
  /** Su ruta dentro de la oficina, con `/`. */
  path: string
  dir: boolean
}

export interface FileText {
  text: string
  /** No es texto (imagen, ejecutable…): no se muestra. */
  binary: boolean
  /** Es más largo que el tope: `text` trae solo el principio. */
  truncated: boolean
  size: number
}

/** Cuánto texto se manda al panel como mucho; un archivo más largo se corta. */
const MAX_TEXT = 400_000
/** Cuántas entradas de una carpeta se listan como mucho. */
const MAX_ENTRIES = 2000

/** La ruta completa de algo de la oficina; si se sale de ella (con `..` o por un enlace), no se da. */
async function inside(office: string, path: string): Promise<string> {
  const outside = () => new RuleError(T`Ese archivo queda fuera de su oficina.`)
  const root = await realpath(resolve(office))
  const wanted = resolve(root, path || '.')
  const escapes = (p: string) => {
    const back = relative(root, p)
    return back.startsWith('..') || isAbsolute(back)
  }
  if (escapes(wanted)) throw outside()
  // Un enlace dentro de la oficina puede apuntar afuera: cuenta a dónde llega de verdad.
  const real = await realpath(wanted)
  if (escapes(real)) throw outside()
  return real
}

/** Lo que hay en una carpeta de la oficina (`''` es la raíz): carpetas primero, sin `.git`. */
export async function listDir(office: string, dir = ''): Promise<FileEntry[]> {
  const full = await inside(office, dir)
  const base = dir.split(/[\\/]+/).filter(Boolean).join('/')
  const entries = (await readdir(full, { withFileTypes: true }))
    .filter((e) => e.name !== '.git')
    .map((e) => ({ name: e.name, path: base ? `${base}/${e.name}` : e.name, dir: e.isDirectory() }))
  entries.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return entries.slice(0, MAX_ENTRIES)
}

/** El texto de un archivo de la oficina, para leerlo en el panel. */
export async function readText(office: string, path: string): Promise<FileText> {
  const full = await inside(office, path)
  const info = await stat(full)
  if (!info.isFile()) throw new RuleError(T`Eso no es un archivo.`)
  const handle = await open(full, 'r')
  try {
    const buffer = Buffer.alloc(Math.min(info.size, MAX_TEXT))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const bytes = buffer.subarray(0, bytesRead)
    // Un byte nulo al principio delata lo que no es texto.
    if (bytes.subarray(0, 8000).includes(0)) return { text: '', binary: true, truncated: false, size: info.size }
    return { text: bytes.toString('utf8'), binary: false, truncated: info.size > MAX_TEXT, size: info.size }
  } finally {
    await handle.close()
  }
}
