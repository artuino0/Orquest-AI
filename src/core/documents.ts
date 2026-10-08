/**
 * Los documentos del proyecto: planes, notas y demás texto que escribe el
 * jefe (o cualquiera) en el repo. Para leerlos desde la app sin ir a buscarlos.
 * Solo lectura, y solo dentro del repo.
 */
import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { RuleError } from './board.js'

const run = promisify(execFile)

export interface ProjectDocument {
  /** Ruta dentro del repo, con diagonales. */
  path: string
  /** Última modificación. */
  at: number
  size: number
  /** Nuevo o cambiado respecto al último commit; undefined si está igual. */
  status?: 'nuevo' | 'cambiado'
}

const DOC = /\.(md|mdx|txt)$/i
// Lo que no es documento del proyecto: dependencias, salidas y las oficinas de los empleados.
const SKIP = /(^|\/)(node_modules|dist|out|build|\.git|vendor)\//
const MAX_BYTES = 400_000

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 })
  return stdout
}

/** Documentos de texto del repo, lo más reciente primero. */
export async function listDocuments(root: string): Promise<ProjectDocument[]> {
  // Seguidos por git más los nuevos sin ignorar; -z para rutas con espacios o acentos.
  const listed = (await git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard')).split('\0').filter(Boolean)
  const changed = new Map<string, 'nuevo' | 'cambiado'>()
  for (const entry of (await git(root, 'status', '--porcelain', '-z', '--untracked-files=all')).split('\0').filter(Boolean)) {
    changed.set(entry.slice(3), entry.startsWith('??') || entry.startsWith('A') ? 'nuevo' : 'cambiado')
  }
  const docs: ProjectDocument[] = []
  for (const path of new Set(listed)) {
    if (!DOC.test(path) || SKIP.test(path) || path.startsWith('.orquest/oficinas/')) continue
    const info = await stat(join(root, path)).catch(() => null)
    if (info?.isFile()) docs.push({ path, at: info.mtimeMs, size: info.size, status: changed.get(path) })
  }
  return docs.sort((a, b) => b.at - a.at)
}

/** El texto de un documento del repo. No sale del repo ni lee cosas enormes. */
export async function readDocument(root: string, path: string): Promise<string> {
  const full = resolve(root, path)
  const inside = relative(root, full)
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new RuleError('Ese archivo no está dentro del proyecto.')
  if (!DOC.test(full)) throw new RuleError('Solo se pueden abrir documentos de texto (.md, .mdx, .txt).')
  const info = await stat(full).catch(() => null)
  if (!info?.isFile()) throw new RuleError(`Ya no existe ${path}.`)
  const text = await readFile(full, 'utf8')
  return text.length > MAX_BYTES ? `${text.slice(0, MAX_BYTES)}\n\n… (recortado: el archivo es muy largo)` : text
}
