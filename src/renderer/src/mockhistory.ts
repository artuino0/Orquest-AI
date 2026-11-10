/**
 * El panel Historial de mentira para la vista previa (`preview.html?proyecto=1`):
 * un grafo con integraciones de Orquest, una revertida y una rama sin integrar,
 * PR de GitHub como si `gh` tuviera sesión y copias de trabajo de todo tipo.
 * Revertir, abrir un PR y quitar una copia cambian los datos como lo haría git.
 */
import { graphLanes } from '../../core/graph'
import type { CommitFile, ForgeStatus, HistoryRow, HistoryView, IntegrationView, OrquestApi, WorktreeRow } from '../../shared/ipc'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

type Raw = Omit<HistoryRow, 'lane' | 'head'>

export function mockHistory(repo: string, diff: string): Partial<OrquestApi> {
  const now = Date.now()
  const orquest = { author: 'Orquest', email: 'orquest@localhost' }
  const yo = { author: 'Arturo', email: 'arturo@ejemplo.dev' }
  const commits: Raw[] = [
    { sha: 'a3f9c21d00000000000000000000000000000001', parents: ['b7e2d4400000000000000000000000000000002', 'c1d0e9f00000000000000000000000000000003'], ...orquest, at: now - 5 * MIN, subject: 'T7: Botón de Estudio se queda en «Consultando» (e1)', branches: ['main'] },
    { sha: 'c1d0e9f00000000000000000000000000000003', parents: ['b7e2d4400000000000000000000000000000002'], ...orquest, at: now - 20 * MIN, subject: 'Estudio: «Trazo no disponible» cuando la consulta falla', branches: ['orquest/e1'] },
    { sha: 'd4c3b2a00000000000000000000000000000004', parents: ['e5f6a7b00000000000000000000000000000006'], ...yo, at: now - 35 * MIN, subject: 'Exportar pedidos: columnas visibles', branches: ['feature/exportar-csv'] },
    { sha: 'b7e2d4400000000000000000000000000000002', parents: ['e5f6a7b00000000000000000000000000000006', 'f0a1b2c00000000000000000000000000000005'], ...orquest, at: now - DAY - 2 * HOUR, subject: 'T5: DV-02 Script de datos semilla (e2)', branches: [] },
    { sha: 'f0a1b2c00000000000000000000000000000005', parents: ['e5f6a7b00000000000000000000000000000006'], ...orquest, at: now - DAY - 3 * HOUR, subject: 'Seed idempotente con prefijo', branches: ['orquest/e2'] },
    { sha: 'e5f6a7b00000000000000000000000000000006', parents: ['a9b8c7d00000000000000000000000000000007'], ...orquest, at: now - 3 * DAY, subject: 'Revert "T4: Fecha en otra zona horaria (e3)"', branches: [] },
    { sha: 'a9b8c7d00000000000000000000000000000007', parents: ['90817260000000000000000000000000000000a', '1a2b3c400000000000000000000000000000008'], ...orquest, at: now - 3 * DAY - HOUR, subject: 'T4: Fecha en otra zona horaria (e3)', branches: [] },
    { sha: '1a2b3c400000000000000000000000000000008', parents: ['90817260000000000000000000000000000000a'], ...orquest, at: now - 3 * DAY - 2 * HOUR, subject: 'Fecha con zona horaria del navegador', branches: ['orquest/e3'] },
    { sha: '90817260000000000000000000000000000000a', parents: ['5f4e3d200000000000000000000000000000000b', '7c6b5a400000000000000000000000000000009'], ...orquest, at: now - 5 * DAY, subject: 'T3: BE-11 Modelo de sesiones (e1)', branches: [] },
    { sha: '7c6b5a400000000000000000000000000000009', parents: ['5f4e3d200000000000000000000000000000000b'], ...orquest, at: now - 5 * DAY - HOUR, subject: 'Sesiones con token y expiración', branches: [] },
    { sha: '5f4e3d200000000000000000000000000000000b', parents: [], ...yo, at: now - 9 * DAY, subject: 'Inicio de la tienda', branches: [] },
  ]
  const who = {
    e1: { id: 'e1', name: 'Lupita', role: 'backend', provider: 'claude' },
    e2: { id: 'e2', name: 'Beto', role: 'dba', provider: 'codex' },
    e3: { id: 'e3', name: 'Nico', role: 'frontend', provider: 'antigravity' },
  }
  const integrations: IntegrationView[] = [
    { sha: commits[0].sha, at: commits[0].at, subject: commits[0].subject, title: 'Botón de Estudio se queda en «Consultando»', branch: 'orquest/e1', target: 'main', author: 'Orquest', orquest: true, task: 'T7', assignee: 'e1', who: who.e1, taskKind: 'work', report: 'El botón vuelve a su estado si la consulta falla.', files: 4, added: 38, removed: 6 },
    { sha: commits[3].sha, at: commits[3].at, subject: commits[3].subject, title: 'DV-02 Script de datos semilla', branch: 'orquest/e2', target: 'main', author: 'Orquest', orquest: true, task: 'T5', assignee: 'e2', who: who.e2, taskKind: 'work', files: 2, added: 24, removed: 3 },
    { sha: commits[6].sha, at: commits[6].at, subject: commits[6].subject, title: 'Fecha en otra zona horaria', branch: 'orquest/e3', target: 'main', author: 'Orquest', orquest: true, task: 'T4', assignee: 'e3', who: who.e3, taskKind: 'work', files: 1, added: 9, removed: 2, revertedBy: commits[5].sha },
    { sha: commits[8].sha, at: commits[8].at, subject: commits[8].subject, title: 'BE-11 Modelo de sesiones', branch: 'orquest/e1', target: 'main', author: 'Orquest', orquest: true, task: 'T3', assignee: 'e1', who: who.e1, taskKind: 'work', files: 6, added: 140, removed: 12 },
  ]
  const reverts = new Set([commits[5].sha])
  let forge: ForgeStatus = {
    kind: 'github',
    cli: 'gh',
    state: 'ok',
    remote: 'git@github.com:ejemplo/tienda-en-linea.git',
    prs: [
      { number: 11, title: 'BE-11 Modelo de sesiones', state: 'merged', head: 'orquest/e1', base: 'main', url: 'https://github.com/ejemplo/tienda-en-linea/pull/11', mergeCommit: commits[8].sha, at: now - 5 * DAY },
      { number: 12, title: 'DV-02 Script de datos semilla', state: 'merged', head: 'orquest/e2', base: 'main', url: 'https://github.com/ejemplo/tienda-en-linea/pull/12', mergeCommit: commits[3].sha, at: now - DAY },
      { number: 13, title: 'Exportar pedidos a CSV', state: 'open', head: 'feature/exportar-csv', base: 'main', url: 'https://github.com/ejemplo/tienda-en-linea/pull/13', at: now - 30 * MIN },
    ],
  }
  const office = (id: string) => `${repo}\\.orquest\\oficinas\\${id}`
  let trees: WorktreeRow[] = [
    { path: repo, head: commits[0].sha, branch: 'main', base: 'main', owner: { kind: 'project' }, files: 0, working: false, canRelease: false, releaseWhy: 'Solo se quitan desde aquí las oficinas de Orquest.' },
    { path: office('e1'), head: commits[1].sha, branch: 'orquest/e1', base: 'main', ahead: 3, behind: 0, owner: { kind: 'employee', live: true, gone: false, ...who.e1 }, task: { id: 'T9', title: 'Sesiones seguras' }, files: 2, working: false, canRelease: false, releaseWhy: 'Lupita sigue en la oficina.' },
    { path: office('e3'), head: commits[7].sha, branch: 'orquest/e3', base: 'main', ahead: 2, behind: 1, owner: { kind: 'employee', live: true, gone: false, ...who.e3 }, task: { id: 'T8', title: 'Exportar a CSV' }, files: 0, working: true, canRelease: false, releaseWhy: 'Nico sigue en la oficina.' },
    { path: office('ximena-dba'), head: commits[4].sha, branch: 'orquest/ximena-dba', base: 'main', ahead: 0, behind: 4, owner: { kind: 'employee', live: false, gone: true, id: 'ximena-dba', name: 'Ximena', role: 'dba', provider: 'kimi' }, task: { id: 'T5', title: 'DV-02 Script de datos semilla' }, files: 0, working: false, canRelease: true },
    { path: `${repo}-gourami`, head: commits[2].sha, branch: 'feature/exportar-csv', base: 'main', ahead: 1, behind: 2, owner: { kind: 'foreign' }, files: 0, working: false, canRelease: false, releaseWhy: 'Solo se quitan desde aquí las oficinas de Orquest.' },
  ]
  const SIZES: Record<string, number> = { [repo]: 412e6, [office('e1')]: 388e6, [office('e3')]: 402e6, [office('ximena-dba')]: 296e6, [`${repo}-gourami`]: 51e6 }
  const FILES: CommitFile[] = [
    { status: 'M', path: 'src/components/EstudioPanel.vue', added: 21, removed: 4 },
    { status: 'M', path: 'src/core/trazoeditor.ts', added: 9, removed: 2 },
    { status: 'A', path: 'test/trazoeditor.test.ts', added: 6, removed: 0 },
    { status: 'M', path: 'src/lang/en/oficina.ts', added: 2, removed: 0 },
  ]

  const view = (): HistoryView => {
    const { rows, width } = graphLanes(commits, commits[0].sha)
    return {
      repos: [],
      repo: '',
      branch: 'main',
      width,
      rows: commits.map((c, i) => ({ ...c, head: i === 0, lane: rows[i], ...(reverts.has(c.sha) ? { reverts: true } : {}) })),
      integrations: integrations.map((x) => ({ ...x })),
      owners: { 'orquest/e1': who.e1, 'orquest/e2': who.e2, 'orquest/e3': who.e3 },
    }
  }
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

  return {
    history: async () => view(),
    historyFiles: async (_repo, sha) => (integrations.some((i) => i.sha === sha) ? FILES : FILES.slice(0, 2)),
    historyDiff: async () => diff,
    forge: async () => {
      await wait(500)
      return forge
    },
    revertIntegration: async (_repo, sha) => {
      const i = integrations.find((x) => x.sha === sha)
      if (!i) throw new Error('Ese commit no es una integración de la rama actual.')
      if (i.revertedBy) throw new Error('Esa integración ya se revirtió.')
      const revert = `${Date.now().toString(16)}0000000000000000000000000`.slice(0, 40)
      commits.unshift({ sha: revert, parents: [commits[0].sha], ...orquest, at: Date.now(), subject: `Revert "${i.subject}"`, branches: ['main'] })
      commits[1].branches = commits[1].branches.filter((b) => b !== 'main')
      reverts.add(revert)
      i.revertedBy = revert
      return revert
    },
    createPullRequest: async (_repo, sha) => {
      const i = integrations.find((x) => x.sha === sha)!
      const number = 14 + forge.prs.length
      const url = `https://github.com/ejemplo/tienda-en-linea/pull/${number}`
      forge = { ...forge, prs: [...forge.prs, { number, title: i.title, state: 'open', head: i.branch!, base: 'main', url, at: Date.now() }] }
      return url
    },
    worktrees: async () => trees.map((t) => ({ ...t })),
    worktreeSize: async (path) => {
      await wait(400 + Math.random() * 900)
      return SIZES[path] ?? 0
    },
    openWorktree: async () => {},
    releaseWorktree: async (path) => {
      trees = trees.filter((t) => t.path !== path)
    },
  }
}
