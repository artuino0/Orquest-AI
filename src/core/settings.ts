/**
 * Ajustes del usuario que valen para toda la app, en `<userData>/ajustes.json`.
 * Hoy solo el idioma: sin elegir ninguno, la app usa el del sistema.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { LANGS, pickLang, type Lang } from './i18n.js'

export interface Settings {
  /** El idioma que eligió el usuario; sin él manda el del sistema. */
  lang?: Lang
}

/** Lo guardado; un archivo que falta o está roto cuenta como sin ajustes. */
export async function loadSettings(file: string): Promise<Settings> {
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as Settings
    return LANGS.includes(raw.lang as Lang) ? { lang: raw.lang } : {}
  } catch {
    return {}
  }
}

export async function saveSettings(file: string, settings: Settings): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

/** El idioma con que arranca la app: el elegido o, si no, el primero del sistema que hable. */
export const startLang = (settings: Settings, system: readonly string[]): Lang => settings.lang ?? pickLang(system)
