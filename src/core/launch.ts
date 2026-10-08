/**
 * Con qué se lanza de verdad una CLI en su terminal.
 *
 * En Windows, lo que npm instala es un lanzador `.cmd`, y una terminal (PTY)
 * no puede crear un proceso a partir de él: falla con "Cannot create process,
 * error code: 2". Pasarlo por `cmd.exe /c` tampoco sirve, porque rompe los
 * argumentos con comillas (los permisos van en JSON). Por eso se lee el
 * lanzador y se arranca directo lo que él arrancaría: el `.exe` del paquete o
 * `node` con su script.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { findBinary } from './detect.js'

export interface Launch {
  file: string
  args: string[]
}

/**
 * A qué apunta un lanzador `.cmd` de npm, relativo a su carpeta. Termina en
 * `"%dp0%\ruta\al\programa" %*`; undefined si no tiene esa forma.
 */
export function shimTarget(text: string): string | undefined {
  const all = [...text.matchAll(/"%~?dp0%?\\([^"]+)"\s*%\*/gi)]
  return all.at(-1)?.[1]
}

/** Qué ejecutar para abrir `names[0]` (o el primero que exista) con esos argumentos. */
export async function resolveLaunch(names: string[], args: string[], pathEnv?: string): Promise<Launch> {
  let found: string | undefined
  for (const n of names) {
    found = await findBinary(n, pathEnv)
    if (found) break
  }
  // Sin encontrarla se deja el nombre: el error dirá cuál falta.
  if (!found) return { file: names[0], args }
  if (process.platform !== 'win32' || !/\.(cmd|bat)$/i.test(found)) return { file: found, args }

  const target = shimTarget(await readFile(found, 'utf8').catch(() => ''))
  if (target) {
    const full = join(dirname(found), target)
    if (/\.exe$/i.test(full)) return { file: full, args }
    // Un script: lo corre el node que está junto al lanzador o, si no, el del PATH.
    const node = (await findBinary('node', dirname(found))) ?? (await findBinary('node', pathEnv))
    if (node) return { file: node, args: [full, ...args] }
  }
  // Lanzador de otra forma: por el intérprete del sistema, como último recurso.
  return { file: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/c', found, ...args] }
}
