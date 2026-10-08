import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { OrquestApi } from '../shared/ipc.js'

function listen<A extends unknown[]>(channel: string, cb: (...args: A) => void) {
  const handler = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

/** Quita el prefijo que Electron agrega a los errores de invoke: el motivo llega limpio. */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return await ipcRenderer.invoke(channel, ...args)
  } catch (err) {
    throw new Error(String((err as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
  }
}

const api: OrquestApi = {
  detectClis: () => invoke('clis:detect'),
  pickRepo: () => invoke('repo:pick'),
  projectSummaries: (repos) => invoke('project:summaries', repos),
  openExternal: (url) => invoke('shell:open', url),
  openProject: (repo) => invoke('project:open', repo),
  hireBoss: (req) => invoke('boss:hire', req),
  sayToBoss: (text) => invoke('boss:say', text),
  approveTemplate: (slots) => invoke('template:approve', slots),
  mergeTask: (id) => invoke('task:merge', id),
  returnTask: (id, notes) => invoke('task:return', id, notes),
  taskDiff: (id) => invoke('task:diff', id),
  library: () => invoke('library:get'),
  saveDossier: (d) => invoke('library:saveDossier', d),
  saveManual: (m) => invoke('library:saveManual', m),
  checkSlots: (slots) => invoke('library:check', slots),
  loadOffice: () => invoke('office:load'),
  saveOffice: (office) => invoke('office:save', office),
  onBoard: (cb) => listen('board:changed', cb),
  onNotice: (cb) => listen('notice', cb),
  fire: (id) => invoke('employee:fire', id),
  rest: (id) => invoke('employee:rest', id),
  journal: (id) => invoke('employee:journal', id),
  list: () => invoke('employee:list'),
  scrollback: (id) => invoke('employee:scrollback', id),
  changes: (id) => invoke('employee:changes', id),
  diff: (id, path) => invoke('employee:diff', id, path),
  write: (id, data) => ipcRenderer.send('employee:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('employee:resize', id, cols, rows),
  onData: (cb) => listen('employee:data', cb),
  onState: (cb) => listen('employee:state', cb),
  onHired: (cb) => listen('employee:hired', cb),
}

contextBridge.exposeInMainWorld('orquest', api)
