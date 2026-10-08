/**
 * La oficina que dibujó el usuario, guardada como JSON junto a los datos del
 * estudio. Qué significa cada cosa del mapa lo sabe quien lo dibuja; aquí solo
 * se lee y se escribe sin dejar el archivo a medias.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Lo guardado, o null si aún no hay nada o el archivo no se entiende. */
export async function readOffice(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

/** Escribe a un archivo temporal y lo renombra: si la app se cierra a media escritura queda el anterior. */
export async function writeOffice(path: string, office: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(office))
  await rename(tmp, path)
}
