/**
 * Las capturas de un empleado: las imágenes que dejó en su oficina al probar
 * (con Playwright, con su navegador, a mano). Se muestran en su panel.
 *
 * Son las imágenes nuevas o cambiadas de su carpeta, también las que git
 * ignora (las herramientas de prueba suelen guardar en carpetas ignoradas),
 * más las que él mismo adjuntó al entregar. Solo lectura y solo dentro de su
 * oficina.
 */
import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { RuleError } from './board.js'

const run = promisify(execFile)

export interface Capture {
  /** Ruta dentro de la oficina, con diagonales. */
  path: string
  at: number
  size: number
}

const IMAGE = /\.(png|jpe?g|webp|gif)$/i
// Imágenes que no son capturas: dependencias y salidas de compilación.
const SKIP = /(^|\/)(node_modules|\.git|dist|out|build|\.next|\.nuxt|coverage)\//
const MAX_LIST = 80
const MAX_BYTES = 12 * 1024 * 1024

/** Dentro de `root` o nada: una ruta que se salga no se toca. */
function inside(root: string, path: string): string | undefined {
  const full = resolve(root, path)
  const rel = relative(root, full)
  return !rel || rel.startsWith('..') || isAbsolute(rel) ? undefined : full
}

// Carpetas donde suelen quedar las capturas: lo que haya ahí cuenta aunque ya esté en un commit.
const SHOTS = /(^|\/)[^/]*(captur|screenshot|pantallazo|evidenc|playwright|test-results)[^/]*\//i

async function names(office: string, ...args: string[]): Promise<string[]> {
  const { stdout } = await run('git', args, { cwd: office, maxBuffer: 32 * 1024 * 1024 }).catch(() => ({ stdout: '' }))
  return stdout.split('\0').filter(Boolean)
}

/**
 * Capturas en la oficina, lo más reciente primero. `extra`: rutas que el
 * empleado adjuntó al entregar. `main`: commit actual de la rama principal,
 * para contar también lo que su rama añade (al entregar, sus capturas quedan
 * en un commit y dejan de verse como "sin guardar").
 */
export async function listCaptures(office: string, extra: string[] = [], main?: string): Promise<Capture[]> {
  // Sin guardar: nuevas, cambiadas e ignoradas. -z para rutas con espacios o acentos.
  const paths = new Set((await names(office, 'status', '--porcelain', '-z', '--untracked-files=all', '--ignored')).map((entry) => entry.slice(3)))
  // Lo que su rama trae y la principal no.
  if (main) for (const p of await names(office, 'diff', '--name-only', '-z', '--diff-filter=AM', `${main}...HEAD`)) paths.add(p)
  // Y lo que viva en una carpeta de capturas, venga de donde venga.
  for (const p of await names(office, 'ls-files', '-z')) if (SHOTS.test(p)) paths.add(p)
  for (const p of extra) {
    const full = inside(office, p)
    if (full) paths.add(relative(office, full).split('\\').join('/'))
  }
  const found: Capture[] = []
  for (const path of paths) {
    if (!IMAGE.test(path) || SKIP.test(path)) continue
    const info = await stat(join(office, path)).catch(() => null)
    if (info?.isFile()) found.push({ path, at: info.mtimeMs, size: info.size })
  }
  return found.sort((a, b) => b.at - a.at).slice(0, MAX_LIST)
}

/** Los bytes de una captura y su tipo, para pintarla en el panel. */
export async function readCapture(office: string, path: string): Promise<{ bytes: Uint8Array; type: string }> {
  const full = inside(office, path)
  if (!full) throw new RuleError('Esa imagen no está dentro de su oficina.')
  if (!IMAGE.test(full)) throw new RuleError('Solo se pueden abrir imágenes.')
  const info = await stat(full).catch(() => null)
  if (!info?.isFile()) throw new RuleError(`Ya no existe ${path}.`)
  if (info.size > MAX_BYTES) throw new RuleError(`${path} pesa demasiado para mostrarla aquí.`)
  const ext = /\.(\w+)$/.exec(full)![1].toLowerCase()
  return { bytes: await readFile(full), type: `image/${ext === 'jpg' ? 'jpeg' : ext}` }
}
