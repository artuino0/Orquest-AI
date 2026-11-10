import { execFile } from 'node:child_process'
import { access, lstat, appendFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
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
export async function createOffice(repo: string, employeeId: string, base = 'HEAD', branch = `orquest/${employeeId}`): Promise<Office> {
  const root = await repoRoot(repo)
  await excludeOrquest(root)
  const path = join(root, '.orquest', 'oficinas', employeeId)
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
export async function placeWorkspaceFiles(dir: string, files: Record<string, string | Uint8Array>): Promise<string[]> {
  const kept: string[] = []
  const blocked = new Set<string>()
  const owned = new Set<string>()
  // Una carpeta del proyecto puede ser un enlace: nunca escribimos a través de él.
  const hasLink = async (rel: string): Promise<boolean> => {
    const parts = rel.split('/')
    for (let i = 1; i <= parts.length; i++) {
      if (await lstat(join(dir, ...parts.slice(0, i))).then((s) => s.isSymbolicLink(), () => false)) return true
    }
    return false
  }
  for (const rel of Object.keys(files)) {
    const folder = /^\.claude\/skills\/[^/]+/.exec(rel)?.[0]
    if (!folder || blocked.has(folder)) continue
    if (await hasLink(rel)) { blocked.add(folder); kept.push(folder); continue }
    if (owned.has(folder)) continue
    const existing = await lstat(join(dir, folder)).catch(() => undefined)
    if (!existing) continue
    const marker = await lstat(join(dir, folder, '.orquest-bundled')).catch(() => undefined)
    if (!existing.isSymbolicLink() && marker?.isFile()) owned.add(folder)
    else { blocked.add(folder); kept.push(folder) }
  }
  for (const [rel, content] of Object.entries(files)) {
    const folder = /^\.claude\/skills\/[^/]+/.exec(rel)?.[0]
    if (folder && blocked.has(folder)) continue
    const path = join(dir, rel)
    const mine = folder && owned.has(folder) ? true : await readFile(path).then((t) => t.equals(Buffer.from(content)), () => undefined)
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
  // Sin recortar el principio: el primer renglón empieza con espacio (« M api.ts») y, recortado, perdía la primera letra del archivo.
  await git(office.path, 'rev-parse', '--git-dir')
  const { stdout } = await run('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: office.path })
  return stdout
    .split(/\r?\n/)
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

export interface WorktreeInfo {
  path: string
  /** Commit en que está. */
  head: string
  /** Rama que tiene sacada (sin `refs/heads/`); sin ella está en un commit suelto. */
  branch?: string
  bare?: boolean
  locked?: boolean
  /** Git la sigue apuntando pero su carpeta ya no está. */
  prunable?: boolean
}

/** Pasa la salida de `git worktree list --porcelain` a una lista. */
export function parseWorktrees(out: string): WorktreeInfo[] {
  const list: WorktreeInfo[] = []
  for (const block of out.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter(Boolean)
    const path = lines.find((l) => l.startsWith('worktree '))?.slice('worktree '.length)
    if (!path) continue
    const w: WorktreeInfo = { path, head: lines.find((l) => l.startsWith('HEAD '))?.slice(5) ?? '' }
    const branch = lines.find((l) => l.startsWith('branch '))?.slice('branch '.length)
    if (branch) w.branch = branch.replace(/^refs\/heads\//, '')
    if (lines.includes('bare')) w.bare = true
    if (lines.some((l) => l === 'locked' || l.startsWith('locked '))) w.locked = true
    if (lines.some((l) => l === 'prunable' || l.startsWith('prunable '))) w.prunable = true
    list.push(w)
  }
  return list
}

/** Todas las copias de trabajo (worktrees) del repositorio de `repo`, las haya hecho Orquest o no. La primera es la principal. */
export async function listWorktrees(repo: string): Promise<WorktreeInfo[]> {
  return parseWorktrees(await git(repo, 'worktree', 'list', '--porcelain'))
}

/** Cuántos commits lleva `branch` que `base` no tiene (adelante) y al revés (atrás). */
export async function aheadBehind(repo: string, base: string, branch: string): Promise<{ ahead: number; behind: number } | undefined> {
  const out = await git(repo, 'rev-list', '--left-right', '--count', `${base}...${branch}`).catch(() => '')
  const [behind, ahead] = out.split(/\s+/).map(Number)
  return out ? { ahead: ahead || 0, behind: behind || 0 } : undefined
}

/** Cuántos archivos tiene sin commit una copia de trabajo (también los nuevos). */
export async function dirtyCount(path: string): Promise<number> {
  return (await git(path, 'status', '--porcelain', '--untracked-files=all')).split('\n').filter(Boolean).length
}

/**
 * Cuánto pesa una carpeta en disco, contando todo (también lo que git ignora:
 * dependencias, compilados). Recorre con E/S asíncrona y de a poco, para no
 * trabar la app; no sigue enlaces. Lo que no se puede leer no cuenta.
 */
export async function diskSize(dir: string, opts: { concurrency?: number } = {}): Promise<number> {
  const pending = [dir]
  let total = 0
  const limit = opts.concurrency ?? 16
  const worker = async () => {
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      const entries = await readdir(next, { withFileTypes: true }).catch(() => [])
      for (const e of entries) {
        const full = join(next, e.name)
        if (e.isDirectory()) pending.push(full)
        else if (!e.isSymbolicLink()) total += await lstat(full).then((s) => s.size, () => 0)
      }
    }
  }
  // Varios recorriendo a la vez; cuando uno se queda sin carpetas, los demás pueden seguir sumando.
  for (;;) {
    const before = pending.length
    if (!before) break
    await Promise.all(Array.from({ length: Math.min(limit, before) }, worker))
  }
  return total
}

export type MergeResult ={ ok: true; commit: string } | { ok: false; conflicts: string[]; reason: string }

/** Ramas locales del repositorio y cuál está abierta en su carpeta. */
export async function listBranches(repo: string): Promise<{ branches: string[]; current: string }> {
  const root = await repoRoot(repo)
  const out = await git(root, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/')
  const current = await git(root, 'rev-parse', '--abbrev-ref', 'HEAD').catch(() => '')
  return { branches: out.split('\n').filter(Boolean), current }
}

/** true si la rama existe en el repositorio. */
export async function branchExists(repo: string, branch: string): Promise<boolean> {
  return git(repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`).then(() => true, () => false)
}

/** En qué carpeta está abierta una rama (la del proyecto o un worktree); undefined si en ninguna. */
async function checkedOutAt(root: string, branch: string): Promise<string | undefined> {
  const out = await git(root, 'worktree', 'list', '--porcelain')
  let path: string | undefined
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) path = line.slice(9)
    else if (line === `branch refs/heads/${branch}` && path) return path
  }
  return undefined
}

/**
 * Archivos que toca una rama respecto de la rama de la que salió: lo que ya
 * tiene en commits más lo que hay sin guardar en su carpeta. Sirve para ver si
 * dos tareas se pisan.
 */
export async function branchFiles(office: Office, base: string): Promise<string[]> {
  const fork = await git(office.path, 'merge-base', base, 'HEAD').catch(() => office.base ?? '')
  const committed = fork ? (await git(office.path, 'diff', '--name-only', fork, 'HEAD').catch(() => '')).split('\n') : []
  const pending = (await officeChanges(office).catch(() => [])).map((c) => c.path.replace(/^.* -> /, ''))
  return [...new Set([...committed, ...pending].filter(Boolean))]
}

/**
 * Integra `source` en `target` con merge `--no-ff`, aunque `target` no sea la
 * rama abierta en la carpeta del proyecto: se integra donde esté abierta (si
 * está limpia) o, si no está abierta en ninguna, en una carpeta de paso que se
 * quita al terminar. `before` corre con la integración a medias, antes del
 * commit (p. ej. para anotar el registro de cambios) y devuelve los archivos
 * que tocó, que entran en el mismo commit. Si hay conflicto, aborta y no deja
 * nada a medias.
 */
export async function mergeInto(repo: string, target: string, source: string, message: string, before?: (dir: string) => Promise<string[]>): Promise<MergeResult> {
  const root = await repoRoot(repo)
  let dir = await checkedOutAt(root, target)
  let temp = false
  if (dir) {
    const dirty = await git(dir, 'status', '--porcelain', '--untracked-files=no')
    if (dirty) return { ok: false, conflicts: [], reason: T`La rama ${target} tiene cambios sin commit en ${dir}; guárdalos antes de integrar.` }
  } else {
    await excludeOrquest(root)
    dir = join(root, '.orquest', 'integrar', `${target.replace(/[^\w.-]+/g, '-')}-${Date.now().toString(36)}`)
    await mkdir(dirname(dir), { recursive: true })
    await git(root, 'worktree', 'add', dir, target)
    temp = true
  }
  const as = ['-c', 'user.name=Orquest', '-c', 'user.email=orquest@localhost']
  try {
    try {
      await run('git', [...as, 'merge', '--no-ff', '--no-commit', source], { cwd: dir })
    } catch {
      const conflicts = (await git(dir, 'diff', '--name-only', '--diff-filter=U').catch(() => '')).split('\n').filter(Boolean)
      await git(dir, 'merge', '--abort').catch(() => {})
      return {
        ok: false,
        conflicts,
        reason: conflicts.length ? T`Conflicto al integrar ${source} en ${target}: ${conflicts.join(', ')}.` : T`Conflicto al integrar ${source} en ${target}.`,
      }
    }
    // Sin MERGE_HEAD no hubo nada que unir: la rama ya estaba en la de destino.
    const merging = await git(dir, 'rev-parse', '--verify', '--quiet', 'MERGE_HEAD').then(() => true, () => false)
    if (!merging) return { ok: false, conflicts: [], reason: T`${source} no trae nada que ${target} no tenga.` }
    try {
      const touched = before ? await before(dir) : []
      if (touched.length) await git(dir, 'add', '--', ...touched)
      await run('git', [...as, 'commit', '-q', '--no-verify', '-m', message], { cwd: dir })
    } catch (err) {
      await git(dir, 'merge', '--abort').catch(() => {})
      return { ok: false, conflicts: [], reason: (err as Error).message }
    }
    return { ok: true, commit: await git(dir, 'rev-parse', 'HEAD') }
  } finally {
    if (temp) await removeOffice(root, { path: dir }, true).catch(() => {})
  }
}

/** Borra una rama local (la de una tarea cerrada). */
export async function deleteBranch(repo: string, branch: string): Promise<void> {
  await git(await repoRoot(repo), 'branch', '-D', branch)
}

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

/** Desde dónde se mide una rama: donde se separó de `base` (o el commit del que partió su oficina). */
async function forkOf(office: Office, base: string): Promise<string> {
  return git(office.path, 'merge-base', base, 'HEAD').catch(() => office.base ?? 'HEAD')
}

/**
 * Lo que una rama cambia respecto de la rama de la que salió: lo que ya tiene en commits y lo que
 * hay sin guardar en su carpeta, con líneas agregadas y quitadas por archivo.
 */
export async function branchChanges(office: Office, base: string): Promise<(FileChange & { added: number; removed: number })[]> {
  const fork = await forkOf(office, base)
  const { stdout: numstat } = await run('git', ['diff', '--numstat', fork], { cwd: office.path })
  const { stdout: names } = await run('git', ['diff', '--name-status', fork], { cwd: office.path })
  const status = new Map(names.split(/\r?\n/).filter(Boolean).map((l) => { const [s, ...p] = l.split('\t'); return [p.at(-1)!, s[0]] as const }))
  const out = numstat.split(/\r?\n/).filter(Boolean).map((l) => {
    const [a, r, ...p] = l.split('\t')
    const path = p.join('\t').replace(/^.*\{.* => (.*)\}.*$/, '$1')
    return { status: status.get(path) ?? 'M', path, added: Number(a) || 0, removed: Number(r) || 0 }
  })
  // Los archivos nuevos que todavía no están en git no salen en el diff.
  for (const c of await officeChanges(office)) {
    if (c.status !== '??') continue
    const text = await readFile(join(office.path, c.path), 'utf8').catch(() => '')
    out.push({ status: 'A', path: c.path, added: text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0, removed: 0 })
  }
  return out
}

/** El diff de una rama (o de uno de sus archivos) contra la rama de la que salió, con lo no guardado. */
export async function branchDiff(office: Office, base: string, path?: string): Promise<string> {
  const fork = await forkOf(office, base)
  const tracked = (await run('git', ['diff', fork, ...(path ? ['--', path] : [])], { cwd: office.path })).stdout
  const untracked = (await officeChanges(office)).filter((c) => c.status === '??' && (!path || c.path === path))
  const extra = await Promise.all(untracked.map((c) => officeDiff(office, c.path)))
  return [tracked.trimEnd(), ...extra].filter(Boolean).join('\n')
}
