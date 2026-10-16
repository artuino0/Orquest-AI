/**
 * El acceso desde el celular, del lado del escritorio: prende y apaga el
 * servidor para la app móvil (core/remote), da las direcciones por las que el
 * celular puede llegar (la red de la casa y Tailscale), el código para emparejar
 * (con lo que va en su QR), los dispositivos emparejados, y manda los avisos
 * cuando algo espera al usuario (core/notifier). Apagado de fábrica.
 */
import { networkInterfaces } from 'node:os'
import { basename } from 'node:path'
import type { DeviceView, Devices } from './devices.js'
import { T } from './i18n.js'
import type { EmployeeManager } from './employees.js'
import { alertsBetween, projectView, sendExpo, type Alert, type ProjectView } from './notifier.js'
import { inProject, REMOTE_PORT, startRemoteServer, type RemoteHandle } from './remote.js'
import type { Studio } from './studio.js'

export interface Address {
  ip: string
  /** Por dónde: la red de la casa o Tailscale (100.64.0.0/10), que también sirve fuera de casa. */
  via: 'lan' | 'tailscale'
}

export interface MobileStatus {
  enabled: boolean
  /** Puerto en que escucha, si está prendido. */
  port?: number
  /** Por qué no se pudo prender (p. ej. el puerto ya está ocupado). */
  error?: string
  addresses: Address[]
  devices: DeviceView[]
  /** Código vigente para emparejar y lo que va en su QR. */
  pairing?: { code: string; expiresAt: number; qr: string }
  detail: boolean
}

/** Las direcciones IPv4 de esta compu en la red (sin la interna). */
export function localAddresses(nets: ReturnType<typeof networkInterfaces> = networkInterfaces()): Address[] {
  const out: Address[] = []
  for (const list of Object.values(nets)) {
    for (const n of list ?? []) {
      if (n.internal || n.family !== 'IPv4') continue
      const [a, b] = n.address.split('.').map(Number)
      // Tailscale da direcciones de 100.64.0.0/10.
      out.push({ ip: n.address, via: a === 100 && b >= 64 && b <= 127 ? 'tailscale' : 'lan' })
    }
  }
  // Tailscale primero: funciona en casa y fuera.
  return out.sort((x, y) => (x.via === y.via ? 0 : x.via === 'tailscale' ? -1 : 1))
}

export interface MobileDeps {
  devices: Devices
  studios: () => Map<string, Studio>
  manager: EmployeeManager
  computer: string
  appVersion: string
  port?: number
  hostname?: string
  /** Para mandar los avisos (en pruebas, uno de mentira). */
  post?: typeof fetch
  addresses?: () => Address[]
}

export class Mobile {
  private remote: RemoteHandle | undefined
  private error: string | undefined
  private views = new Map<string, ProjectView>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  detail = false

  constructor(private deps: MobileDeps) {}

  get enabled() {
    return !!this.remote
  }

  async start(): Promise<void> {
    if (this.remote) return
    this.error = undefined
    try {
      this.remote = await startRemoteServer(this.deps, this.deps.port ?? REMOTE_PORT, this.deps.hostname)
      // Lo que ya estaba al prender no se avisa.
      for (const root of this.deps.studios().keys()) this.views.set(root, this.view(root)!)
    } catch (err) {
      const port = this.deps.port ?? REMOTE_PORT
      this.error = (err as NodeJS.ErrnoException).code === 'EADDRINUSE' ? T`El puerto ${port} ya lo usa otro programa en esta compu.` : (err as Error).message
    }
  }

  async stop(): Promise<void> {
    const r = this.remote
    this.remote = undefined
    this.views.clear()
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
    await r?.close()
  }

  async status(): Promise<MobileStatus> {
    const addresses = (this.deps.addresses ?? localAddresses)()
    const code = this.deps.devices.currentCode()
    const port = this.remote?.port
    return {
      enabled: !!this.remote,
      ...(port ? { port } : {}),
      ...(this.error ? { error: this.error } : {}),
      addresses,
      devices: await this.deps.devices.all(),
      ...(code && port ? { pairing: { ...code, qr: this.qr(code.code, addresses, port) } } : {}),
      detail: this.detail,
    }
  }

  /** Lo que lleva el QR: cómo llegar a esta compu y el código. Nada más. */
  private qr(code: string, addresses: Address[], port: number) {
    return JSON.stringify({ orquest: 1, compu: this.deps.computer, hosts: addresses.map((a) => a.ip), port, code })
  }

  newCode() {
    return this.deps.devices.newCode()
  }

  revoke(id: string) {
    return this.deps.devices.revoke(id)
  }

  private view(root: string): ProjectView | undefined {
    const s = this.deps.studios().get(root)
    if (!s) return undefined
    const snap = s.snapshot()
    const employees = this.deps.manager.list().filter((e) => inProject(root, e.office.path))
    return projectView(root, basename(root), snap, employees)
  }

  /** Algo cambió en un proyecto: el celular se entera y, si espera al usuario, le llega un aviso. */
  changed(root: string) {
    if (!this.remote) return
    this.remote.changes.bump()
    // Las ráfagas de cambios se juntan.
    clearTimeout(this.timers.get(root))
    this.timers.set(
      root,
      setTimeout(() => {
        this.timers.delete(root)
        void this.alert(root)
      }, 300),
    )
  }

  private async alert(root: string) {
    const next = this.view(root)
    if (!next) return
    const alerts = alertsBetween(this.views.get(root), next, this.detail)
    this.views.set(root, next)
    const now = alerts.filter((a) => !a.hold)
    if (now.length) await this.send(now)
    for (const a of alerts.filter((x) => x.hold)) {
      // Detenido: se espera por si el jefe lo autoriza, y solo se avisa si sigue así.
      setTimeout(() => {
        const id = a.to.id!
        const still = this.view(root)?.employees.find((e) => e.id === id)?.state === 'blocked'
        if (still && this.remote) void this.send([a])
      }, a.hold)
    }
  }

  private async send(alerts: Alert[]) {
    const tokens = await this.deps.devices.pushTokens()
    const { gone } = await sendExpo(tokens, alerts, this.deps.post)
    for (const t of gone) await this.deps.devices.forgetPush(t)
  }
}
