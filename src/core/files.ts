/**
 * El explorador de archivos del panel de un empleado: qué hay en una carpeta de
 * su oficina y el texto de un archivo. Solo lee, y nunca fuera de la oficina.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { open, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
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
  /** Sello de lo que hay en disco: con él se guarda. Vacío si no se puede editar (cortado, o no es texto). */
  stamp: string
}

/** El sello de un contenido: guardar exige que el disco siga teniendo el que se leyó. */
const stampOf = (bytes: Buffer) => createHash('sha1').update(bytes).digest('hex')

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
  // Lo que ya no existe (un archivo borrado) no llega a ningún lado: vale su ruta tal cual.
  const real = await realpath(wanted).catch(() => wanted)
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
    if (bytes.subarray(0, 8000).includes(0)) return { text: '', binary: true, truncated: false, size: info.size, stamp: '' }
    const truncated = info.size > MAX_TEXT
    return { text: bytes.toString('utf8'), binary: false, truncated, size: info.size, stamp: truncated ? '' : stampOf(bytes) }
  } finally {
    await handle.close()
  }
}

/** Los dos lados de un cambio, para verlos uno junto al otro. */
export interface FileSides {
  /** Como estaba en el último commit; vacío si el archivo es nuevo. */
  before: string
  /** Como está ahora en la oficina; vacío si se borró. */
  after: string
  binary: boolean
  truncated: boolean
  /** Sello del «ahora», para guardar; vacío si no se puede editar (borrado, cortado, o no es texto). */
  stamp: string
}

const run = promisify(execFile)
const cutText = (bytes: Buffer) => bytes.subarray(0, MAX_TEXT).toString('utf8')

/**
 * Un archivo de la oficina antes y ahora. El «antes» sale del repositorio que
 * lo contiene (la oficina puede ser un worktree o una carpeta con varios), así
 * que git se pregunta desde la carpeta del archivo.
 */
export async function fileSides(office: string, path: string): Promise<FileSides> {
  const full = await inside(office, path)
  const now = await stat(full).then((i) => (i.isFile() ? i : null), () => null)
  let after = Buffer.alloc(0)
  if (now) {
    const handle = await open(full, 'r')
    try {
      const buffer = Buffer.alloc(Math.min(now.size, MAX_TEXT + 1))
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      after = buffer.subarray(0, bytesRead)
    } finally {
      await handle.close()
    }
  }
  // Si su carpeta también se borró, se sube hasta una que exista.
  let cwd = dirname(full)
  while (!(await stat(cwd).then((i) => i.isDirectory(), () => false)) && dirname(cwd) !== cwd) cwd = dirname(cwd)
  const inRepo = `HEAD:./${relative(cwd, full).split(sep).join('/')}`
  const before = await run('git', ['show', inRepo], { cwd, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }).then(
    (r) => r.stdout,
    () => Buffer.alloc(0), // nuevo, o fuera de un repositorio
  )
  const binary = [before, after].some((b) => b.subarray(0, 8000).includes(0))
  if (binary) return { before: '', after: '', binary, truncated: false, stamp: '' }
  const truncated = before.length > MAX_TEXT || after.length > MAX_TEXT
  return { before: cutText(before), after: cutText(after), binary, truncated, stamp: now && !truncated ? stampOf(after) : '' }
}

const BOM = Buffer.from([0xef, 0xbb, 0xbf])

/**
 * Guarda lo que el usuario editó de un archivo de la oficina. Solo sobre un
 * archivo que ya existe y que sigue como se leyó (`stamp`): si alguien lo
 * cambió entre tanto, no se pisa. Devuelve el sello nuevo.
 */
export async function writeText(office: string, path: string, text: string, stamp: string): Promise<string> {
  const full = await inside(office, path)
  if (relative(await realpath(resolve(office)), full).split(sep).includes('.git')) throw new RuleError(T`Lo que hay dentro de .git no se edita aquí.`)
  const current = await readFile(full).catch(() => null)
  if (!current) throw new RuleError(T`Ese archivo ya no existe: no se guardó nada.`)
  if (!stamp || stampOf(current) !== stamp) {
    throw new RuleError(T`El archivo cambió en el disco desde que lo abriste: no se guardó nada, para no pisar ese cambio. Vuelve a abrirlo para ver cómo quedó.`)
  }
  // El editor no muestra la marca de inicio (BOM); si el archivo la traía, se conserva.
  const bytes = Buffer.from(text.replace(/^\uFEFF/, ''), 'utf8')
  const next = current.subarray(0, 3).equals(BOM) ? Buffer.concat([BOM, bytes]) : bytes
  await writeFile(full, next)
  return stampOf(next)
}
