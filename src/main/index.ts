import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import * as pty from 'node-pty'
import { RuleError } from '../core/board.js'
import { detectAll } from '../core/detect.js'
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
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false },
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
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
handle('repo:pick', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Elige el repositorio del proyecto' })
  return r.canceled ? null : r.filePaths[0]
})

handle('project:open', async (repo: string) => {
  const root = await repoRoot(repo)
  let s = studios.get(root)
  if (!s) {
    s = await new Studio({ repo: root, manager, store, library, detect: detectAll, mcpUrl: (t) => mcp.url(t) }).init()
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
  return s.snapshot()
})
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

handle('employee:fire', (id: string) => studio().fire(id))
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
  createWindow()
})
app.on('window-all-closed', async () => {
  for (const s of studios.values()) s.shutdown()
  manager.shutdown()
  await mcp?.close()
  store?.close()
  app.quit()
})
