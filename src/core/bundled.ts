/** Skills de Orquest incluidas en la app; se leen en el idioma activo. */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { getLang } from './i18n.js'

export const BUNDLED_IDS = ['orquest-clean-code', 'orquest-seguridad', 'orquest-arquitectura', 'orquest-qa'] as const
export const isBundledSkill = (id: string): boolean => (BUNDLED_IDS as readonly string[]).includes(id)

/** Cada skill puede recurrir al español si aún no tiene el idioma activo. */
export async function bundledDirectory(root: string, id: string): Promise<string | undefined> {
  if (!isBundledSkill(id)) return undefined
  for (const lang of new Set([getLang(), 'es'])) {
    const dir = join(root, lang, id)
    if (await stat(join(dir, 'SKILL.md')).then((s) => s.isFile(), () => false)) return dir
  }
  return undefined
}

/** Conserva también recursos binarios y subcarpetas; no sigue enlaces. */
export async function bundledWorkspaceFiles(root: string | undefined, ids: readonly string[]): Promise<Record<string, string | Uint8Array>> {
  const files: Record<string, string | Uint8Array> = {}
  if (!root) return files
  for (const id of new Set(ids.filter(isBundledSkill))) {
    const dir = await bundledDirectory(root, id)
    if (!dir) continue
    const target = `.claude/skills/${id}`
    const walk = async (source: string, dest: string): Promise<void> => {
      for (const entry of await readdir(source, { withFileTypes: true })) {
        if (entry.isDirectory()) await walk(join(source, entry.name), `${dest}/${entry.name}`)
        else if (entry.isFile()) files[`${dest}/${entry.name}`] = await readFile(join(source, entry.name))
      }
    }
    await walk(dir, target)
    files[`${target}/.orquest-bundled`] = '1'
  }
  return files
}
