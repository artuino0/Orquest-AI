/**
 * Estudio de mentira para ver los paneles en el navegador sin abrir la app
 * (preview.html). No va en la app: ahí `window.orquest` lo pone el preload.
 * Los proyectos son los del diseño. Las CLIs son las de verdad de esta máquina,
 * salvo con ?caso=normal (las del diseño) o ?caso=sin-agentes.
 */
import { pickLang } from '../../core/i18n'
import type { CliStatus, OrquestApi, ProjectSummary } from '../../shared/ipc'

const cli = (id: CliStatus['id'], name: string, version: string | null, session: boolean | null, login: string, install: CliStatus['install']): CliStatus => ({
  id,
  name,
  installed: version !== null,
  ...(version && { version }),
  session: version === null ? null : session,
  login,
  ...(login.startsWith('abre') && { manualLogin: true }),
  install,
  // En la vista previa van como de referido, para ver el aviso que los acompaña.
  ...(id === 'claude' && { signup: { url: 'https://claude.com/pricing', referral: true } }),
  ...(id === 'codex' && { signup: { url: 'https://chatgpt.com/pricing', referral: true } }),
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
  // Idioma: ?lang=en manda; si no, el que se eligió aquí; si no, el del navegador.
  const LANG_KEY = 'orquest.lang'
  const saved = () => new URLSearchParams(location.search).get('lang') ?? localStorage.getItem(LANG_KEY)
  let recentList = RECENTS.map((r) => ({ ...r }))
  const api: OrquestApi = {
    language: async () => {
      const chosen = saved()
      return { lang: chosen === 'es' || chosen === 'en' ? chosen : pickLang(navigator.languages), chosen: !!chosen }
    },
    setLanguage: async (lang) => {
      localStorage.setItem(LANG_KEY, lang)
      // Que ?lang no gane a lo recién elegido.
      const url = new URL(location.href)
      url.searchParams.delete('lang')
      history.replaceState(null, '', url)
    },
    // ?caso=sin-git: una máquina recién estrenada, sin git.
    requirements: async () => [{ id: 'git', name: 'Git', installed: caso !== 'sin-git', version: caso !== 'sin-git' ? '2.47.0' : undefined, why: 'Cada empleado trabaja en su propia copia del repositorio y las entregas se integran a tu rama: todo eso lo hace git.', install: { command: 'winget install --id Git.Git -e', url: 'https://git-scm.com/downloads' } }],
    // ?caso=sin-repo y ?caso=sin-commits: la carpeta elegida no está lista. ?caso=varios-repos: agrupa repositorios.
    checkRepo: async (path) => ({ state: caso === 'sin-repo' || caso === 'varios-repos' ? 'no-repo' : caso === 'sin-commits' ? 'no-commits' : 'ok', inside: caso === 'varios-repos' ? ['back', 'front', 'movil'].map((n) => `${path}/${n}`) : [], gitignore: false }),
    prepareRepo: async () => {},
    createGroup: async (_path, names) => names,
    checkGroup: async (path) => ({ repos: caso === 'varios-repos' ? ['back', 'front', 'movil'].map((n) => ({ name: n, path: `${path}/${n}` })) : [], empty: [] }),
    version: async () => '0.0.0',
    // ?actualiza=1: como si hubiera una versión nueva publicada.
    checkUpdate: async () => (new URLSearchParams(location.search).get('actualiza') ? { version: '9.9.9', url: 'https://github.com/artuino0/Orquest-AI/releases' } : null),
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
    accounts: async () => [
      { provider: 'claude', dir: '.claude', main: true, label: 'Principal', usage: { at: Date.now() - 40_000, windows: [{ label: '5 horas', minutes: 300, used: 62, resetsAt: Date.now() + 95 * 60_000 }, { label: 'Semana', minutes: 10080, used: 31, resetsAt: Date.now() + 4 * 86_400_000 }] } },
      { provider: 'codex', dir: '.codex', main: true, label: 'Principal', usage: { at: Date.now() - 6 * 60_000, windows: [{ label: '5 horas', minutes: 300, used: 93, resetsAt: Date.now() + 22 * 60_000 }, { label: 'Semana', minutes: 10080, used: 74, resetsAt: Date.now() + 2 * 86_400_000 }] } },
      { provider: 'codex', dir: '.codex2', main: false, label: '2', usage: { at: Date.now() - 3_600_000, windows: [{ label: '5 horas', minutes: 300, used: 17, resetsAt: Date.now() + 200 * 60_000 }, { label: 'Semana', minutes: 10080, used: 3, resetsAt: Date.now() + 6 * 86_400_000 }] } },
      { provider: 'codex', dir: '.codex-trabajo', main: false, label: 'trabajo' },
    ],
    pickRepo: async () => null,
    recents: async () => recentList,
    touchRecent: async (entry) => (recentList = [entry, ...recentList.filter((r) => r.path !== entry.path)]),
    removeRecent: async (path) => (recentList = recentList.filter((r) => r.path !== path)),
    importRecents: async () => recentList,
    projectSummaries: async (repos) => repos.map((r) => SUMMARIES[r] ?? null),
    openExternal: async (url) => void window.open(url, '_blank'),
    openProject: todo('proyectos'),
    hireBoss: todo('jefe'),
    sayToBoss: todo('jefe'),
    answerQuestion: todo('jefe'),
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
    installedTools: async () => [
      { name: 'playwright-cli', kind: 'skill', source: 'tuyas', description: 'Prueba la app en un navegador real y toma capturas.' },
      { name: 'git-flow', kind: 'skill', source: 'tuyas', description: 'Flujo de corte y entrega.' },
      { name: 'impeccable', kind: 'skill', source: 'tuyas', description: 'Diseño de interfaces cuidado.' },
      { name: 'supabase', kind: 'skill', source: 'plugin supabase', description: 'Tablas, políticas y migraciones.' },
      { name: 'Neon', kind: 'mcp', source: 'MCP tuyo' },
    ],
    onNotice: nothing,
    windowControl: async () => {},
    onWindowState: nothing,
    onClosing: nothing,
    closeNow: async () => {},
    resumeProject: async () => {},
    skipResume: async () => {},
    fire: todo('empleados'),
    rest: todo('empleados'),
    bringBack: todo('empleados'),
    blockedBy: async () => null,
    answerBlock: todo('empleados'),
    restart: todo('empleados'),
    say: async () => {},
    journal: async () => '',
    list: async () => [],
    scrollback: async () => '',
    changes: async () => [],
    captures: async () => [],
    capture: todo('capturas'),
    diff: async () => '',
    tree: async (_id, dir) =>
      (({
        '': [['src', true], ['test', true], ['package.json', false], ['README.md', false]],
        src: [['components', true], ['main.ts', false], ['style.css', false]],
        'src/components': [['Cart.vue', false], ['Checkout.vue', false]],
        test: [['cart.test.ts', false]],
      } as Record<string, [string, boolean][]>)[dir] ?? []).map(([name, isDir]) => ({ name, path: dir ? `${dir}/${name}` : name, dir: isDir })),
    fileSides: async () => ({ before: '', after: '', binary: false, truncated: false, stamp: '' }),
    saveFile: async () => ({ stamp: `demo-${Date.now()}` }),
    retune: async () => {},
    setTeamApproval: async () => {},
    requestReview: async () => {},
    stopReview: async () => {},
    // De mentira: quita espacios de más al final de cada renglón.
    formatFile: async (_id, _path, text) => text.split('\n').map((l) => l.trimEnd()).join('\n'),
    projectFile: async (path) => window.orquest.fileText('', path),
    projectChanges: async () => [{ status: 'M', path: 'src/main.ts' }, { status: '??', path: 'test/cart.test.ts' }] as never,
    saveProjectFile: async () => ({ stamp: `demo-${Date.now()}` }),
    formatProjectFile: async (_path, text) => text.split('\n').map((l) => l.trimEnd()).join('\n'),
    projectTree: async (dir) =>
      (({
        '': [['src', true], ['test', true], ['package.json', false], ['README.md', false]],
        src: [['components', true], ['main.ts', false], ['style.css', false]],
        'src/components': [['Cart.vue', false], ['Checkout.vue', false]],
        test: [['cart.test.ts', false]],
      } as Record<string, [string, boolean][]>)[dir] ?? []).map(([name, isDir]) => ({ name, path: dir ? `${dir}/${name}` : name, dir: isDir })),
    fileText: async (_id, path) => {
      const text = path.endsWith('.json')
        ? '{\n  "name": "tienda-en-linea",\n  "version": "1.2.0",\n  "private": true,\n  "scripts": { "dev": "vite", "test": "vitest run" }\n}\n'
        : path.endsWith('.md')
          ? '# Tienda en línea\n\nCarrito, pago y **pedidos**.\n\n- `npm run dev` para probar\n- [Guía](docs/guia.md)\n'
          : path.endsWith('.vue')
            ? '<script setup lang="ts">\nimport { ref } from \'vue\'\nconst total = ref(0)\n</script>\n\n<template>\n  <button class="pay" @click="total++">Pagar {{ total }}</button>\n</template>\n\n<style scoped>\n.pay { color: #f2b544; padding: 8px 12px; }\n</style>\n'
            : path.endsWith('.css')
              ? '/* Botones */\n.btn { display: flex; gap: 8px; color: var(--accent); }\n.btn:hover { opacity: 0.8; }\n'
              : `// ${path}\nimport { createApp } from 'vue'\nimport App from './App.vue'\n\ninterface Item {\n  id: number\n  price: number\n}\n\n/** Suma lo que hay en el carrito. */\nexport function total(items: Item[]): number {\n  return items.reduce((sum, i) => sum + i.price, 0)\n}\n\nconst TAX = 0.16\ncreateApp(App).mount('#app')\n`
      return { text, binary: false, truncated: false, size: text.length, stamp: 'demo' }
    },
    write: () => {},
    resize: () => {},
    onData: nothing,
    onState: nothing,
    onActivity: nothing,
    documents: async () => [],
    documentText: async () => '',
    onHired: nothing,
  }
  // Con ?proyecto hay además un proyecto de mentira que avanza solo.
  const params = new URLSearchParams(location.search)
  window.orquest = params.get('proyecto') ? { ...api, ...mockStudio(params) } : api
}
