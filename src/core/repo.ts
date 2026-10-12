/**
 * Antes de abrir un proyecto: ¿la carpeta sirve tal como está? Orquest necesita
 * un repositorio de git con al menos un commit (de ahí parte la copia de cada
 * empleado). Si falta, la app lo prepara ella misma, con permiso del usuario,
 * en vez de mandarlo a la terminal.
 */
import { execFile } from 'node:child_process'
import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { RuleError } from './board.js'
import { T } from './i18n.js'

const run = promisify(execFile)
const git = (cwd: string, ...args: string[]) => run('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 }).then((r) => r.stdout.trim())
const exists = (path: string) => access(path).then(() => true, () => false)

export interface RepoCheck {
  /** `ok`: se puede abrir. `no-repo`: la carpeta no es un repositorio. `no-commits`: lo es, pero vacío. */
  state: 'ok' | 'no-repo' | 'no-commits'
  /** Cuando no es repositorio: los que hay dentro, directos o agrupados en subcarpetas (rutas completas). */
  inside: string[]
  /** Ya tiene `.gitignore`; si no, al prepararla se crea uno básico. */
  gitignore: boolean
}

/** Lo que no debe entrar al primer commit de un proyecto que nunca tuvo git. */
const starterIgnore = () =>
  [
    T`# Creado por Orquest AI al iniciar el repositorio: lo que no se guarda en git.`,
    'node_modules/',
    'dist/',
    'build/',
    'out/',
    '.venv/',
    'venv/',
    '__pycache__/',
    '.env',
    '.env.*',
    '!.env.example',
    '.DS_Store',
    'Thumbs.db',
    '*.log',
    '',
  ].join('\n')

/** Hasta cuántas carpetas abajo se buscan repositorios (`grupo/servicio/repo`). */
const NESTED_DEPTH = 3
/** Carpetas en las que no se busca: pesan mucho y lo que traen con `.git` no es del proyecto. */
const SKIP = new Set(['node_modules', 'vendor', 'dist', 'build', 'out', 'target', 'venv', '__pycache__'])

/**
 * Repositorios dentro de `dir` (rutas completas, en orden). Pueden estar
 * agrupados en subcarpetas (`mocks/simulador-a`), así que se baja unos niveles;
 * dentro de un repositorio ya no se busca, ni en carpetas ocultas.
 */
async function nested(dir: string, depth = NESTED_DEPTH): Promise<string[]> {
  const inside: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (await exists(join(path, '.git'))) inside.push(path)
    else if (depth > 1) inside.push(...(await nested(path, depth - 1)))
  }
  return inside.sort()
}

/** ¿Tiene al menos un commit? De él parte la copia de cada empleado. */
const born = (dir: string) => git(dir, 'rev-parse', '--verify', '--quiet', 'HEAD').then(() => true, () => false)

export async function checkRepo(dir: string): Promise<RepoCheck> {
  const gitignore = await exists(join(dir, '.gitignore'))
  const isRepo = await git(dir, 'rev-parse', '--is-inside-work-tree').then((out) => out === 'true', () => false)
  // Repositorios dentro: una carpeta que agrupa proyectos no se convierte en uno.
  if (!isRepo) return { state: 'no-repo', inside: await nested(dir), gitignore }
  if (await born(dir)) return { state: 'ok', inside: [], gitignore }
  // Con `git init` recién hecho en una carpeta que agrupa repositorios tampoco se guarda nada: los envolvería.
  return { state: 'no-commits', inside: await nested(dir), gitignore }
}

/** Un repositorio de un proyecto que agrupa varios. */
export interface ProjectRepo {
  /**
   * Su ruta dentro del proyecto, con `/`: el nombre de su carpeta o, si está
   * agrupado en otra, `grupo/carpeta`. Así lo nombran el jefe (`repositorio`) y la interfaz.
   */
  name: string
  path: string
}

export interface GroupCheck {
  /** Los repositorios de la carpeta, directos o agrupados en subcarpetas. */
  repos: ProjectRepo[]
  /** Nombres de los que todavía no tienen ningún commit: con uno así el proyecto no se puede abrir. */
  empty: string[]
}

/**
 * Una carpeta que solo agrupa repositorios (ella no lo es, o tiene un `git init`
 * vacío que se ignora) se abre como un solo proyecto: cada subcarpeta con
 * `.git`, directa o agrupada en otra, es uno de sus repositorios. Aquí se ve cuáles son y si alguno
 * todavía no sirve.
 */
export async function checkGroup(dir: string): Promise<GroupCheck> {
  const root = resolve(dir)
  const repos = (await nested(root)).map((path) => ({ name: relative(root, path).split(sep).join('/'), path }))
  const empty: string[] = []
  for (const r of repos) if (!(await born(r.path))) empty.push(r.name)
  return { repos, empty }
}

/** Los repositorios de una carpeta que se abre como un solo proyecto; si no sirve para eso, dice por qué. */
export async function groupRepos(dir: string): Promise<ProjectRepo[]> {
  const { repos, empty } = await checkGroup(dir)
  if (!repos.length) throw new RuleError(T`Esta carpeta no tiene repositorios dentro: no se puede abrir como un solo proyecto.`)
  if (empty.length) {
    throw new RuleError(
      empty.length === 1
        ? T`El repositorio ${empty[0]} todavía no tiene ningún commit. Haz el primero ahí y vuelve a abrir el proyecto: la copia de cada empleado parte de él.`
        : T`Los repositorios ${empty.join(', ')} todavía no tienen ningún commit. Haz el primero en cada uno y vuelve a abrir el proyecto: la copia de cada empleado parte de él.`,
    )
  }
  return repos
}

/**
 * Deja la carpeta lista para abrirse: la inicia como repositorio si no lo es y
 * guarda el primer commit con lo que haya. Sin `.gitignore` crea uno básico
 * antes, para que no entren dependencias, compilados ni archivos `.env`.
 */
export async function prepareRepo(dir: string): Promise<void> {
  const check = await checkRepo(dir)
  if (check.state === 'ok') return
  // Una carpeta con repositorios dentro no se convierte en uno: los envolvería a todos.
  if (check.inside.length) throw new RuleError(T`Esta carpeta tiene repositorios dentro: abre uno de ellos en vez de iniciar otro aquí.`)
  if (check.state === 'no-repo') await git(dir, 'init', '-q', '-b', 'main')
  if (!check.gitignore) await writeFile(join(dir, '.gitignore'), starterIgnore(), 'utf8')
  await git(dir, 'add', '-A')
  // Una máquina recién estrenada no tiene nombre ni correo en git, y sin ellos no deja guardar.
  const named = (await git(dir, 'config', 'user.name').catch(() => '')) && (await git(dir, 'config', 'user.email').catch(() => ''))
  const identity = named ? [] : ['-c', 'user.name=Orquest', '-c', 'user.email=orquest@localhost']
  await git(dir, ...identity, 'commit', '-q', '--allow-empty', '--no-verify', '-m', T`Primer commit`)
}

/** Nombre de carpeta para un repositorio: letras, números, punto, guion y guion bajo. */
const REPO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/
const MAX_GROUP = 12

/**
 * Convierte una carpeta sin git en una que agrupa repositorios: crea dentro una
 * subcarpeta por nombre y la deja lista (repositorio con su primer commit). A
 * la carpeta misma no se le pone git. Si una subcarpeta ya existe, se usa tal
 * cual: lo que tenga entra a su primer commit.
 */
export async function createGroup(dir: string, names: string[]): Promise<string[]> {
  const wanted = names.map((n) => n.trim()).filter(Boolean)
  if (!wanted.length) throw new RuleError(T`Escribe al menos un nombre de repositorio (por ejemplo: front, back).`)
  if (wanted.length > MAX_GROUP) throw new RuleError(T`Son demasiados repositorios de una vez (máximo ${MAX_GROUP}).`)
  const seen = new Set<string>()
  for (const name of wanted) {
    if (!REPO_NAME.test(name) || name.startsWith('.')) throw new RuleError(T`«${name}» no sirve como nombre de carpeta: usa letras, números, guion o guion bajo, sin espacios.`)
    if (seen.has(name.toLowerCase())) throw new RuleError(T`El nombre «${name}» está repetido.`)
    seen.add(name.toLowerCase())
  }
  const here = await checkRepo(dir)
  if (here.state !== 'no-repo') throw new RuleError(T`Esta carpeta ya es un repositorio: no se le pueden crear otros dentro.`)
  for (const name of wanted) {
    const sub = join(dir, name)
    await mkdir(sub, { recursive: true })
    await prepareRepo(sub)
  }
  return wanted
}
