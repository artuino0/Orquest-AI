import { execFile } from 'node:child_process'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { RuleError } from './board.js'

const run = promisify(execFile)

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd })
  return stdout.trim()
}

export interface Office {
  /** Carpeta del worktree: la oficina del empleado. */
  path: string
  branch: string
  /** Commit del que partió; contra él se mide la entrega. */
  base?: string
}

/** Raíz del repositorio que contiene `dir`. Falla si no es un repo git. */
export async function repoRoot(dir: string): Promise<string> {
  return git(dir, 'rev-parse', '--show-toplevel')
}

/**
 * Crea la oficina de un empleado: un git worktree propio sobre una rama nueva
 * `orquest/<id>`, para que varios agentes trabajen a la vez sin pisarse.
 * Vive dentro del repo, en `.orquest/oficinas/<id>`: así hereda la confianza
 * que el usuario dio al repo (Claude Code no vuelve a preguntar) y queda fuera
 * de git con `.git/info/exclude`, sin tocar el .gitignore del proyecto.
 */
export async function createOffice(repo: string, employeeId: string, base = 'HEAD'): Promise<Office> {
  const root = await repoRoot(repo)
  await excludeOrquest(root)
  const path = join(root, '.orquest', 'oficinas', employeeId)
  const branch = `orquest/${employeeId}`
  await mkdir(dirname(path), { recursive: true })
  const sha = await git(root, 'rev-parse', base)
  await git(root, 'worktree', 'add', '-b', branch, path, sha)
  return { path, branch, base: sha }
}

async function excludeOrquest(root: string) {
  const file = join(await git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir'), 'info', 'exclude')
  await mkdir(dirname(file), { recursive: true })
  const current = await readFile(file, 'utf8').catch(() => '')
  if (!current.split('\n').includes('/.orquest/')) {
    await appendFile(file, `${current && !current.endsWith('\n') ? '\n' : ''}/.orquest/\n`)
  }
}

/** Quita la oficina. La rama se conserva: ahí está la entrega. */
export async function removeOffice(repo: string, office: Office, force = false): Promise<void> {
  const root = await repoRoot(repo)
  await git(root, 'worktree', 'remove', ...(force ? ['--force'] : []), office.path)
}

export interface FileChange {
  status: string
  path: string
}

/** Archivos tocados en la oficina (git status --porcelain), para el drawer. */
export async function officeChanges(office: Office): Promise<FileChange[]> {
  const out = await git(office.path, 'status', '--porcelain', '--untracked-files=all')
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => ({ status: line.slice(0, 2).trim(), path: line.slice(3) }))
}

/** Diff de un archivo de la oficina contra la base; los nuevos se muestran completos. */
export async function officeDiff(office: Office, path: string): Promise<string> {
  const tracked = await git(office.path, 'ls-files', '--', path)
  if (tracked) return git(office.path, 'diff', 'HEAD', '--', path)
  try {
    return await git(office.path, 'diff', '--no-index', '--', '/dev/null', path)
  } catch (err) {
    // `git diff --no-index` sale con 1 cuando hay diferencias.
    return ((err as { stdout?: string }).stdout ?? '').trim()
  }
}

/** Rama actual del repo principal: ahí se integran las entregas. */
export async function currentBranch(repo: string): Promise<string> {
  // Un repositorio recién creado no tiene HEAD: las oficinas (worktrees) necesitan un commit del que partir.
  const born = await git(repo, 'rev-parse', '--verify', '--quiet', 'HEAD').then(() => true, () => false)
  if (!born) {
    throw new RuleError('Este repositorio todavía no tiene ningún commit. Haz el primero (por ejemplo `git add . && git commit -m "Inicio"`) y vuelve a contratar: cada empleado trabaja en una copia que parte de ahí.')
  }
  return git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')
}

/**
 * Contra qué se mide una entrega: lo que tiene la rama y la principal todavía
 * no. Si el empleado trajo la principal a su oficina (`git merge`), eso no
 * cuenta como suyo. `main` es el commit actual de la rama principal; sin él
 * (o si ya no existe) se mide contra el commit del que partió la oficina.
 */
async function sinceMain(office: Office, commit: string, main?: string): Promise<string | undefined> {
  if (main) {
    const fork = await git(office.path, 'merge-base', main, commit).catch(() => '')
    if (fork) return fork
  }
  return office.base
}

/**
 * Cierra la entrega: hace commit de todo lo pendiente en la oficina y devuelve
 * el commit y el resumen de lo que esa rama le añadiría a la principal.
 */
export async function commitDelivery(office: Office, message: string, main?: string): Promise<{ commit: string; diffStat: string }> {
  await git(office.path, 'add', '-A')
  const pending = await git(office.path, 'status', '--porcelain')
  if (pending) {
    await run('git', ['-c', 'user.name=Orquest', '-c', 'user.email=orquest@localhost', 'commit', '-q', '--no-verify', '-m', message], {
      cwd: office.path,
    })
  }
  const commit = await git(office.path, 'rev-parse', 'HEAD')
  const from = await sinceMain(office, commit, main)
  const diffStat = from ? await git(office.path, 'diff', '--stat', from, commit) : ''
  return { commit, diffStat }
}

/** Diff completo de la entrega (lo que añadiría a la principal), para la bandeja. */
export async function deliveryDiff(office: Office, commit: string, main?: string): Promise<string> {
  const from = await sinceMain(office, commit, main)
  return from ? git(office.path, 'diff', from, commit) : ''
}

/** true si integrar esa entrega no cambiaría nada: la principal ya contiene todo lo que trae. */
export async function nothingToMerge(repo: string, commit: string): Promise<boolean> {
  const root = await repoRoot(repo)
  return run('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: root }).then(() => true, () => false)
}

/** Commit actual de la rama principal del repo. */
export async function headOf(repo: string): Promise<string> {
  return git(await repoRoot(repo), 'rev-parse', 'HEAD')
}

export type MergeResult = { ok: true; commit: string } | { ok: false; conflicts: string[]; reason: string }

/**
 * Integra la rama de un empleado en la rama actual del repo principal. Si hay
 * conflicto, aborta y deja el repo como estaba: lo resuelve el jefe.
 */
export async function mergeOffice(repo: string, office: Office, message: string): Promise<MergeResult> {
  const root = await repoRoot(repo)
  const dirty = await git(root, 'status', '--porcelain', '--untracked-files=no')
  if (dirty) return { ok: false, conflicts: [], reason: 'El repo principal tiene cambios sin commit; guárdalos antes de integrar.' }
  try {
    await run('git', ['-c', 'user.name=Orquest', '-c', 'user.email=orquest@localhost', 'merge', '--no-ff', '-m', message, office.branch], {
      cwd: root,
    })
    return { ok: true, commit: await git(root, 'rev-parse', 'HEAD') }
  } catch {
    const conflicts = (await git(root, 'diff', '--name-only', '--diff-filter=U').catch(() => '')).split('\n').filter(Boolean)
    await git(root, 'merge', '--abort').catch(() => {})
    return { ok: false, conflicts, reason: `Conflicto al integrar ${office.branch}${conflicts.length ? `: ${conflicts.join(', ')}` : ''}.` }
  }
}
