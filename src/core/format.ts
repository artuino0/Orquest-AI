/**
 * Formatear un archivo con Prettier, desde el editor del panel. Se formatea el
 * texto que hay en el editor (no el disco) y se devuelve: guardar es otro paso.
 *
 * Las opciones salen del proyecto, pero solo de archivos que son dato
 * (`.prettierrc` en JSON, `.prettierrc.json`, la clave `prettier` de
 * `package.json`). Una configuración en JavaScript o un plugin serían código
 * del proyecto corriendo dentro de la app: no se cargan.
 */
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { RuleError } from './board.js'
import { T } from './i18n.js'

type Options = Record<string, unknown>

/** Lo que no se toma de la configuración: código que cargar, o cosas que solo valen para otros archivos. */
const DROPPED = ['plugins', 'overrides', 'parser', 'filepath']

function clean(raw: unknown): Options | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const options = { ...(raw as Options) }
  for (const key of DROPPED) delete options[key]
  return options
}

/** Lo que trae un archivo JSON; null si no existe o no es JSON (un `.prettierrc` en YAML, por ejemplo). */
const json = (file: string) =>
  readFile(file, 'utf8')
    .then((text) => JSON.parse(text) as unknown)
    .catch(() => null)

/** Las opciones de Prettier que le tocan a un archivo: las de la carpeta más cercana, subiendo hasta la oficina. */
export async function projectOptions(office: string, path: string): Promise<Options> {
  const root = resolve(office)
  let dir = dirname(resolve(root, path))
  for (;;) {
    const back = relative(root, dir)
    if (back.startsWith('..') || isAbsolute(back)) return {}
    for (const name of ['.prettierrc', '.prettierrc.json']) {
      const found = clean(await json(join(dir, name)))
      if (found) return found
    }
    const pkg = (await json(join(dir, 'package.json'))) as { prettier?: unknown } | null
    const found = clean(pkg?.prettier)
    if (found) return found
    if (dir === root) return {}
    dir = dirname(dir)
  }
}

/** El texto de un archivo, formateado como lo dejaría Prettier en ese proyecto. */
export async function formatText(office: string, path: string, text: string): Promise<string> {
  const prettier = await import('prettier')
  const options = await projectOptions(office, path)
  try {
    return await prettier.format(text, { ...options, filepath: path.split(/[\\/]/).pop() })
  } catch (err) {
    const e = err as Error
    if (e.name === 'UndefinedParserError') throw new RuleError(T`Prettier no sabe formatear este tipo de archivo.`)
    // Un error de sintaxis trae el renglón y un recorte del código: basta su primera línea.
    throw new RuleError(T`No se pudo formatear: ${e.message.split('\n')[0]}`)
  }
}
