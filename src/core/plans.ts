/**
 * Los planes del jefe: lo que piensa hacer, guardado como Markdown en
 * `<repo>/.orquest/planes/`. Los escribe con la herramienta `guardar_plan`, así
 * no dependen de los permisos de su CLI, siguen ahí cuando se reinicia y el
 * usuario los lee en Planes y en los archivos del jefe. Van junto a las
 * bitácoras, fuera de git: no ensucian el repo ni se integran por accidente.
 */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RuleError } from './board.js'
import { slug } from './names.js'

/** Dentro del repo, con diagonales. */
export const PLANS_DIR = '.orquest/planes'
const MIN_TEXT = 40
const MAX_TEXT = 200_000
const MAX_TITLE = 80

export interface Plan {
  /** Ruta dentro del repo, con diagonales. */
  file: string
  title: string
  /** Última vez que se guardó. */
  at: number
  size: number
}

const firstHeading = (text: string) => /^#\s+(.+)$/m.exec(text)?.[1]?.trim()

/**
 * Guarda un plan. El título decide el archivo: guardar otra vez con el mismo
 * título lo reemplaza, que es como se actualiza.
 */
export async function savePlan(root: string, title: string, text: string): Promise<Plan> {
  const name = title.trim().replace(/\s+/g, ' ')
  if (name.length < 3) throw new RuleError('El plan necesita un título que diga de qué trata.')
  if (name.length > MAX_TITLE) throw new RuleError(`El título del plan es muy largo (máximo ${MAX_TITLE} caracteres); el detalle va en el contenido.`)
  const body = text.trim()
  if (body.length < MIN_TEXT) throw new RuleError('El plan va casi vacío: escribe los pasos, quién hace cada uno y qué depende de qué.')
  if (body.length > MAX_TEXT) throw new RuleError('El plan es demasiado largo para un solo archivo: pártelo en varios.')
  const dir = join(root, ...PLANS_DIR.split('/'))
  await mkdir(dir, { recursive: true })
  const file = `${slug(name).slice(0, 60) || 'plan'}.md`
  // Siempre con su título arriba: es lo que se lee en la lista.
  const content = `${firstHeading(body) ? body : `# ${name}\n\n${body}`}\n`
  await writeFile(join(dir, file), content, 'utf8')
  return { file: `${PLANS_DIR}/${file}`, title: firstHeading(content) ?? name, at: Date.now(), size: Buffer.byteLength(content) }
}

/** Los planes guardados, el más reciente primero. */
export async function listPlans(root: string): Promise<Plan[]> {
  const dir = join(root, ...PLANS_DIR.split('/'))
  const names = await readdir(dir).catch(() => [] as string[])
  const plans: Plan[] = []
  for (const name of names) {
    if (!/\.md$/i.test(name)) continue
    const full = join(dir, name)
    const info = await stat(full).catch(() => null)
    if (!info?.isFile()) continue
    // Con el principio basta para dar con el título.
    const head = (await readFile(full, 'utf8').catch(() => '')).slice(0, 2000)
    plans.push({ file: `${PLANS_DIR}/${name}`, title: firstHeading(head) ?? name.replace(/\.md$/i, ''), at: info.mtimeMs, size: info.size })
  }
  return plans.sort((a, b) => b.at - a.at)
}
