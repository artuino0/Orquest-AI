import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import * as pty from 'node-pty'
import { detectAll } from '../core/detect.js'
import { EmployeeManager, type HireRequest } from '../core/employees.js'
import { officeChanges, officeDiff } from '../core/worktree.js'

const manager = new EmployeeManager((file, args, o) => pty.spawn(file, args, { name: 'xterm-256color', ...o }))
/** Repo de cada empleado, para despedirlo y quitar su oficina. */
const repos = new Map<string, string>()

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

ipcMain.handle('clis:detect', () => detectAll())
ipcMain.handle('repo:pick', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Elige el repositorio del proyecto' })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.handle('employee:hire', async (_e, req: HireRequest) => {
  const emp = await manager.hire(req)
  repos.set(emp.id, req.repo)
  return emp
})
ipcMain.handle('employee:fire', async (_e, id: string, removeOffice: boolean) => {
  await manager.fire(id, repos.get(id)!, { removeOffice })
  repos.delete(id)
})
ipcMain.handle('employee:list', () => manager.list())
ipcMain.handle('employee:scrollback', (_e, id: string) => manager.scrollback(id))
ipcMain.handle('employee:changes', (_e, id: string) => {
  const emp = manager.get(id)
  return emp ? officeChanges(emp.office) : []
})
ipcMain.handle('employee:diff', (_e, id: string, path: string) => {
  const emp = manager.get(id)
  return emp ? officeDiff(emp.office, path) : ''
})
ipcMain.on('employee:write', (_e, id: string, data: string) => manager.write(id, data))
ipcMain.on('employee:resize', (_e, id: string, cols: number, rows: number) => manager.resize(id, cols, rows))

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  manager.shutdown()
  app.quit()
})
