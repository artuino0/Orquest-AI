/**
 * Los PR de GitHub y los MR de GitLab de un repositorio, leídos con las CLIs
 * oficiales del usuario (`gh` y `glab`) y su sesión. Orquest no guarda ni lee
 * tokens: si la CLI no está o no tiene sesión, se dice y el historial sigue con
 * lo que hay en git. Las llamadas pasan por un `Runner` para poder simularlas.
 */
import { execFile } from 'node:child_process'
import { RuleError } from './board.js'
import { T } from './i18n.js'

export type Runner = (cmd: string, args: string[], cwd: string) => Promise<string>

/** Corre un comando y da su salida; si falla, el error trae `code` (ENOENT si no existe) y `stderr`. */
export const defaultRunner: Runner = (cmd, args, cwd) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout: 30_000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_PROMPT: '1', GLAB_NO_PROMPT: '1' } }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr ?? '') }))
      else resolve(String(stdout))
    })
  })

export type ForgeKind = 'github' | 'gitlab'

export interface PullRequest {
  number: number
  title: string
  state: 'open' | 'merged' | 'closed'
  /** Rama que propone y rama a la que va. */
  head: string
  base: string
  url: string
  /** El commit con que se integró en el servidor, si ya se integró. */
  mergeCommit?: string
  author?: string
  at: number
}

export interface ForgeStatus {
  /** Dónde vive el remoto `origin`; null si no hay o no es GitHub ni GitLab. */
  kind: ForgeKind | null
  /** La CLI que se usa con ese remoto. */
  cli?: 'gh' | 'glab'
  /** ok: hay sesión; no-cli: no está instalada; no-session: no inició sesión; no-remote: sin remoto conocido; error: otra falla. */
  state: 'ok' | 'no-cli' | 'no-session' | 'no-remote' | 'error'
  /** El remoto, para mostrarlo (sin credenciales). */
  remote?: string
  /** Por qué falló, si falló. */
  message?: string
  prs: PullRequest[]
}

const missing = (err: unknown) => (err as NodeJS.ErrnoException)?.code === 'ENOENT'
const reason = (err: unknown) => String((err as { stderr?: string }).stderr || (err as Error).message || err).trim().split('\n').slice(-1)[0]

/** El remoto origin sin usuario ni contraseña: lo que se puede mostrar. */
export function cleanRemote(url: string): string {
  return url.trim().replace(/\/\/[^@/]+@/, '//')
}

/** GitHub, GitLab o ninguno, según la dirección del remoto (también GitLab propio: lleva «gitlab» en el nombre). */
export function forgeOf(url: string): ForgeKind | null {
  const host = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)/i.exec(url.trim())?.[1]?.toLowerCase() ?? ''
  if (host === 'github.com' || host.endsWith('.github.com')) return 'github'
  if (host.includes('gitlab')) return 'gitlab'
  return null
}

/** Pasa lo que da `gh pr list --json` a la forma común. */
export function parseGhList(json: string): PullRequest[] {
  const list = JSON.parse(json || '[]') as {
    number: number
    title: string
    state: string
    headRefName: string
    baseRefName: string
    url: string
    mergeCommit?: { oid?: string } | null
    author?: { login?: string } | null
    createdAt?: string
  }[]
  return list.map((p) => ({
    number: p.number,
    title: p.title,
    state: p.state === 'MERGED' ? 'merged' : p.state === 'OPEN' ? 'open' : 'closed',
    head: p.headRefName,
    base: p.baseRefName,
    url: p.url,
    ...(p.mergeCommit?.oid ? { mergeCommit: p.mergeCommit.oid } : {}),
    ...(p.author?.login ? { author: p.author.login } : {}),
    at: p.createdAt ? Date.parse(p.createdAt) : 0,
  }))
}

/** Pasa lo que da `glab mr list --output json` a la forma común. */
export function parseGlabList(json: string): PullRequest[] {
  const list = JSON.parse(json || '[]') as {
    iid: number
    title: string
    state: string
    source_branch: string
    target_branch: string
    web_url: string
    merge_commit_sha?: string | null
    squash_commit_sha?: string | null
    author?: { username?: string } | null
    created_at?: string
  }[]
  return list.map((m) => ({
    number: m.iid,
    title: m.title,
    state: m.state === 'merged' ? 'merged' : m.state === 'opened' ? 'open' : 'closed',
    head: m.source_branch,
    base: m.target_branch,
    url: m.web_url,
    ...(m.merge_commit_sha || m.squash_commit_sha ? { mergeCommit: (m.merge_commit_sha || m.squash_commit_sha)! } : {}),
    ...(m.author?.username ? { author: m.author.username } : {}),
    at: m.created_at ? Date.parse(m.created_at) : 0,
  }))
}

/** El remoto origin de un repositorio y a qué forja va. */
async function remoteOf(repo: string, run: Runner): Promise<{ url: string; kind: ForgeKind | null } | null> {
  const url = (await run('git', ['remote', 'get-url', 'origin'], repo).catch(() => '')).trim()
  return url ? { url, kind: forgeOf(url) } : null
}

/**
 * Lo que hay en GitHub o GitLab para este repositorio: si su CLI está, si tiene
 * sesión y los PR/MR más recientes (abiertos, integrados y cerrados).
 */
export async function forgeStatus(repo: string, run: Runner = defaultRunner, limit = 50): Promise<ForgeStatus> {
  const remote = await remoteOf(repo, run)
  if (!remote?.kind) return { kind: null, state: 'no-remote', ...(remote ? { remote: cleanRemote(remote.url) } : {}), prs: [] }
  const base = { kind: remote.kind, remote: cleanRemote(remote.url), cli: remote.kind === 'github' ? ('gh' as const) : ('glab' as const) }
  try {
    await run(base.cli, ['auth', 'status'], repo)
  } catch (err) {
    if (missing(err)) return { ...base, state: 'no-cli', prs: [] }
    return { ...base, state: 'no-session', message: reason(err), prs: [] }
  }
  try {
    const prs =
      base.cli === 'gh'
        ? parseGhList(await run('gh', ['pr', 'list', '--state', 'all', '--limit', String(limit), '--json', 'number,title,state,headRefName,baseRefName,url,mergeCommit,author,createdAt'], repo))
        : parseGlabList(await run('glab', ['mr', 'list', '--all', '--per-page', String(limit), '--output', 'json'], repo))
    return { ...base, state: 'ok', prs }
  } catch (err) {
    return { ...base, state: 'error', message: reason(err), prs: [] }
  }
}

/**
 * Abre un PR (GitHub) o MR (GitLab) de `branch` hacia `base`. Antes sube la
 * rama a origin, que es de donde lo lee el servidor. Devuelve su dirección.
 */
export async function createPullRequest(repo: string, req: { branch: string; base: string; title: string; body: string }, run: Runner = defaultRunner): Promise<string> {
  const remote = await remoteOf(repo, run)
  if (!remote?.kind) throw new RuleError(T`Este repositorio no tiene un remoto origin en GitHub ni en GitLab.`)
  const cli = remote.kind === 'github' ? 'gh' : 'glab'
  const exists = await run('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${req.branch}`], repo).then(() => true, () => false)
  if (!exists) throw new RuleError(T`La rama ${req.branch} ya no existe en este repositorio: no hay de dónde abrir el PR.`)
  try {
    await run('git', ['push', '-u', 'origin', `refs/heads/${req.branch}:refs/heads/${req.branch}`], repo)
  } catch (err) {
    throw new RuleError(T`No se pudo subir la rama ${req.branch} a origin: ${reason(err)}`)
  }
  const args =
    cli === 'gh'
      ? ['pr', 'create', '--head', req.branch, '--base', req.base, '--title', req.title, '--body', req.body]
      : ['mr', 'create', '--source-branch', req.branch, '--target-branch', req.base, '--title', req.title, '--description', req.body, '--yes']
  let out: string
  try {
    out = await run(cli, args, repo)
  } catch (err) {
    if (missing(err)) throw new RuleError(cli === 'gh' ? T`No se encontró gh (la CLI de GitHub). Instálala e inicia sesión con gh auth login.` : T`No se encontró glab (la CLI de GitLab). Instálala e inicia sesión con glab auth login.`)
    throw new RuleError(T`${cli} no pudo abrirlo: ${reason(err)}`)
  }
  const urls = out.match(/https?:\/\/\S+/g)
  return urls?.[urls.length - 1] ?? out.trim()
}
