import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { OrquestApi } from '../shared/ipc.js'

function listen<A extends unknown[]>(channel: string, cb: (...args: A) => void) {
  const handler = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

const api: OrquestApi = {
  detectClis: () => ipcRenderer.invoke('clis:detect'),
  pickRepo: () => ipcRenderer.invoke('repo:pick'),
  hire: (req) => ipcRenderer.invoke('employee:hire', req),
  fire: (id, removeOffice) => ipcRenderer.invoke('employee:fire', id, removeOffice),
  list: () => ipcRenderer.invoke('employee:list'),
  scrollback: (id) => ipcRenderer.invoke('employee:scrollback', id),
  changes: (id) => ipcRenderer.invoke('employee:changes', id),
  write: (id, data) => ipcRenderer.send('employee:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('employee:resize', id, cols, rows),
  onData: (cb) => listen('employee:data', cb),
  onState: (cb) => listen('employee:state', cb),
  onHired: (cb) => listen('employee:hired', cb),
}

contextBridge.exposeInMainWorld('orquest', api)
