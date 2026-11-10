/**
 * El historial de un repositorio para el panel Historial: el grafo de commits
 * con sus carriles (como GitKraken), las integraciones a la rama actual (las de
 * Orquest son merges `--no-ff` con autor Orquest) y revertir una de ellas sin
 * reescribir la historia (`git revert -m 1`). Solo lee git, salvo al revertir.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { RuleError } from './board.js'
import { T } from './i18n.js'
import type { GraphRow } from './graph.js'

export { graphLanes, type GraphRow } from './graph.js'

const run = promisify(execFile)

/** Una salida grande (un diff entero) no debe tumbar la lectura: hasta 32 MB. */
const MAX_BUFFER = 32 * 1024 * 1024

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd, maxBuffer: MAX_BUFFER })
  return stdout.replace(/\s+$/, '')
}

/** Separadores que no salen en un mensaje de commit. */
const FIELD = '\x1f'
const RECORD = '\x1e'

/** Autor de los commits que hace Orquest (merges de integración, entregas, reversiones). */
export const ORQUEST_EMAIL = 'orquest@localhost'

export interface Commit {
  sha: string
  parents: string[]
  author: string
  email: string
  /** Fecha del commit, en ms. */
  at: number
  subject: string
  /** Ramas que apuntan aquí (sin `refs/heads/`). */
  branches: string[]
  /** Si es la punta de la rama actual. */
  head: boolean
}

/** Los commits de las ramas locales, del más nuevo al más viejo, con la rama actual al frente. */
export async function readCommits(repo: string, limit = 300): Promise<Commit[]> {
  const head = await git(repo, 'rev-parse', '--verify', '--quiet', 'HEAD').catch(() => '')
  if (!head) return []
  const out = await git(
    repo,
    'log',
    'HEAD',
    '--branches',
    '--topo-order',
    `-n${limit}`,
    '--decorate=full',
    `--format=${RECORD}%H${FIELD}%P${FIELD}%an${FIELD}%ae${FIELD}%ct${FIELD}%s${FIELD}%D`,
  )
  return out
    .split(RECORD)
    .filter((r) => r.trim())
    .map((r) => {
      const [sha, parents, author, email, at, subject, refs] = r.replace(/\n$/, '').split(FIELD)
      const names = (refs ?? '').split(', ').map((x) => x.replace(/^HEAD -> /, '').trim())
      return {
        sha,
        parents: parents ? parents.split(' ') : [],
        author,
        email,
        at: Number(at) * 1000,
        subject,
        branches: names.filter((n) => n.startsWith('refs/heads/')).map((n) => n.slice('refs/heads/'.length)),
        head: sha === head,
      }
    })
}

export interface Integration {
  /** El commit de merge en la rama actual. */
  sha: string
  at: number
  /** Asunto del merge. */
  subject: string
  /** Lo que se unió, como se lee: el título de la tarea o el asunto sin «Merge branch…». */
  title: string
  /** La rama que se unió, si se sabe. */
  branch?: string
  /** La rama a la que se unió: la actual. */
  target: string
  author: string
  /** La hizo Orquest al integrar una entrega (merge `--no-ff` con su autor). */
  orquest: boolean
  /** Tarea de Orquest (T3) y su responsable, si el asunto los trae. */
  task?: string
  assignee?: string
  /** Número de PR/MR si el asunto lo dice (merge hecho en GitHub o GitLab). */
  pr?: number
  files: number
  added: number
  removed: number
  /** El commit que la revirtió, si ya se revirtió. */
  revertedBy?: string
}

/** Lo que se lee del asunto de un merge: tarea de Orquest, PR de GitHub/GitLab o rama. */
export function parseMergeSubject(subject: string): { title: string; task?: string; assignee?: string; branch?: string; pr?: number } {
  // Orquest: «T3: Título (lupita-backend)».
  const ours = /^(T\d+): (.*) \(([^()]+)\)$/.exec(subject)
  if (ours) return { title: ours[2], task: ours[1], assignee: ours[3] }
  // GitHub: «Merge pull request #12 from usuario/rama».
  const gh = /^Merge pull request #(\d+) from [^/\s]+\/(\S+)/.exec(subject)
  if (gh) return { title: subject, pr: Number(gh[1]), branch: gh[2] }
  // GitLab: «Merge branch 'rama' into 'main'» (y el número viene en el cuerpo, «See merge request x!12»).
  const branch = /^Merge (?:remote-tracking )?branch '([^']+)'/.exec(subject)
  if (branch) return { title: subject, branch: branch[1].replace(/^origin\//, '') }
  return { title: subject }
}

/** Una rama local cuyo nombre es el que trae `name-rev` sin su `~3`/`^2`. */
const cleanRev = (name: string) => name.replace(/[~^].*$/, '')

/**
 * Las integraciones a la rama actual: los merges de su línea principal
 * (`--first-parent`), el más nuevo primero, con lo que cambiaron contra lo que
 * había antes en la rama y si ya se revirtieron.
 */
export async function readIntegrations(repo: string, limit = 100): Promise<Integration[]> {
  const target = await git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').catch(() => '')
  if (!target) return []
  // `-m --first-parent` da los cambios de cada merge contra su primer padre: lo que trajo a la rama.
  const out = await git(
    repo,
    'log',
    'HEAD',
    '--first-parent',
    '--merges',
    '-m',
    '--numstat',
    `-n${limit}`,
    `--format=${RECORD}%H${FIELD}%P${FIELD}%an${FIELD}%ae${FIELD}%ct${FIELD}%s${FIELD}%b${FIELD}`,
  ).catch(() => '')
  const list: (Integration & { second?: string })[] = []
  for (const record of out.split(RECORD).filter((r) => r.trim())) {
    const [sha, parents, author, email, at, subject, body, stat] = record.split(FIELD)
    const parsed = parseMergeSubject(subject)
    const mr = /See merge request \S*!(\d+)/.exec(body ?? '')
    let files = 0
    let added = 0
    let removed = 0
    for (const line of (stat ?? '').split('\n')) {
      const m = /^(\d+|-)\t(\d+|-)\t/.exec(line)
      if (!m) continue
      files++
      added += Number(m[1]) || 0
      removed += Number(m[2]) || 0
    }
    list.push({
      sha,
      second: parents.split(' ')[1],
      at: Number(at) * 1000,
      subject,
      title: parsed.title,
      ...(parsed.task ? { task: parsed.task, assignee: parsed.assignee } : {}),
      ...(parsed.branch ? { branch: parsed.branch } : {}),
      ...(parsed.pr ? { pr: parsed.pr } : mr ? { pr: Number(mr[1]) } : {}),
      target,
      author,
      orquest: email === ORQUEST_EMAIL,
      files,
      added,
      removed,
    })
  }
  // La rama que se unió, cuando el asunto no la dice: la que todavía contiene su segundo padre.
  const unknown = list.filter((i) => !i.branch && i.second)
  if (unknown.length) {
    const names = await git(repo, 'name-rev', '--name-only', '--refs=refs/heads/*', `--exclude=refs/heads/${target}`, ...unknown.map((i) => i.second!)).catch(() => '')
    names.split('\n').forEach((n, k) => {
      const name = cleanRev(n.trim())
      if (name && name !== 'undefined' && unknown[k]) unknown[k].branch = name
    })
  }
  const reverts = await revertedMerges(repo)
  return list.map(({ second: _, ...i }) => (reverts[i.sha] ? { ...i, revertedBy: reverts[i.sha] } : i))
}

/** Qué merges ya se revirtieron en la rama actual: sha del merge → sha de la reversión. */
async function revertedMerges(repo: string): Promise<Record<string, string>> {
  const out = await git(repo, 'log', 'HEAD', '--grep=This reverts commit', `--format=${RECORD}%H${FIELD}%b`).catch(() => '')
  const found: Record<string, string> = {}
  for (const record of out.split(RECORD).filter((r) => r.trim())) {
    const [sha, body] = record.split(FIELD)
    const m = /This reverts commit ([0-9a-f]{7,40})/.exec(body ?? '')
    if (m) found[m[1]] = sha
  }
  // Un revert que a su vez se revirtió vuelve a dejar el merge en pie.
  for (const [merge, revert] of Object.entries(found)) if (found[revert]) delete found[merge]
  return found
}

export interface CommitFile {
  /** A, M, D, R… como lo dice git. */
  status: string
  path: string
  added: number
  removed: number
}

/** El árbol vacío de git: contra él se mide el primer commit de un repositorio. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/** Contra qué se mide un commit: su primer padre o, si es el primero del repo, el árbol vacío. */
async function parentOf(repo: string, sha: string): Promise<string> {
  const parent = await git(repo, 'rev-parse', '--verify', '--quiet', `${sha}^1`).catch(() => '')
  return parent || EMPTY_TREE
}

/** Revisa que `sha` sea un commit de este repositorio (lo que llega de la interfaz no se pasa tal cual a git). */
async function verified(repo: string, sha: string): Promise<string> {
  if (!/^[0-9a-f]{4,40}$/i.test(sha)) throw new RuleError(T`${sha} no es un commit.`)
  const full = await git(repo, 'rev-parse', '--verify', '--quiet', `${sha}^{commit}`).catch(() => '')
  if (!full) throw new RuleError(T`El commit ${sha.slice(0, 7)} no está en este repositorio.`)
  return full
}

/** Los archivos que cambió un commit (un merge: contra su primer padre), con sus líneas. */
export async function commitFiles(repo: string, sha: string): Promise<CommitFile[]> {
  const full = await verified(repo, sha)
  const from = await parentOf(repo, full)
  const status = await git(repo, 'diff', '--name-status', '-M', from, full)
  const stat = await git(repo, 'diff', '--numstat', '-M', from, full)
  const lines = new Map<string, [number, number]>()
  for (const l of stat.split('\n')) {
    const m = /^(\d+|-)\t(\d+|-)\t(.*)$/.exec(l)
    // Renombrado: «a => b» o «dir/{a => b}»; se queda con el nombre nuevo.
    if (m) lines.set(m[3].replace(/\{[^}]* => ([^}]*)\}/, '$1').replace(/^.* => /, ''), [Number(m[1]) || 0, Number(m[2]) || 0])
  }
  return status
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const parts = l.split('\t')
      const path = parts[parts.length - 1]
      const [added, removed] = lines.get(path) ?? [0, 0]
      return { status: parts[0].charAt(0), path, added, removed }
    })
}

/** El diff de un commit (un merge: lo que trajo a su rama). */
export async function commitDiff(repo: string, sha: string): Promise<string> {
  const full = await verified(repo, sha)
  return git(repo, 'diff', '-M', await parentOf(repo, full), full)
}

/**
 * Revierte una integración: un commit nuevo que deshace lo que el merge trajo
 * (`git revert -m 1`); la historia no se reescribe. Solo merges de la rama
 * actual, con el repositorio limpio. Si choca con lo que vino después, aborta y
 * deja todo como estaba. Devuelve el commit de la reversión.
 */
export async function revertMerge(repo: string, sha: string): Promise<string> {
  const full = await verified(repo, sha)
  const parents = (await git(repo, 'rev-list', '--parents', '-n1', full)).split(' ').slice(1)
  if (parents.length < 2) throw new RuleError(T`${full.slice(0, 7)} no es una integración (merge): no hay rama que deshacer.`)
  const inBranch = await run('git', ['merge-base', '--is-ancestor', full, 'HEAD'], { cwd: repo }).then(() => true, () => false)
  if (!inBranch) throw new RuleError(T`${full.slice(0, 7)} no está en la rama actual: solo se revierte lo que se integró aquí.`)
  if ((await revertedMerges(repo))[full]) throw new RuleError(T`Esa integración ya se revirtió.`)
  const dirty = await git(repo, 'status', '--porcelain', '--untracked-files=no')
  if (dirty) throw new RuleError(T`El repositorio tiene cambios sin commit; guárdalos antes de revertir.`)
  try {
    await run('git', ['-c', 'user.name=Orquest', '-c', `user.email=${ORQUEST_EMAIL}`, 'revert', '--no-edit', '-m', '1', full], { cwd: repo })
  } catch {
    const conflicts = (await git(repo, 'diff', '--name-only', '--diff-filter=U').catch(() => '')).split('\n').filter(Boolean)
    await git(repo, 'revert', '--abort').catch(() => {})
    throw new RuleError(
      conflicts.length
        ? T`No se pudo revertir: choca con lo que se integró después en ${conflicts.join(', ')}. No se cambió nada.`
        : T`No se pudo revertir esa integración. No se cambió nada.`,
    )
  }
  return git(repo, 'rev-parse', 'HEAD')
}

// ── Lo que ve el panel Historial (lo arma `Studio`, que sabe de quién es cada rama) ──

/** Quién hizo una integración o trabaja en una rama, si es de la plantilla. */
export interface HistoryPerson {
  id: string
  name: string
  role?: string
  provider: string
  /** Ya no trabaja aquí. */
  gone?: boolean
}

export interface IntegrationView extends Integration {
  who?: HistoryPerson
  /** Si fue una tarea de trabajo o de QA, y el reporte con que se entregó. */
  taskKind?: string
  report?: string
}

export interface HistoryRow extends Commit {
  lane: GraphRow
  /** Es el commit que revirtió una integración. */
  reverts?: boolean
}

export interface HistoryView {
  /** Los repositorios del proyecto si agrupa varios (para el selector); vacío si es uno. */
  repos: string[]
  /** El repositorio que se muestra ('' si el proyecto es uno solo). */
  repo: string
  /** La rama actual: ahí se integra. */
  branch: string
  /** Cuántas columnas ocupa el grafo. */
  width: number
  rows: HistoryRow[]
  integrations: IntegrationView[]
  /** De quién es cada rama de Orquest que sale en el grafo. */
  owners: Record<string, Pick<HistoryPerson, 'id' | 'name' | 'provider'>>
}

/** Una copia de trabajo (worktree) del repositorio, para la pestaña Worktrees. */
export interface WorktreeRow {
  path: string
  head: string
  branch?: string
  /** La rama donde se integra (la actual del repositorio) y cuánto se separó de ella. */
  base: string
  ahead?: number
  behind?: number
  owner:
    | { kind: 'project' }
    | { kind: 'employee'; id: string; name: string; role: string; provider: string; gone: boolean; live: boolean }
    /** En `.orquest/oficinas` pero de nadie de la plantilla. */
    | { kind: 'orphan' }
    /** La hizo otra herramienta. */
    | { kind: 'foreign' }
  /** La tarea que lleva (o la última que llevó) su dueño. */
  task?: { id: string; title: string }
  /** Archivos sin commit; sin el dato si su carpeta ya no está. */
  files?: number
  /** Su agente está trabajando ahora mismo. */
  working: boolean
  /** Git la apunta pero su carpeta ya no existe. */
  missing?: boolean
  /** Se puede «Quitar y liberar»; si no, por qué. */
  canRelease: boolean
  releaseWhy?: string
}
