import { execFile } from 'node:child_process'
import { access, appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { RuleError } from './board.js'
import { T } from './i18n.js'

const run = promisify(execFile)

async function git(cwd: string, ...args: string[]): Promise<string> {
  try {
    const { stdout } = await run('git', args, { cwd })
    return stdout.trim()
  } catch (err) {
    // «spawn git ENOENT» sale igual si falta git que si falta la carpeta donde se le pidió correr.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    const there = await access(cwd).then(() => true, () => false)
    throw new RuleError(there ? T`No se encontró git en esta máquina. Instálalo y vuelve a abrir Orquest.` : T`La carpeta ${cwd} ya no existe.`)
  }
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

/**
 * Vuelve a armar una oficina que ya no está (alguien borró `.orquest` o la carpeta): git la sigue
 * apuntando y su rama sigue ahí, con lo que el empleado tenía en commits. Se olvida la carpeta
 * vieja y se saca otra vez la rama en el mismo lugar. Si la oficina está, no la toca.
 * Devuelve true si la tuvo que rearmar.
 */
export async function restoreOffice(repo: string, office: Office): Promise<boolean> {
  if (await access(join(office.path, '.git')).then(() => true, () => false)) return false
  const root = await repoRoot(repo)
  await excludeOrquest(root)
  await mkdir(dirname(office.path), { recursive: true })
  await git(root, 'worktree', 'prune')
  const known = await git(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${office.branch}`).then(() => true, () => false)
  if (known) await git(root, 'worktree', 'add', office.path, office.branch)
  else await git(root, 'worktree', 'add', '-b', office.branch, office.path, office.base ?? 'HEAD')
  return true
}

/**
 * Escribe en `dir` los archivos que una CLI lee de su carpeta de trabajo (ganchos de permisos) y los
 * deja fuera de git, para que no se cuelen en una entrega. Si el proyecto ya trae uno con ese nombre,
 * no se toca y se devuelve en la lista.
 */
export async function placeWorkspaceFiles(dir: string, files: Record<string, string>): Promise<string[]> {
  const kept: string[] = []
  for (const [rel, content] of Object.entries(files)) {
    const path = join(dir, rel)
    const mine = await readFile(path, 'utf8').then((t) => t === content, () => undefined)
    if (mine === false) {
      kept.push(rel)
      continue
    }
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
    await exclude(dir, `/${rel.replace(/\\/g, '/')}`).catch(() => {})
  }
  return kept
}

/** Añade un patrón al exclude del repositorio de `dir` (compartido por sus worktrees). */
async function exclude(dir: string, pattern: string) {
  const file = join(await git(dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'), 'info', 'exclude')
  await mkdir(dirname(file), { recursive: true })
  const current = await readFile(file, 'utf8').catch(() => '')
  if (!current.split(/\r?\n/).includes(pattern)) await appendFile(file, `${current && !current.endsWith('\n') ? '\n' : ''}${pattern}\n`)
}

async function excludeOrquest(root: string) {
  const file = join(await git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir'), 'info', 'exclude')
  await mkdir(dirname(file), { recursive: true })
  const current = await readFile(file, 'utf8').catch(() => '')
  if (!current.split('\n').includes('/.orquest/')) {
    await appendFile(file, `${current && !current.endsWith('\n') ? '\n' : ''}/.orquest/\n`)
  }
}

/**
 * Copia de un repositorio dentro de la oficina de un empleado, para los
 * proyectos que agrupan varios: un worktree en `path` sobre la rama `branch`
 * de ese repositorio. Si la rama ya existe (el empleado vuelve a trabajar ahí)
 * se reutiliza; si la copia ya está, se deja como está. `.orquest` vive en la
 * raíz del proyecto, fuera de cada repositorio: no hay nada que excluir de git.
 */
export async function createCopy(repo: string, path: string, branch: string, base = 'HEAD'): Promise<Office> {
  const root = await repoRoot(repo)
  if (await access(join(path, '.git')).then(() => true, () => false)) return { path, branch }
  await mkdir(dirname(path), { recursive: true })
  // Una copia borrada a mano sigue apuntada en git y no dejaría usar su rama otra vez.
  await git(root, 'worktree', 'prune')
  const known = await git(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`).then(() => true, () => false)
  if (known) {
    await git(root, 'worktree', 'add', path, branch)
    return { path, branch }
  }
  const sha = await git(root, 'rev-parse', base)
  await git(root, 'worktree', 'add', '-b', branch, path, sha)
  return { path, branch, base: sha }
}

/** Quita la oficina. La rama se conserva: ahí está la entrega. */
export async function removeOffice(repo: string, office: Pick<Office, 'path'>, force = false): Promise<void> {
  const root = await repoRoot(repo)
  if (!force) {
    await git(root, 'worktree', 'remove', office.path)
    return
  }
  // En Windows la CLI recién cerrada tarda un momento en soltar la carpeta: se insiste un poco.
  for (let attempt = 1; ; attempt++) {
    try {
      await git(root, 'worktree', 'remove', '--force', office.path)
      return
    } catch (err) {
      if (attempt < 4) {
        await new Promise((r) => setTimeout(r, 500))
        continue
      }
      // Si git la dejó a medias, se termina de quitar a mano y se le avisa que ya no existe.
      await rm(office.path, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }).catch(() => {
        throw err
      })
      await git(root, 'worktree', 'prune')
      return
    }
  }
}

/**
 * Lo que se perdería al quitar una oficina: archivos sin entregar y commits de
 * su rama que no están en la rama del repo principal. Lo que git no mira
 * (dependencias instaladas, compilados) no cuenta: es justo lo que pesa.
 */
export async function officePending(repo: string, office: Pick<Office, 'path' | 'branch'>): Promise<{ files: number; commits: number }> {
  const root = await repoRoot(repo)
  const files = (await git(office.path, 'status', '--porcelain', '--untracked-files=all')).split('\n').filter(Boolean).length
  const commits = Number(await git(root, 'rev-list', '--count', `HEAD..${office.branch}`)) || 0
  return { files, commits }
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
    throw new RuleError(T`Este repositorio todavía no tiene ningún commit. Haz el primero (por ejemplo \`git add . && git commit -m "Inicio"\`) y vuelve a contratar: cada empleado trabaja en una copia que parte de ahí.`)
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

/**
 * Quita de la rama de la oficina lo de una entrega descartada: lo que hay de `since` a `commit`
 * (`since` es donde terminaba lo anterior: su entrega previa o la principal). Si la oficina sigue
 * en ese commit y sin cambios, la rama se regresa a `since`; si ya siguió trabajando, se deshace con
 * `git revert`. Si ni así se puede (cambios que chocan, merges en medio), no toca nada.
 */
export async function undoDelivery(office: Office, commit: string, since: string): Promise<'reset' | 'reverted' | 'failed'> {
  const head = await git(office.path, 'rev-parse', 'HEAD').catch(() => '')
  const dirty = await git(office.path, 'status', '--porcelain').catch(() => 'x')
  if (head === commit && !dirty) {
    await git(office.path, 'reset', '-q', '--hard', since)
    return 'reset'
  }
  try {
    await run('git', ['-c', 'user.name=Orquest', '-c', 'user.email=orquest@localhost', 'revert', '--no-edit', `${since}..${commit}`], { cwd: office.path })
    return 'reverted'
  } catch {
    await git(office.path, 'revert', '--abort').catch(() => {})
    return 'failed'
  }
}

/** true si `ancestor` está en la historia de `commit`. */
export async function isAncestor(dir: string, ancestor: string, commit: string): Promise<boolean> {
  return run('git', ['merge-base', '--is-ancestor', ancestor, commit], { cwd: dir }).then(() => true, () => false)
}

/** Commit en que la rama de esa oficina se separó de la principal. */
export async function forkPoint(office: Office, commit: string, main?: string): Promise<string | undefined> {
  return sinceMain(office, commit, main)
}

export type MergeResult = { ok: true; commit: string } | { ok: false; conflicts: string[]; reason: string }

/**
 * Integra la rama de un empleado en la rama actual del repo principal. Si hay
 * conflicto, aborta y deja el repo como estaba: lo resuelve el jefe.
 */
export async function mergeOffice(repo: string, office: Office, message: string): Promise<MergeResult> {
  const root = await repoRoot(repo)
  const dirty = await git(root, 'status', '--porcelain', '--untracked-files=no')
  if (dirty) return { ok: false, conflicts: [], reason: T`El repo principal tiene cambios sin commit; guárdalos antes de integrar.` }
  try {
    await run('git', ['-c', 'user.name=Orquest', '-c', 'user.email=orquest@localhost', 'merge', '--no-ff', '-m', message, office.branch], {
      cwd: root,
    })
    return { ok: true, commit: await git(root, 'rev-parse', 'HEAD') }
  } catch {
    const conflicts = (await git(root, 'diff', '--name-only', '--diff-filter=U').catch(() => '')).split('\n').filter(Boolean)
    await git(root, 'merge', '--abort').catch(() => {})
    return {
      ok: false,
      conflicts,
      reason: conflicts.length ? T`Conflicto al integrar ${office.branch}: ${conflicts.join(', ')}.` : T`Conflicto al integrar ${office.branch}.`,
    }
  }
}
