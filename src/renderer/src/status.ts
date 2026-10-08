/** Cómo se nombra y de qué color va cada estado de un empleado en los paneles. */
import type { Employee, StudioSnapshot } from '../../shared/ipc'

export type Look = 'working' | 'blocked' | 'waiting' | 'delivering' | 'gaming' | 'idle' | 'starting' | 'exited'

/** Etiqueta y ficha de color (`--st-<color>`) de cada estado. */
export const LOOK: Record<Look, { label: string; color: string }> = {
  working: { label: 'Trabajando', color: 'work' },
  blocked: { label: 'Te necesita', color: 'block' },
  waiting: { label: 'Esperando a otro', color: 'dep' },
  delivering: { label: 'Lista para revisar', color: 'review' },
  gaming: { label: 'Jugando', color: 'play' },
  idle: { label: 'En espera', color: 'idle' },
  starting: { label: 'Llegando', color: 'arrive' },
  exited: { label: 'Fuera', color: 'arrive' },
}

/**
 * Lo que se ve de un empleado: su terminal manda mientras trabaja o pide algo;
 * si está en espera, el tablero dice si espera a otro o lleva su entrega.
 */
export function lookOf(e: Pick<Employee, 'id' | 'state'>, hints: StudioSnapshot['hints'] | undefined): Look {
  const h = hints?.[e.id]
  // Jugando gana siempre: su CLI se está reiniciando.
  if (h?.state === 'gaming') return 'gaming'
  const quiet = e.state === 'idle' || e.state === 'starting'
  if (quiet && h?.state === 'waiting') return 'waiting'
  if (quiet && h?.state === 'delivering') return 'delivering'
  return e.state
}

/** Cómo se le dice a cada nivel de esfuerzo. Cuáles hay depende de cada CLI (CliStatus.efforts). */
export const EFFORT_LABEL: Record<string, string> = { low: 'Bajo', medium: 'Medio', high: 'Alto', xhigh: 'Muy alto', max: 'Máximo' }
