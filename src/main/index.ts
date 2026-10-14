import { join, resolve } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import * as pty from 'node-pty'
import { mkdir } from 'node:fs/promises'
import { RuleError, summarize } from '../core/board.js'
import { installCli } from '../core/cli.js'
import { listAccounts, type Account, type AccountUsage } from '../core/accounts.js'
import { probeAgyUsage } from '../core/agyusage.js'
import { detectAll, detectModels, detectProvider, detectRequirements } from '../core/detect.js'
import { listTools } from '../core/skills.js'
import { listCaptures, readCapture } from '../core/captures.js'
import { fileSides, listDir, readText } from '../core/files.js'
import { Recents, type RecentProject } from '../core/recents.js'
import { formatText } from '../core/format.js'
import { listDocuments, listGroupDocuments, readDocument } from '../core/documents.js'
import { readOffice, writeOffice } from '../core/officefile.js'
import { EmployeeManager } from '../core/employees.js'
import { Library, type Dossier, type Manual } from '../core/library.js'
import { startMcpServer, type McpHandle } from '../core/mcp.js'
import { PROVIDER_IDS, PROVIDERS, type Effort, type ProviderId } from '../core/providers.js'
import { StudioStore } from '../core/store.js'
import { addDictionary, getLang, setLang, T, type Lang } from '../core/i18n.js'
import en from '../core/lang/en.js'
import { checkGroup, checkRepo, prepareRepo, createGroup } from '../core/repo.js'
import { checkUpdate } from '../core/update.js'
import { loadSettings, saveSettings, startLang, type Settings } from '../core/settings.js'
import { BOSS_ID, Studio } from '../core/studio.js'
import { headOf, officeChanges, officeDiff, repoRoot } from '../core/worktree.js'
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
    // En desarrollo la app corre con el ejecutable de Electron: sin esto la barra de tareas muestra su ícono.
    // Windows quiere .ico; Linux y macOS, .png (con .ico la barra de Linux se queda sin ícono).
    icon: join(app.isPackaged ? join(__dirname, '../renderer/sprites') : join(app.getAppPath(), 'assets/herdr-oficina/sprites'), process.platform === 'win32' ? 'oficina.ico' : 'oficina.png'),
    // Sin marco ni menú del sistema: el encabezado lo dibuja la app (components/TitleBar.vue).
    frame: false,
    minWidth: 960,
    minHeight: 600,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false },
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  const state = () => send('window:state', { maximized: !!win?.isMaximized() })
  // F11: la ventana a pantalla completa, y de regreso.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'F11') return
    event.preventDefault()
    win?.setFullScreen(!win.isFullScreen())
  })
  win.on('closed', () => (win = null))
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

// Al cerrar, las terminales todavía avisan que terminaron: a una ventana que ya no existe no se le manda nada.
const send = (channel: string, ...args: unknown[]) => {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, ...args)
}
manager.on('data', (id, data) => send('employee:data', id, data))
manager.on('state', (id, state) => send('employee:state', id, state))
manager.on('hired', (e) => send('employee:hired', e))
manager.on('activity', (id, activity) => send('employee:activity', id, activity))

function studio(): Studio {
  if (!current) throw new Error(T`No hay proyecto abierto.`)
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

handle('app:version', () => app.getVersion())
handle('update:check', () => checkUpdate(app.getVersion()))
handle('clis:detect', () => detectAll())
handle('requirements:detect', () => detectRequirements())
handle('clis:models', async () => detectModels(await detectAll()))
// Con un proyecto abierto se suma lo que cada CLI acaba de reportar; sin él, lo que dejaron en disco.
// Antigravity no anota su cuota en ningún archivo: se le pregunta con /usage en una terminal aparte (`core/agyusage.ts`).
// Solo cuando alguien pide las cuentas, y como mucho cada 5 minutos; mientras, se da el último dato.
const agy: { checkedAt: number; binary?: string; usage?: AccountUsage; probedAt: number; probing: boolean } = { checkedAt: 0, probedAt: 0, probing: false }
async function agyAccount(): Promise<Account | undefined> {
  if (Date.now() - agy.checkedAt > 60_000) {
    const s = await detectProvider(PROVIDERS.antigravity).catch(() => undefined)
    agy.checkedAt = Date.now()
    agy.binary = s?.installed && s.session === true ? s.binary : undefined
  }
  if (!agy.binary) return undefined
  if (!agy.probing && Date.now() - agy.probedAt > 5 * 60_000) {
    agy.probing = true
    agy.probedAt = Date.now()
    const dir = join(app.getPath('userData'), 'agy-uso')
    void mkdir(dir, { recursive: true })
      .then(() => probeAgyUsage({ binary: agy.binary!, dir, spawn: (file, args, o) => pty.spawn(file, args, { name: 'xterm-256color', ...o }) }))
      .then((u) => {
        if (u) agy.usage = u
      })
      .catch(() => {})
      .finally(() => (agy.probing = false))
  }
  return { provider: 'antigravity', dir: '', main: true, label: T`Principal`, usage: agy.usage }
}
handle('accounts:list', async () => {
  const one = await agyAccount()
  return [...(current?.accounts() ?? listAccounts()), ...(one ? [one] : [])]
})
handle('repo:check', (path: string) => checkRepo(path))
handle('repo:group', (path: string) => checkGroup(path))
handle('repo:prepare', (path: string) => prepareRepo(path))
handle('repo:create-group', (path: string, names: string[]) => createGroup(path, names))
handle('repo:pick', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'], title: T`Elige el repositorio del proyecto` })
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

// `group`: la carpeta no es un repositorio sino que agrupa varios, y se abre como un solo proyecto con ella de raíz.
handle('project:open', async (repo: string, group?: boolean) => {
  const root = group ? resolve(repo) : await repoRoot(repo)
  let s = studios.get(root)
  if (!s) {
    s = await new Studio({
      repo: root,
      group: !!group,
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
handle('documents:list', () => {
  const s = studio()
  return s.repos.length ? listGroupDocuments(s.root, s.repos) : listDocuments(s.snapshot().repo)
})
handle('documents:read', (path: string) => readDocument(studio().snapshot().repo, path))
handle('tools:list', () => listTools(current?.snapshot().repo))
handle('app:close-now', () => skipCuts?.())
handle('boss:hire', (req: BossRequest) => studio().hireBoss(req))
handle('boss:say', (text: string) => studio().sayToBoss(text))
handle('boss:answer', (id: string, text: string) => void studio().answerQuestion(id, text))
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

handle('employee:fire', (id: string) => {
  // Al jefe se le pide antes su traspaso, que tarda lo que tarda: la UI no espera.
  if (id !== BOSS_ID) return studio().fire(id)
  void studio().fire(id).catch((err) => send('notice', (err as Error).message))
})
handle('boss:team-approval', (on: boolean) => studio().setTeamApproval(on))
handle('employee:retune', (id: string, change: { provider?: ProviderId; model?: string; effort?: Effort }) => studio().retune(id, change))
// El descanso tarda lo que tarda el traspaso; la UI no espera a que termine.
handle('employee:say', (id: string, text: string) => studio().say(id, text))
handle('employee:back', (id: string) => studio().bringBack(id))
handle('employee:blocked-by', (id: string) => manager.blockedBy(id) ?? null)
handle('employee:answer-block', (id: string) => manager.answerBlock(id))
handle('employee:restart', (id: string) => studio().restart(id))
handle('employee:rest', (id: string) => {
  void studio().rest(id).catch((err) => send('notice', (err as Error).message))
})
handle('employee:journal', (id: string) => studio().readJournal(id))
handle('employee:list', () => manager.list())
handle('employee:scrollback', (id: string) => manager.scrollback(id))
handle('employee:changes', async (id: string) => {
  const emp = manager.get(id)
  if (!emp) return []
  // Con varios repositorios su oficina no es uno: los cambios salen de cada copia que tiene dentro.
  const changes = current?.repos.length ? await current.changes(id) : await officeChanges(emp.office)
  // Los archivos del jefe empiezan por sus planes guardados, que git no mira.
  const plans = id === BOSS_ID ? ((await current?.plans()) ?? []).map((p) => ({ status: 'plan', path: p.file })) : []
  return [...plans, ...changes]
})
handle('employee:captures', async (id: string) => {
  const emp = manager.get(id)
  if (!emp) return []
  // También las que adjuntó al entregar, aunque estén en una carpeta que no se revisa.
  if (current?.repos.length) return current.captures(id)
  const attached = current?.snapshot().tasks.filter((t) => t.assignee === id).flatMap((t) => [...(t.delivery?.screenshots ?? []), ...(t.qa?.screenshots ?? [])]) ?? []
  return listCaptures(emp.office.path, attached, current ? await headOf(current.snapshot().repo).catch(() => undefined) : undefined)
})
handle('employee:capture', (id: string, path: string) => {
  const emp = manager.get(id)
  if (!emp) throw new RuleError(T`Ya no está en la oficina.`)
  return readCapture(emp.office.path, path)
})
handle('employee:diff', (id: string, path: string) => {
  const emp = manager.get(id)
  if (!emp) return ''
  return current?.repos.length ? current.fileDiff(id, path) : officeDiff(emp.office, path)
})
handle('employee:tree', (id: string, dir: string) => {
  const emp = manager.get(id)
  return emp ? listDir(emp.office.path, dir) : []
})
handle('employee:file', (id: string, path: string) => {
  const emp = manager.get(id)
  if (!emp) throw new RuleError(T`Ya no está en la oficina.`)
  return readText(emp.office.path, path)
})
handle('employee:sides', (id: string, path: string) => {
  const emp = manager.get(id)
  if (!emp) throw new RuleError(T`Ya no está en la oficina.`)
  return fileSides(emp.office.path, path)
})
handle('employee:save-file', (id: string, path: string, text: string, stamp: string) => studio().saveFile(id, path, text, stamp))
handle('employee:format-file', (id: string, path: string, text: string) => {
  const emp = manager.get(id)
  if (!emp) throw new RuleError(T`Ya no está en la oficina.`)
  return formatText(emp.office.path, path, text)
})
handle('project:tree', (dir: string) => studio().projectTree(dir))
handle('project:file', (path: string) => studio().projectFile(path))
handle('project:changes', () => studio().projectChanges())
handle('project:save-file', (path: string, text: string, stamp: string) => studio().saveProjectFile(path, text, stamp))
handle('project:format-file', (path: string, text: string) => studio().formatProjectFile(path, text))
ipcMain.on('employee:write', (_e, id: string, data: string) => manager.isLive(id) && manager.write(id, data))
ipcMain.on('employee:resize', (_e, id: string, cols: number, rows: number) => manager.isLive(id) && manager.resize(id, cols, rows))

// ── Idioma: el que eligió el usuario o, si no ha elegido, el de su sistema.
addDictionary('en', en)
const settingsFile = join(app.getPath('userData'), 'ajustes.json')
const recents = new Recents(join(app.getPath('userData'), 'recientes.json'))
handle('recents:list', () => recents.all())
handle('recents:touch', (entry: RecentProject) => recents.touch(entry))
handle('recents:remove', (path: string) => recents.remove(path))
handle('recents:import', (entries: RecentProject[]) => recents.import(entries))
let settings: Settings = {}
handle('language:get', () => ({ lang: getLang(), chosen: !!settings.lang }))
handle('language:set', async (lang: Lang) => {
  settings = { ...settings, lang }
  setLang(lang)
  await saveSettings(settingsFile, settings)
})

// Que Windows agrupe la ventana bajo Orquest AI y no bajo Electron.
app.setAppUserModelId('ai.orquest.app')

app.whenReady().then(async () => {
  settings = await loadSettings(settingsFile)
  setLang(startLang(settings, app.getPreferredSystemLanguages()))
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
  // Instalada, la app va comprimida (app.asar) y el comando queda a un lado, donde una terminal sí lo alcanza.
  const appDir = app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked')
  cliDir = await installCli(join(app.getPath('userData'), 'bin'), { runtime: process.execPath, script: join(appDir, 'src/cli/orquest.mjs') })
  createWindow()
})
app.on('window-all-closed', async () => {
  for (const s of studios.values()) s.shutdown()
  manager.shutdown()
  await mcp?.close()
  store?.close()
  app.quit()
})
