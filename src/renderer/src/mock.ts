/**
 * Estudio de mentira para ver los paneles en el navegador sin abrir la app
 * (preview.html). No va en la app: ahí `window.orquest` lo pone el preload.
 * Los proyectos son los del diseño. Las CLIs son las de verdad de esta máquina,
 * salvo con ?caso=normal (las del diseño) o ?caso=sin-agentes.
 */
import type { CliStatus, OrquestApi, ProjectSummary } from '../../shared/ipc'

const cli = (id: CliStatus['id'], name: string, version: string | null, session: boolean | null, login: string, install: CliStatus['install']): CliStatus => ({
  id,
  name,
  installed: version !== null,
  ...(version && { version }),
  session: version === null ? null : session,
  login,
  install,
})

const CLIS: Record<string, CliStatus[]> = {
  normal: [
    cli('claude', 'Claude Code', '2.1.4', true, 'claude auth login', { command: 'npm install -g @anthropic-ai/claude-code', url: 'https://docs.claude.com/en/docs/claude-code/setup' }),
    cli('codex', 'Codex', '0.48.0', true, 'codex login', { command: 'npm install -g @openai/codex', url: 'https://developers.openai.com/codex/cli' }),
    cli('antigravity', 'Antigravity', '1.3.2', false, 'abre agy en una terminal y sigue su inicio de sesión', { url: 'https://antigravity.google' }),
    cli('opencode', 'OpenCode', '0.15.1', true, 'opencode auth login', { command: 'npm install -g opencode-ai', url: 'https://opencode.ai' }),
    cli('commandcode', 'Command Code', null, null, 'abre commandcode en una terminal y sigue su inicio de sesión', { url: 'https://commandcode.ai' }),
    cli('kimi', 'Kimi', '0.9.0', false, 'abre kimi en una terminal y sigue su inicio de sesión', { url: 'https://github.com/MoonshotAI/kimi-cli' }),
    cli('grok', 'Grok', null, null, 'abre grok en una terminal y sigue su inicio de sesión', { url: 'https://x.ai' }),
  ],
}
CLIS['sin-agentes'] = CLIS.normal.map((c) => (c.id === 'antigravity' || c.id === 'kimi' ? c : { ...c, installed: false, version: undefined, session: null }))

const HOUR = 3600_000
export const RECENTS = [
  { path: 'C:\\dev\\orquest-web', at: Date.now() - 2 * HOUR },
  { path: 'C:\\dev\\clientes\\erp-dinamico', at: Date.now() - 26 * HOUR },
  { path: 'D:\\repos\\api-pagos', at: Date.now() - 3 * 24 * HOUR },
  { path: 'C:\\dev\\landing-flow', at: new Date(new Date().getFullYear(), 8, 12).getTime() },
]
const SUMMARIES: Record<string, ProjectSummary> = {
  'C:\\dev\\orquest-web': { staff: 6, pending: 2, started: true },
  'C:\\dev\\clientes\\erp-dinamico': { staff: 4, pending: 0, started: true },
  'D:\\repos\\api-pagos': { staff: 0, pending: 0, started: false },
  'C:\\dev\\landing-flow': { staff: 2, pending: 0, started: true },
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const nothing = () => () => {}

import { mockStudio } from './mockstudio'

export function installMock(caso: string) {
  const todo = (what: string) => async (): Promise<never> => {
    throw new Error(`La vista previa no tiene ${what}.`)
  }
  const api: OrquestApi = {
    detectClis: async () => {
      // Sin ?caso, las CLIs son las de verdad de esta máquina (las detecta el servidor de vista previa).
      if (!(caso in CLIS)) {
        const real = await fetch('/__orquest/clis').then((r) => (r.ok ? (r.json() as Promise<CliStatus[]>) : null), () => null)
        if (real) return real
      }
      await wait(350)
      return CLIS[caso] ?? CLIS.normal
    },
    // Los modelos también son los de verdad, si el servidor de vista previa los da.
    cliModels: async () => (caso in CLIS ? {} : fetch('/__orquest/modelos').then((r) => (r.ok ? r.json() : {}), () => ({}))),
    pickRepo: async () => null,
    projectSummaries: async (repos) => repos.map((r) => SUMMARIES[r] ?? null),
    openExternal: async (url) => void window.open(url, '_blank'),
    openProject: todo('proyectos'),
    hireBoss: todo('jefe'),
    sayToBoss: todo('jefe'),
    approveTemplate: todo('plantilla'),
    mergeTask: todo('entregas'),
    returnTask: todo('entregas'),
    taskDiff: async () => '',
    library: async () => ({ dossiers: [], manuals: [] }),
    saveDossier: async () => {},
    saveManual: async () => {},
    checkSlots: async () => [],
    loadOffice: async () => null,
    saveOffice: async () => {},
    onBoard: nothing,
    onNotice: nothing,
    fire: todo('empleados'),
    rest: todo('empleados'),
    bringBack: todo('empleados'),
    journal: async () => '',
    list: async () => [],
    scrollback: async () => '',
    changes: async () => [],
    diff: async () => '',
    write: () => {},
    resize: () => {},
    onData: nothing,
    onState: nothing,
    onHired: nothing,
  }
  // Con ?proyecto hay además un proyecto de mentira que avanza solo.
  const params = new URLSearchParams(location.search)
  window.orquest = params.get('proyecto') ? { ...api, ...mockStudio(params) } : api
}
