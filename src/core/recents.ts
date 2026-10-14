/**
 * Los proyectos abiertos en esta máquina, para Inicio. Viven en un archivo de
 * la carpeta de la app (`<userData>/recientes.json`), no en el almacenamiento
 * del navegador: ese cambia entre la app instalada y la de desarrollo, y se
 * perdían. Quitar uno de la lista no toca su carpeta.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface RecentProject {
  path: string
  /** Cuándo se abrió por última vez; 0 si no se sabe. */
  at: number
  /** Es una carpeta que agrupa repositorios y se abrió como un solo proyecto. */
  group?: boolean
}

/** Cuántos se recuerdan; los más viejos se olvidan. */
export const MAX_RECENTS = 50

/** La misma carpeta escrita distinto (mayúsculas en Windows, barra final) es el mismo proyecto. */
const same = (a: string, b: string) => {
  const norm = (p: string) => p.replace(/[\\/]+$/, '').replace(/\//g, '\\')
  return process.platform === 'win32' ? norm(a).toLowerCase() === norm(b).toLowerCase() : a.replace(/[\\/]+$/, '') === b.replace(/[\\/]+$/, '')
}

const clean = (list: unknown): RecentProject[] =>
  (Array.isArray(list) ? list : [])
    .filter((r): r is RecentProject => !!r && typeof (r as RecentProject).path === 'string' && !!(r as RecentProject).path)
    .map((r) => ({ path: r.path, at: Number(r.at) || 0, ...(r.group ? { group: true } : {}) }))

export class Recents {
  private list: RecentProject[] | null = null
  /** Una escritura a la vez: dos aperturas seguidas no se pisan. */
  private chain: Promise<unknown> = Promise.resolve()

  constructor(private file: string) {}

  private async load(): Promise<RecentProject[]> {
    if (this.list) return this.list
    try {
      this.list = clean(JSON.parse(await readFile(this.file, 'utf8')))
    } catch {
      this.list = []
    }
    return this.list
  }

  private change(fn: (list: RecentProject[]) => RecentProject[]): Promise<RecentProject[]> {
    const next = this.chain.then(async () => {
      const list = fn(await this.load())
        .sort((a, b) => b.at - a.at)
        .slice(0, MAX_RECENTS)
      this.list = list
      await mkdir(dirname(this.file), { recursive: true })
      // Se escribe aparte y se reemplaza: un corte a la mitad no deja el archivo roto.
      const tmp = `${this.file}.tmp`
      await writeFile(tmp, `${JSON.stringify(list, null, 2)}\n`, 'utf8')
      await rename(tmp, this.file)
      return list
    })
    this.chain = next.catch(() => {})
    return next
  }

  /** Lo más reciente primero. */
  async all(): Promise<RecentProject[]> {
    await this.chain
    return [...(await this.load())]
  }

  /** Se abrió un proyecto: sube al principio con su fecha. */
  touch(entry: RecentProject): Promise<RecentProject[]> {
    const [one] = clean([entry])
    if (!one) return this.all()
    return this.change((list) => [one, ...list.filter((r) => !same(r.path, one.path))])
  }

  /** Lo quita de la lista; su carpeta no se toca. */
  remove(path: string): Promise<RecentProject[]> {
    return this.change((list) => list.filter((r) => !same(r.path, path)))
  }

  /** Lo que guardaba una versión anterior en el navegador: se suma sin repetir y sin pisar lo más nuevo. */
  import(entries: unknown): Promise<RecentProject[]> {
    const incoming = clean(entries)
    return this.change((list) => [...list, ...incoming.filter((r) => !list.some((x) => same(x.path, r.path)))])
  }
}
