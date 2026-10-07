/**
 * Bitácora de cada empleado: un markdown en `<repo>/.orquest/bitacoras/<id>.md`,
 * fuera de git (como las oficinas) para que no se cuele en los merges.
 *
 * Dos partes:
 * - Traspaso: lo escribe el empleado (herramienta escribir_traspaso) antes de
 *   descansar o cuando se le pide. Decisiones, pendientes, trampas. Es su
 *   versión: quien la lee la toma como contexto, no como verdad.
 * - Hechos: los escribe Orquest (tareas, entregas, QA, integraciones). Confiables.
 *
 * Tiene tope: si la bitácora creciera sin límite llenaría el contexto que
 * queremos limpiar. Se guardan los últimos hechos y un traspaso acotado.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const MAX_FACTS = 60
export const MAX_HANDOFF = 6000

export interface JournalOwner {
  id: string
  name: string
  role: string
  provider: string
  model?: string
}

interface Parsed {
  handoff: string
  facts: string[]
}

const HANDOFF = '## Traspaso'
const FACTS = '## Hechos'

export class Journal {
  /** Una escritura a la vez por bitácora: leer, cambiar y escribir no se pisan. */
  private chains = new Map<string, Promise<unknown>>()

  constructor(private root: string) {}

  private serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const next = (this.chains.get(id) ?? Promise.resolve()).catch(() => {}).then(fn)
    this.chains.set(id, next)
    return next
  }

  dir(): string {
    return join(this.root, '.orquest', 'bitacoras')
  }

  path(id: string): string {
    return join(this.dir(), `${id}.md`)
  }

  async read(id: string): Promise<string> {
    return readFile(this.path(id), 'utf8').catch(() => '')
  }

  private async parse(id: string): Promise<Parsed> {
    const text = await this.read(id)
    const h = text.indexOf(HANDOFF)
    const f = text.indexOf(FACTS)
    const handoff = h >= 0 ? text.slice(h + HANDOFF.length, f > h ? f : undefined).replace(/^[^\n]*\n/, '').trim() : ''
    const facts =
      f >= 0
        ? text
            .slice(f + FACTS.length)
            .split('\n')
            .filter((l) => l.startsWith('- '))
        : []
    return { handoff, facts }
  }

  private async write(owner: JournalOwner, p: Parsed) {
    await mkdir(this.dir(), { recursive: true })
    const who = `${owner.role} · ${owner.provider}${owner.model ? ` ${owner.model}` : ''}`
    const body = [
      `# Bitácora de ${owner.name} (${who})`,
      '',
      `${HANDOFF} (lo escribe ${owner.name}; es su versión, no verdad)`,
      '',
      p.handoff || '_Aún no hay traspaso._',
      '',
      `${FACTS} (los escribe Orquest)`,
      '',
      ...p.facts.slice(-MAX_FACTS),
      '',
    ].join('\n')
    await writeFile(this.path(owner.id), body)
  }

  /** Crea la bitácora si no existe. */
  open(owner: JournalOwner) {
    return this.serial(owner.id, async () => this.write(owner, await this.parse(owner.id)))
  }

  fact(owner: JournalOwner, text: string, at = new Date()) {
    return this.serial(owner.id, async () => {
      const p = await this.parse(owner.id)
      const stamp = at.toISOString().slice(0, 16).replace('T', ' ')
      p.facts.push(`- ${stamp} · ${text.replace(/\s*\n\s*/g, ' ')}`)
      await this.write(owner, p)
    })
  }

  /** Reemplaza el traspaso. Rechaza los que no caben: hay que resumir. */
  async handoff(owner: JournalOwner, text: string) {
    const clean = text.trim()
    if (!clean) throw new Error('El traspaso está vacío.')
    if (clean.length > MAX_HANDOFF) {
      throw new Error(`El traspaso tiene ${clean.length} caracteres; el máximo es ${MAX_HANDOFF}. Resume: decisiones, pendientes y trampas.`)
    }
    return this.serial(owner.id, async () => {
      const p = await this.parse(owner.id)
      p.handoff = clean
      await this.write(owner, p)
    })
  }
}
