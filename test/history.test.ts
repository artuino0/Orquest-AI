import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RuleError } from '../src/core/board.js'
import { EmployeeManager, type Spawner } from '../src/core/employees.js'
import { cleanRemote, createPullRequest, forgeOf, forgeStatus, parseGhList, parseGlabList, type Runner } from '../src/core/forge.js'
import { commitDiff, commitFiles, graphLanes, parseMergeSubject, readCommits, readIntegrations, revertMerge } from '../src/core/history.js'
import { Studio } from '../src/core/studio.js'
import { commitDelivery, createOffice, diskSize, listWorktrees, mergeOffice, parseWorktrees } from '../src/core/worktree.js'

/**
 * El panel Historial: el grafo con sus carriles, las integraciones (las de
 * Orquest y las de fuera), revertir una sin reescribir la historia, los PR con
 * `gh`/`glab` simulados y las copias de trabajo, también las que no hizo Orquest.
 */

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })))

const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()

function makeRepo() {
  const repo = realpathSync.native(mkdtempSync(join(tmpdir(), 'orquest-historial-')))
  dirs.push(repo)
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 'yo@ejemplo.dev')
  git(repo, 'config', 'user.name', 'Yo')
  git(repo, 'config', 'core.autocrlf', 'false')
  writeFileSync(join(repo, 'README.md'), '# tienda\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'inicio')
  return repo
}

/** Una entrega de Orquest integrada como lo hace el estudio: oficina, commit de entrega y merge --no-ff. */
async function orquestDelivery(repo: string, id: string, file: string, task: string, title: string) {
  const office = await createOffice(repo, id)
  writeFileSync(join(office.path, file), `${title}\n`)
  await commitDelivery(office, `${task}: ${title}`)
  const merged = await mergeOffice(repo, office, `${task}: ${title} (${id})`)
  if (!merged.ok) throw new Error(merged.reason)
  return { office, commit: merged.commit }
}

describe('carriles del grafo', () => {
  it('una sola rama es una línea en la columna 0', () => {
    const { rows, width } = graphLanes([
      { sha: 'c', parents: ['b'] },
      { sha: 'b', parents: ['a'] },
      { sha: 'a', parents: [] },
    ], 'c')
    expect(width).toBe(1)
    expect(rows.map((r) => r.col)).toEqual([0, 0, 0])
    expect(rows[0]).toMatchObject({ top: true, bottom: true, through: [], ins: [], outs: [] })
    expect(rows[2]).toMatchObject({ bottom: false })
  })

  it('un merge abre un carril para la rama y se junta donde se separó', () => {
    // m une a f (rama) con b (principal); f y b salen de a.
    const { rows, width } = graphLanes([
      { sha: 'm', parents: ['b', 'f'] },
      { sha: 'f', parents: ['a'] },
      { sha: 'b', parents: ['a'] },
      { sha: 'a', parents: [] },
    ], 'm')
    expect(width).toBe(2)
    expect(rows[0]).toMatchObject({ col: 0, outs: [1] })
    expect(rows[1]).toMatchObject({ col: 1, top: true, through: [0] })
    // b sigue en la principal y la rama (que ahora espera a «a») pasa a su lado.
    expect(rows[2]).toMatchObject({ col: 0, through: [1] })
    // En «a» se junta la rama.
    expect(rows[3]).toMatchObject({ col: 0, ins: [1], through: [] })
  })

  it('una rama que aún no se integra toma su propio carril y la principal sigue en la 0', () => {
    const { rows } = graphLanes([
      { sha: 'x', parents: ['a'] }, // punta de una rama sin integrar, más nueva que la principal
      { sha: 'b', parents: ['a'] }, // punta de la principal
      { sha: 'a', parents: [] },
    ], 'b')
    expect(rows[0].col).toBe(1)
    expect(rows[0].top).toBe(false)
    expect(rows[1]).toMatchObject({ col: 0, top: true, through: [1] })
    expect(rows[2]).toMatchObject({ col: 0, ins: [1] })
  })

  it('un padre que otra columna ya espera no abre carril nuevo', () => {
    const { rows, width } = graphLanes([
      { sha: 'm2', parents: ['m1', 'f'] },
      { sha: 'm1', parents: ['a', 'f'] },
      { sha: 'f', parents: ['a'] },
      { sha: 'a', parents: [] },
    ], 'm2')
    expect(rows[1]).toMatchObject({ col: 0, outs: [1] })
    expect(width).toBe(2)
  })
})

describe('asunto de un merge', () => {
  it('reconoce los de Orquest, GitHub y GitLab', () => {
    expect(parseMergeSubject('T3: Botón de Estudio (lupita-backend)')).toEqual({ title: 'Botón de Estudio', task: 'T3', assignee: 'lupita-backend' })
    expect(parseMergeSubject('Merge pull request #12 from artuino0/fix/boton')).toEqual({ title: 'Merge pull request #12 from artuino0/fix/boton', pr: 12, branch: 'fix/boton' })
    expect(parseMergeSubject("Merge branch 'feat/csv' into 'main'")).toMatchObject({ branch: 'feat/csv' })
    expect(parseMergeSubject('Arreglo suelto')).toEqual({ title: 'Arreglo suelto' })
  })
})

describe('historial de git', () => {
  it('lee las integraciones de Orquest y las de fuera, con sus cambios', async () => {
    const repo = makeRepo()
    await orquestDelivery(repo, 'lupita-backend', 'api.ts', 'T1', 'API de productos')
    // Un merge hecho a mano por el usuario, de una rama suya.
    git(repo, 'checkout', '-qb', 'feat/csv')
    writeFileSync(join(repo, 'csv.ts'), 'uno\ndos\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'Exportar a CSV')
    git(repo, 'checkout', '-q', 'main')
    git(repo, 'merge', '-q', '--no-ff', '-m', 'Unir exportación', 'feat/csv')

    const list = await readIntegrations(repo)
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ title: 'Unir exportación', branch: 'feat/csv', target: 'main', orquest: false, author: 'Yo', files: 1, added: 2, removed: 0 })
    expect(list[1]).toMatchObject({ title: 'API de productos', task: 'T1', assignee: 'lupita-backend', orquest: true, target: 'main', files: 1, added: 1 })

    const commits = await readCommits(repo)
    expect(commits[0]).toMatchObject({ head: true, subject: 'Unir exportación' })
    expect(commits.find((c) => c.subject === 'Exportar a CSV')?.branches).toContain('feat/csv')
    expect(commits.some((c) => c.branches.includes('orquest/lupita-backend'))).toBe(true)

    // Lo que trajo la integración: archivos y diff contra la rama antes de unirla.
    expect(await commitFiles(repo, list[1].sha)).toEqual([{ status: 'A', path: 'api.ts', added: 1, removed: 0 }])
    expect(await commitDiff(repo, list[1].sha)).toContain('+API de productos')
    // El primer commit se mide contra el árbol vacío.
    expect((await commitFiles(repo, commits[commits.length - 1].sha)).map((f) => f.path)).toEqual(['README.md'])
    await expect(commitDiff(repo, 'zzz')).rejects.toBeInstanceOf(RuleError)
  })

  it('revierte una integración con un commit nuevo, sin reescribir la historia', async () => {
    const repo = makeRepo()
    const { commit } = await orquestDelivery(repo, 'lupita-backend', 'api.ts', 'T1', 'API de productos')
    const before = git(repo, 'rev-list', '--count', 'HEAD')
    const revert = await revertMerge(repo, commit)
    expect(existsSync(join(repo, 'api.ts'))).toBe(false)
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(revert)
    expect(Number(git(repo, 'rev-list', '--count', 'HEAD'))).toBe(Number(before) + 1)
    expect(git(repo, 'log', '-1', '--format=%ae')).toBe('orquest@localhost')
    const [integration] = await readIntegrations(repo)
    expect(integration.revertedBy).toBe(revert)
    // Dos veces no.
    await expect(revertMerge(repo, commit)).rejects.toThrow('ya se revirtió')
    // Lo que no es merge, tampoco.
    await expect(revertMerge(repo, git(repo, 'rev-list', '--max-parents=0', 'HEAD'))).rejects.toThrow('no es una integración')
  })

  it('no revierte con cambios sin guardar, y si choca no cambia nada', async () => {
    const repo = makeRepo()
    const { commit } = await orquestDelivery(repo, 'lupita-backend', 'api.ts', 'T1', 'API de productos')
    writeFileSync(join(repo, 'README.md'), '# cambiado\n')
    await expect(revertMerge(repo, commit)).rejects.toThrow('cambios sin commit')
    git(repo, 'checkout', '--', 'README.md')
    // Después de integrarla, alguien cambió la misma línea: deshacerla choca.
    writeFileSync(join(repo, 'api.ts'), 'API de productos v2\n')
    git(repo, 'commit', '-qam', 'v2')
    const head = git(repo, 'rev-parse', 'HEAD')
    const err = await revertMerge(repo, commit).catch((e) => e)
    expect(err).toBeInstanceOf(RuleError)
    expect(err.message).toContain('api.ts')
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(head)
    expect(git(repo, 'status', '--porcelain')).toBe('')
  })
})

describe('copias de trabajo', () => {
  it('lee la lista de git, también las que no son de Orquest', async () => {
    const repo = makeRepo()
    await createOffice(repo, 'ana-qa')
    const other = join(repo, '..', `${repo.split(/[\\/]/).pop()}-otra`)
    dirs.push(other)
    git(repo, 'worktree', 'add', '-q', '-b', 'suya', other)
    const list = await listWorktrees(repo)
    // La principal va primero; las demás, en el orden que dé git.
    expect(list[0]).toMatchObject({ path: repo, branch: 'main' })
    expect(list.map((w) => w.branch).sort()).toEqual(['main', 'orquest/ana-qa', 'suya'])
    expect(parseWorktrees('worktree /a\nHEAD 1\nbranch refs/heads/x\n\nworktree /b\nHEAD 2\ndetached\nlocked razón\nprunable gitdir file points to non-existent location\n')).toEqual([
      { path: '/a', head: '1', branch: 'x' },
      { path: '/b', head: '2', locked: true, prunable: true },
    ])
  })

  it('suma lo que pesa una carpeta, con subcarpetas', async () => {
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'orquest-peso-')))
    dirs.push(dir)
    mkdirSync(join(dir, 'a', 'b'), { recursive: true })
    writeFileSync(join(dir, 'uno.txt'), 'x'.repeat(100))
    writeFileSync(join(dir, 'a', 'dos.txt'), 'x'.repeat(50))
    writeFileSync(join(dir, 'a', 'b', 'tres.txt'), 'x'.repeat(7))
    expect(await diskSize(dir, { concurrency: 2 })).toBe(157)
    expect(await diskSize(join(dir, 'no-existe'))).toBe(0)
  })
})

describe('GitHub y GitLab con sus CLIs', () => {
  it('reconoce la forja por el remoto y no muestra credenciales', () => {
    expect(forgeOf('git@github.com:artuino0/Orquest-AI.git')).toBe('github')
    expect(forgeOf('https://github.com/a/b')).toBe('github')
    expect(forgeOf('https://gitlab.com/a/b.git')).toBe('gitlab')
    expect(forgeOf('https://gitlab.miempresa.mx/a/b.git')).toBe('gitlab')
    expect(forgeOf('https://bitbucket.org/a/b')).toBeNull()
    expect(cleanRemote('https://usuario:secreto@github.com/a/b.git')).toBe('https://github.com/a/b.git')
  })

  it('pasa los PR de gh y los MR de glab a la misma forma', () => {
    expect(parseGhList(JSON.stringify([{ number: 12, title: 'Seed', state: 'MERGED', headRefName: 'feat/seed', baseRefName: 'main', url: 'https://github.com/a/b/pull/12', mergeCommit: { oid: 'abc' }, author: { login: 'ana' }, createdAt: '2026-01-02T00:00:00Z' }]))).toEqual([
      { number: 12, title: 'Seed', state: 'merged', head: 'feat/seed', base: 'main', url: 'https://github.com/a/b/pull/12', mergeCommit: 'abc', author: 'ana', at: Date.parse('2026-01-02T00:00:00Z') },
    ])
    expect(parseGlabList(JSON.stringify([{ iid: 4, title: 'CSV', state: 'opened', source_branch: 'feat/csv', target_branch: 'main', web_url: 'https://gitlab.com/a/b/-/merge_requests/4' }]))[0]).toMatchObject({ number: 4, state: 'open', head: 'feat/csv' })
  })

  /** Una forja de mentira: git de verdad, `gh`/`glab` según lo que se le diga, y anota lo que se le pidió. */
  function fakeForge(opts: { remote?: string; cli?: 'missing' | 'no-session' | 'ok'; list?: unknown[] }) {
    const calls: string[] = []
    const run: Runner = async (cmd, args, cwd) => {
      calls.push(`${cmd} ${args.join(' ')}`)
      if (cmd === 'git') {
        if (args[0] === 'remote') {
          if (!opts.remote) throw new Error('No such remote')
          return `${opts.remote}\n`
        }
        if (args[0] === 'push') return ''
        return execFileSync('git', args, { cwd, encoding: 'utf8' })
      }
      if (opts.cli === 'missing') throw Object.assign(new Error(`spawn ${cmd} ENOENT`), { code: 'ENOENT' })
      if (args[0] === 'auth') {
        if (opts.cli === 'no-session') throw Object.assign(new Error('falló'), { stderr: 'You are not logged into any GitHub hosts. Run gh auth login to authenticate.' })
        return ''
      }
      if (args.join(' ').startsWith('pr list')) return JSON.stringify(opts.list ?? [])
      if (args.join(' ').startsWith('pr create')) return 'Creating pull request…\nhttps://github.com/a/b/pull/13\n'
      if (args.join(' ').startsWith('mr create')) return 'https://gitlab.com/a/b/-/merge_requests/5\n'
      return ''
    }
    return { run, calls }
  }

  it('dice si la CLI no está, no tiene sesión o no hay remoto, y si hay, trae los PR', async () => {
    const repo = makeRepo()
    expect(await forgeStatus(repo, fakeForge({}).run)).toMatchObject({ kind: null, state: 'no-remote', prs: [] })
    expect(await forgeStatus(repo, fakeForge({ remote: 'https://bitbucket.org/a/b' }).run)).toMatchObject({ kind: null, state: 'no-remote' })
    expect(await forgeStatus(repo, fakeForge({ remote: 'git@github.com:a/b.git', cli: 'missing' }).run)).toMatchObject({ kind: 'github', cli: 'gh', state: 'no-cli' })
    const off = await forgeStatus(repo, fakeForge({ remote: 'git@github.com:a/b.git', cli: 'no-session' }).run)
    expect(off).toMatchObject({ state: 'no-session' })
    expect(off.message).toContain('gh auth login')
    const ok = await forgeStatus(repo, fakeForge({ remote: 'https://tok:en@github.com/a/b.git', cli: 'ok', list: [{ number: 1, title: 'x', state: 'OPEN', headRefName: 'h', baseRefName: 'main', url: 'u' }] }).run)
    expect(ok).toMatchObject({ kind: 'github', state: 'ok', remote: 'https://github.com/a/b.git' })
    expect(ok.prs).toHaveLength(1)
  })

  it('sube la rama y abre el PR o el MR', async () => {
    const repo = makeRepo()
    git(repo, 'branch', 'orquest/ana-qa')
    const gh = fakeForge({ remote: 'git@github.com:a/b.git', cli: 'ok' })
    expect(await createPullRequest(repo, { branch: 'orquest/ana-qa', base: 'main', title: 'T1: Algo', body: 'reporte' }, gh.run)).toBe('https://github.com/a/b/pull/13')
    expect(gh.calls).toContain('git push -u origin refs/heads/orquest/ana-qa:refs/heads/orquest/ana-qa')
    expect(gh.calls.find((c) => c.startsWith('gh pr create'))).toContain('--head orquest/ana-qa --base main')
    const gl = fakeForge({ remote: 'https://gitlab.com/a/b.git', cli: 'ok' })
    expect(await createPullRequest(repo, { branch: 'orquest/ana-qa', base: 'main', title: 'T1', body: '' }, gl.run)).toBe('https://gitlab.com/a/b/-/merge_requests/5')
    await expect(createPullRequest(repo, { branch: 'no-existe', base: 'main', title: 'x', body: '' }, gh.run)).rejects.toThrow('ya no existe')
    await expect(createPullRequest(repo, { branch: 'orquest/ana-qa', base: 'main', title: 'x', body: '' }, fakeForge({ remote: 'git@github.com:a/b.git', cli: 'missing' }).run)).rejects.toThrow('gh auth login')
  })
})

describe('el panel Historial a través del estudio', () => {
  const spawn: Spawner = () => ({ pid: 1, onData: () => {}, onExit: () => {}, write: () => {}, resize: () => {}, kill: () => {} })
  async function open(repo: string, runner?: Runner) {
    const manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    return new Studio({ repo, manager, detect: async () => [], mcpUrl: () => '', forgeRunner: runner }).init()
  }

  it('dice de quién es cada integración y cada copia, y quita solo la que no deja nada pendiente', async () => {
    const repo = makeRepo()
    const { office: lupita } = await orquestDelivery(repo, 'lupita-backend', 'api.ts', 'T1', 'API de productos')
    const beto = await createOffice(repo, 'beto-dba')
    writeFileSync(join(beto.path, 'sin-entregar.sql'), 'select 1\n')
    const other = join(repo, '..', `${repo.split(/[\\/]/).pop()}-otra`)
    dirs.push(other)
    git(repo, 'worktree', 'add', '-q', '-b', 'suya', other)

    const studio = await open(repo)
    studio.board.staff.push(
      { id: 'lupita-backend', name: 'Lupita', role: 'backend', provider: 'claude', online: false, gone: true, office: { path: lupita.path, branch: lupita.branch } },
      { id: 'beto-dba', name: 'Beto', role: 'dba', provider: 'codex', online: false, gone: true, office: { path: beto.path, branch: beto.branch } },
    )

    const view = await studio.history()
    expect(view.branch).toBe('main')
    expect(view.integrations[0]).toMatchObject({ task: 'T1', branch: 'orquest/lupita-backend', who: { id: 'lupita-backend', name: 'Lupita', gone: true } })
    expect(view.owners['orquest/lupita-backend']).toMatchObject({ name: 'Lupita' })
    expect(view.rows[0].lane.col).toBe(0)

    const rows = await studio.worktrees()
    const of = (kind: string, id?: string) => rows.find((r) => r.owner.kind === kind && (!id || ('id' in r.owner && r.owner.id === id)))!
    expect(of('project')).toMatchObject({ branch: 'main', canRelease: false })
    expect(of('foreign')).toMatchObject({ branch: 'suya', canRelease: false })
    expect(of('employee', 'beto-dba')).toMatchObject({ files: 1, canRelease: false })
    expect(of('employee', 'beto-dba').releaseWhy).toContain('1 archivo sin entregar')
    expect(of('employee', 'lupita-backend')).toMatchObject({ files: 0, ahead: 0, canRelease: true })

    await expect(studio.releaseWorktree(beto.path)).rejects.toThrow('sin entregar')
    await expect(studio.releaseWorktree(other)).rejects.toThrow('no es la oficina de nadie')
    await expect(studio.releaseWorktree(join(repo, 'cualquiera'))).rejects.toThrow('no es una copia de trabajo')
    await studio.releaseWorktree(lupita.path)
    expect(existsSync(lupita.path)).toBe(false)
    expect(git(repo, 'branch', '--list', 'orquest/lupita-backend')).toContain('orquest/lupita-backend')

    expect(await studio.worktreeSize(other)).toBeGreaterThan(0)
    studio.shutdown()
  })

  it('con varios repositorios, un grafo y unas copias por repositorio', async () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'orquest-historial-varios-')))
    dirs.push(root)
    for (const name of ['back', 'front']) {
      const dir = join(root, name)
      mkdirSync(dir)
      git(dir, 'init', '-q', '-b', 'main')
      git(dir, 'config', 'user.email', 'yo@ejemplo.dev')
      git(dir, 'config', 'user.name', 'Yo')
      writeFileSync(join(dir, `${name}.md`), `${name}\n`)
      git(dir, 'add', '.')
      git(dir, 'commit', '-qm', `inicio de ${name}`)
    }
    const manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    const studio = await new Studio({ repo: root, group: true, manager, detect: async () => [], mcpUrl: () => '' }).init()
    const front = await studio.history('front')
    expect(front).toMatchObject({ repos: ['back', 'front'], repo: 'front', branch: 'main' })
    expect(front.rows[0].subject).toBe('inicio de front')
    // Sin nombrarlo, el primero.
    expect((await studio.history()).repo).toBe('back')
    await expect(studio.history('movil')).rejects.toThrow('No existe el repositorio')
    expect((await studio.worktrees('front')).map((w) => w.owner.kind)).toEqual(['project'])
    studio.shutdown()
  })

  it('revierte por el estudio y avisa al jefe; abre el PR de una integración local', async () => {
    const repo = makeRepo()
    const { commit } = await orquestDelivery(repo, 'lupita-backend', 'api.ts', 'T1', 'API de productos')
    const calls: string[] = []
    const runner: Runner = async (cmd, args, cwd) => {
      calls.push(`${cmd} ${args.join(' ')}`)
      if (cmd === 'git' && args[0] === 'remote') return 'git@github.com:a/b.git\n'
      if (cmd === 'git' && args[0] === 'push') return ''
      if (cmd === 'git') return execFileSync('git', args, { cwd, encoding: 'utf8' })
      if (args[0] === 'auth') return ''
      if (args[0] === 'pr' && args[1] === 'list') return '[]'
      return 'https://github.com/a/b/pull/7\n'
    }
    const studio = await open(repo, runner)
    expect(await studio.createPullRequest(undefined, commit)).toBe('https://github.com/a/b/pull/7')
    expect(calls.find((c) => c.startsWith('gh pr create'))).toContain('--title T1: API de productos')

    const revert = await studio.revertIntegration(undefined, commit)
    expect((await studio.history()).integrations[0].revertedBy).toBe(revert)
    expect((await studio.history()).rows.find((r) => r.sha === revert)?.reverts).toBe(true)
    studio.shutdown()
  })
})
