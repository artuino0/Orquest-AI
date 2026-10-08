import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import * as pty from 'node-pty'
import { RuleError, summarize } from '../core/board.js'
import { installCli } from '../core/cli.js'
import { detectAll, detectModels } from '../core/detect.js'
import { readOffice, writeOffice } from '../core/officefile.js'
import { EmployeeManager } from '../core/employees.js'
import { Library, type Dossier, type Manual } from '../core/library.js'
import { startMcpServer, type McpHandle } from '../core/mcp.js'
import { PROVIDER_IDS, type ProviderId } from '../core/providers.js'
import { StudioStore } from '../core/store.js'
import { Studio } from '../core/studio.js'
import { officeChanges, officeDiff, repoRoot } from '../core/worktree.js'
import type { BossRequest, SlotEdit } from '../shared/ipc.js'

const manager = new EmployeeManager((file, args, o) => pty.spawn(file, args, { name: 'xterm-256color', ...o }))
let store: StudioStore
let mcp: McpHandle
/** Carpeta con el comando `orquest`, al frente del PATH de cada agente. */
let cliDir: string
/** Expedientes, manuales e historial: uno por estudio, compartido por todos sus proyectos. */
let library: Library
/** Un estudio por repo abierto en esta sesión; la UI trabaja con el actual. */
const studios = new Map<string, Studio>()
let current: Studio | undefined

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#1b1a24',
    title: 'Orquest AI',
    // Sin marco ni menú del sistema: el encabezado lo dibuja la app (components/TitleBar.vue).
    frame: false,
    minWidth: 960,
    minHeight: 600,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false },
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  const state = () => send('window:state', { maximized: !!win?.isMaximized() })
  win.on('maximize', state)
  win.on('unmaximize', state)
  win.webContents.on('did-finish-load', state)
  win.on('close', (e) => {
    if (closing === 'ya') return
    e.preventDefault()
    if (closing === 'esperando') return
    void closeWithCuts()
  })
}

/** Cuánto se espera a que los agentes dejen su corte antes de cerrar de todos modos. */
const CUT_TIMEOUT_MS = 90_000
let closing: 'no' | 'esperando' | 'ya' = 'no'
let skipCuts: (() => void) | undefined

/** Cerrar la ventana no mata a los agentes a media frase: primero cada uno deja su corte. */
async function closeWithCuts() {
  closing = 'esperando'
  const progress = new Map<Studio, { asked: string[]; done: string[] }>()
  const tell = () => send('app:closing', { asked: [...progress.values()].flatMap((p) => p.asked), done: [...progress.values()].flatMap((p) => p.done) })
  const cuts = Promise.all([...studios.values()].map((s) => s.checkpoint(CUT_TIMEOUT_MS, (p) => (progress.set(s, p), tell())).catch(() => undefined)))
  await Promise.race([cuts, new Promise<void>((resolve) => (skipCuts = resolve))])
  closing = 'ya'
  win?.close()
}

const send = (channel: string, ...args: unknown[]) => win?.webContents.send(channel, ...args)
manager.on('data', (id, data) => send('employee:data', id, data))
manager.on('state', (id, state) => send('employee:state', id, state))
manager.on('hired', (e) => send('employee:hired', e))

function studio(): Studio {
  if (!current) throw new Error('No hay proyecto abierto.')
  return current
}

/** Los motivos de las reglas llegan tal cual a la UI. */
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return await fn(...(args as A))
    } catch (err) {
      throw new Error(err instanceof RuleError ? err.message : (err as Error).message)
    }
  })
}

handle('clis:detect', () => detectAll())
handle('clis:models', async () => detectModels(await detectAll()))
handle('repo:pick', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Elige el repositorio del proyecto' })
  return r.canceled ? null : r.filePaths[0]
})

handle('project:summaries', (repos: string[]) =>
  repos.map((repo) => {
    const saved = store.load(repo)
    return saved ? summarize(saved) : null
  }),
)
// Solo páginas web: lo que llega del renderer no abre archivos ni otros protocolos.
handle('shell:open', (url: string) => (/^https:\/\//.test(url) ? shell.openExternal(url) : undefined))

handle('project:open', async (repo: string) => {
  const root = await repoRoot(repo)
  let s = studios.get(root)
  if (!s) {
    s = await new Studio({
      repo: root,
      manager,
      store,
      library,
      detect: detectAll,
      mcpUrl: (t) => mcp.url(t),
      statusUrl: (t) => mcp.statusUrl(t),
      cli: { url: (t) => mcp.cliUrl(t), dir: cliDir },
    }).init()
    let pending: ReturnType<typeof setTimeout> | undefined
    const target = s
    s.on('changed', () => {
      // Agrupa ráfagas de cambios.
      clearTimeout(pending)
      pending = setTimeout(() => current === target && send('board:changed', target.snapshot()), 60)
    })
    s.on('notice', (text) => current === target && send('notice', text))
    studios.set(root, s)
  }
  current = s
  // Si quedó gente al cerrar, la foto lo dice (resumable) y el usuario decide si se retoma.
  return s.snapshot()
})
handle('project:resume', () => studio().resume())
handle('project:skip-resume', () => studio().skipResume())
handle('window:control', (action: 'minimize' | 'maximize' | 'close') => {
  if (action === 'minimize') win?.minimize()
  else if (action === 'maximize') win?.isMaximized() ? win.unmaximize() : win?.maximize()
  else win?.close() // pasa por el corte de los agentes, como cerrar de cualquier otra forma
})
handle('app:close-now', () => skipCuts?.())
handle('boss:hire', (req: BossRequest) => studio().hireBoss(req))
handle('boss:say', (text: string) => studio().sayToBoss(text))
handle('template:approve', (slots: SlotEdit[]) => void studio().approveTemplate(slots))
handle('task:merge', async (id: string) => void (await studio().merge(id)))
handle('task:return', (id: string, notes: string) => studio().userReturn(id, notes))
handle('task:diff', (id: string) => studio().diff(id))

handle('library:get', () => {
  // Un expediente por proveedor, más los que el usuario haya hecho por modelo.
  const keys = new Map<string, Dossier>()
  for (const p of PROVIDER_IDS) keys.set(`${p}::`, library.dossier(p))
  for (const d of library.dossiers()) keys.set(`${d.provider}::${d.model}`, d)
  for (const p of PROVIDER_IDS) for (const m of library.models(p)) if (m && !keys.has(`${p}::${m}`)) keys.set(`${p}::${m}`, { ...library.dossier(p, m), model: m })
  return {
    dossiers: [...keys.values()].map((d) => ({ ...d, stats: library.stats(d.provider, d.model || undefined) })),
    manuals: library.manuals(),
  }
})
handle('library:saveDossier', (d: Dossier) => library.saveDossier(d))
handle('library:saveManual', (m: Manual) => library.saveManual(m))
handle('library:check', (slots: { provider: ProviderId; model?: string; role: string }[]) =>
  slots.map((x) => library.check(x.provider, x.model, x.role)),
)

const officePath = () => join(app.getPath('userData'), 'oficina.json')
handle('office:load', () => readOffice(officePath()))
handle('office:save', (office: unknown) => writeOffice(officePath(), office))

handle('employee:fire', (id: string) => studio().fire(id))
// El descanso tarda lo que tarda el traspaso; la UI no espera a que termine.
handle('employee:say', (id: string, text: string) => studio().say(id, text))
handle('employee:back', (id: string) => studio().bringBack(id))
handle('employee:rest', (id: string) => {
  void studio().rest(id).catch((err) => send('notice', (err as Error).message))
})
handle('employee:journal', (id: string) => studio().readJournal(id))
handle('employee:list', () => manager.list())
handle('employee:scrollback', (id: string) => manager.scrollback(id))
handle('employee:changes', (id: string) => {
  const emp = manager.get(id)
  return emp ? officeChanges(emp.office) : []
})
handle('employee:diff', (id: string, path: string) => {
  const emp = manager.get(id)
  return emp ? officeDiff(emp.office, path) : ''
})
ipcMain.on('employee:write', (_e, id: string, data: string) => manager.isLive(id) && manager.write(id, data))
ipcMain.on('employee:resize', (_e, id: string, cols: number, rows: number) => manager.isLive(id) && manager.resize(id, cols, rows))

app.whenReady().then(async () => {
  store = new StudioStore(join(app.getPath('userData'), 'studio.db'))
  library = new Library(store)
  mcp = await startMcpServer((token) => {
    for (const s of studios.values()) {
      const caller = s.caller(token)
      if (caller) return { studio: s, caller }
    }
    return undefined
  })
  // El comando corre con este mismo Electron en modo Node: no depende de que haya Node instalado.
  cliDir = await installCli(join(app.getPath('userData'), 'bin'), { runtime: process.execPath, script: join(app.getAppPath(), 'src/cli/orquest.mjs') })
  createWindow()
})
app.on('window-all-closed', async () => {
  for (const s of studios.values()) s.shutdown()
  manager.shutdown()
  await mcp?.close()
  store?.close()
  app.quit()
})
