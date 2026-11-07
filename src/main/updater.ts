/**
 * La app se actualiza sola donde se puede (`selfUpdates` en core/update.ts): baja la
 * versión nueva de Releases con electron-updater, que revisa el sha512 de lo bajado
 * contra el `latest*.yml` publicado, y la instala al cerrar. Cerrar sigue siendo el
 * cierre de siempre: primero los agentes dejan su corte y después se instala.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { T } from '../core/i18n.js'
import { selfUpdates, type UpdateProgress } from '../core/update.js'

/** ¿Esta instalación puede bajar e instalar sola la versión nueva? */
export function canSelfUpdate(): boolean {
  let packageType: string | null = null
  try {
    const file = join(process.resourcesPath, 'package-type')
    if (existsSync(file)) packageType = readFileSync(file, 'utf8').trim()
  } catch {
    // Sin el archivo, es un AppImage o una carpeta suelta.
  }
  return selfUpdates(process.platform, { packaged: app.isPackaged, appImage: process.env.APPIMAGE, packageType })
}

let downloading: Promise<void> | null = null
let ready = false

/** Baja la versión nueva y avisa cómo va. Si ya se está bajando, no empieza otra. */
export function downloadUpdate(report: (p: UpdateProgress) => void): Promise<void> {
  if (ready) {
    report({ phase: 'ready' })
    return Promise.resolve()
  }
  if (downloading) return downloading
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  // Las versiones salen como preliminares: sin esto solo vería las estables, y no hay.
  autoUpdater.allowPrerelease = true
  autoUpdater.logger = null
  // Para probar sin publicar: ORQUEST_ACTUALIZACIONES apunta a una carpeta servida por HTTP con el latest*.yml y los instaladores.
  const feed = process.env.ORQUEST_ACTUALIZACIONES
  if (feed) autoUpdater.setFeedURL({ provider: 'generic', url: feed })
  const progress = (p: { percent: number }) => report({ phase: 'downloading', percent: Math.round(p.percent) })
  autoUpdater.on('download-progress', progress)
  report({ phase: 'downloading', percent: 0 })
  downloading = (async () => {
    try {
      const found = await autoUpdater.checkForUpdates()
      if (!found?.isUpdateAvailable) throw new Error(T`No hay una versión más nueva que bajar.`)
      await autoUpdater.downloadUpdate()
      ready = true
      report({ phase: 'ready' })
    } catch (err) {
      report({ phase: 'error', message: (err as Error).message })
    } finally {
      autoUpdater.off('download-progress', progress)
      downloading = null
    }
  })()
  return downloading
}

/** Ya bajada: se instala en cuanto la app termine de cerrar. */
export const updateReady = () => ready

/** Instala lo bajado y vuelve a abrir la app (en Linux con .deb, pide la contraseña). */
export function installUpdate(): void {
  autoUpdater.quitAndInstall(true, true)
}
