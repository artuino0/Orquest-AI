/**
 * La oficina de píxel para el celular: la misma que dibuja el escritorio. La
 * ventana del escritorio le pasa a la compu exactamente lo que le manda a su
 * oficina (quién está, en qué anda, qué personaje es cada quien, lo que va
 * pasando), y la compu se lo da al celular. Si ese proyecto no está a la vista en
 * el escritorio, se arma aquí con la misma traducción (officefeed) y la misma
 * regla para repartir personajes (el jefe, el 3; los demás, en orden y según su
 * nombre sea de mujer o de hombre).
 */
import { genderOf } from './gender.js'
import { officeState, type OfficeInput } from './officefeed.js'

/** En qué orden se reparten los personajes y de quién parece cada uno (como renderer/src/characters.ts). */
const CAST_ORDER = [4, 2, 1, 5, 6, 7, 8, 3]
const CHARACTER_GENDER: Record<number, 'f' | 'm' | undefined> = { 1: 'm', 2: 'f', 3: 'm', 4: 'f', 5: 'f', 6: undefined, 7: 'm', 8: 'm' }
const DEFAULT_BOSS = 3

/** Personaje de cada quien, por orden de llegada y según su nombre, sin repetir. */
export function castFor(ids: string[], names: Record<string, string>, boss = DEFAULT_BOSS): Record<string, string> {
  const out: Record<string, string> = {}
  const used = new Set<number>([boss])
  for (const id of ids) {
    if (id === 'jefe') {
      out[id] = `CHAR${boss}`
      continue
    }
    const g = genderOf(names[id])
    const free = CAST_ORDER.filter((n) => !used.has(n))
    const pick = (g ? free.find((n) => CHARACTER_GENDER[n] === g) ?? free.find((n) => !CHARACTER_GENDER[n]) : free[0]) ?? CAST_ORDER.filter((n) => n !== boss)[ids.indexOf(id) % 7]
    used.add(pick)
    out[id] = `CHAR${pick}`
  }
  return out
}

/** Lo que va a la oficina: el estado y su lista de personajes. */
export type OfficeMessage = Record<string, unknown>

export class OfficeShare {
  private states = new Map<string, OfficeMessage>()
  private events = new Map<string, { id: number; evento: unknown }[]>()
  private seq = 0

  /** Lo que el escritorio acaba de mandarle a su oficina. */
  setState(root: string, estado: OfficeMessage) {
    this.states.set(root, estado)
  }

  /** Algo que pasó (asignada, entrega, revisión): la oficina lo anima. Se guardan los últimos. */
  addEvent(root: string, evento: unknown) {
    const list = this.events.get(root) ?? []
    list.push({ id: ++this.seq, evento })
    this.events.set(root, list.slice(-30))
  }

  /** La foto de la oficina y lo que pasó desde `since`; sin foto del escritorio, se arma con `fallback`. */
  get(root: string, since: number, fallback: () => OfficeInput): { estado: OfficeMessage; eventos: { id: number; evento: unknown }[]; ultimo: number } {
    let estado = this.states.get(root)
    if (!estado) {
      const input = fallback()
      const state = officeState(input)
      estado = { ...state, sprites: castFor(state.people.map((p) => p.id), input.names) }
    }
    const eventos = (this.events.get(root) ?? []).filter((e) => e.id > since)
    return { estado, eventos, ultimo: this.seq }
  }

  /** El proyecto se cerró en el escritorio: lo que tenía ya no vale. */
  forget(root: string) {
    this.states.delete(root)
    this.events.delete(root)
  }
}
