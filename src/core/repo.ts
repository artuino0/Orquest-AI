/**
 * Antes de abrir un proyecto: ¿la carpeta sirve tal como está? Orquest necesita
 * un repositorio de git con al menos un commit (de ahí parte la copia de cada
 * empleado). Si falta, la app lo prepara ella misma, con permiso del usuario,
 * en vez de mandarlo a la terminal.
 */
import { execFile } from 'node:child_process'
import { access, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { RuleError } from './board.js'
import { T } from './i18n.js'

const run = promisify(execFile)
const git = (cwd: string, ...args: string[]) => run('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 }).then((r) => r.stdout.trim())
const exists = (path: string) => access(path).then(() => true, () => false)

export interface RepoCheck {
  /** `ok`: se puede abrir. `no-repo`: la carpeta no es un repositorio. `no-commits`: lo es, pero vacío. */
  state: 'ok' | 'no-repo' | 'no-commits'
  /** Cuando no es repositorio: los que hay dentro, un nivel abajo (rutas completas). */
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

export async function checkRepo(dir: string): Promise<RepoCheck> {
  const gitignore = await exists(join(dir, '.gitignore'))
  const isRepo = await git(dir, 'rev-parse', '--is-inside-work-tree').then((out) => out === 'true', () => false)
  if (!isRepo) {
    const inside: string[] = []
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (entry.isDirectory() && (await exists(join(dir, entry.name, '.git')))) inside.push(join(dir, entry.name))
    }
    return { state: 'no-repo', inside: inside.sort(), gitignore }
  }
  const born = await git(dir, 'rev-parse', '--verify', '--quiet', 'HEAD').then(() => true, () => false)
  return { state: born ? 'ok' : 'no-commits', inside: [], gitignore }
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
