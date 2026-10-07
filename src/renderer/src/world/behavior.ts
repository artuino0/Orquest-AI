/**
 * Del estado real a lo que se ve. Cada animación sale de un estado; nada es
 * decorado. Lógica pura, sin dibujo.
 */
import { getRoom, route, routeLength, pointAlong, type Desk, type Point } from './layout'

/**
 * Estados del núcleo más los que llegan con el jefe (fase 2) y los límites
 * de uso: esperando dependencia, entregando y descansando.
 */
export type VisualState =
  | 'starting'
  | 'working'
  | 'blocked'
  | 'idle'
  | 'exited'
  | 'waiting'
  | 'delivering'
  | 'resting'
  | 'gaming'

export type Pose = 'walk' | 'type' | 'sit' | 'stand'
export type Bubble = 'alert' | 'clock' | 'check' | 'dots' | 'zzz' | 'game' | null
export type Place = 'desk' | 'beside' | 'boss' | 'cafeteria' | 'arcade' | 'exit'

export interface Look {
  place: Place
  /** Pose al llegar; mientras camina siempre es 'walk'. */
  pose: Pose
  bubble: Bubble
  monitor: 'off' | 'on' | 'blink'
  label: string
}

export const LOOKS: Record<VisualState, Look> = {
  starting: { place: 'desk', pose: 'sit', bubble: null, monitor: 'on', label: 'llegando' },
  working: { place: 'desk', pose: 'type', bubble: null, monitor: 'blink', label: 'trabajando' },
  blocked: { place: 'desk', pose: 'stand', bubble: 'alert', monitor: 'on', label: 'bloqueado: te necesita' },
  idle: { place: 'desk', pose: 'sit', bubble: 'dots', monitor: 'on', label: 'esperando instrucción' },
  waiting: { place: 'beside', pose: 'stand', bubble: 'clock', monitor: 'off', label: 'esperando a otro' },
  delivering: { place: 'boss', pose: 'stand', bubble: 'check', monitor: 'off', label: 'listo para revisar' },
  resting: { place: 'cafeteria', pose: 'sit', bubble: 'zzz', monitor: 'off', label: 'descansando' },
  // Burnout: limpia su contexto. De espaldas, moviendo las manos en la maquinita.
  gaming: { place: 'arcade', pose: 'type', bubble: 'game', monitor: 'off', label: 'jugando videojuegos (limpia contexto)' },
  exited: { place: 'exit', pose: 'stand', bubble: null, monitor: 'off', label: 'se fue' },
}

/** Punto de entrada al estudio: la puerta de Recepción. */
export function entrance(): Point {
  const r = getRoom('recepcion')
  return { x: r.x + 2, y: r.y + 4 }
}

export interface PlaceContext {
  desk: Desk
  /** Escritorio de quien bloquea, para 'waiting'. */
  dependencyDesk?: Desk
  /** Lugar libre en la cafetería, para 'resting'. */
  slot?: number
}

export function placePoint(place: Place, ctx: PlaceContext): Point {
  switch (place) {
    case 'desk':
      return ctx.desk.seat
    case 'beside': {
      const d = ctx.dependencyDesk ?? ctx.desk
      return { x: d.seat.x + 1, y: d.seat.y }
    }
    case 'boss': {
      const r = getRoom('jefe')
      // Frente al escritorio del jefe, en fila.
      return { x: r.x + 3 + ((ctx.slot ?? 0) % 7), y: r.y + 5 }
    }
    case 'cafeteria': {
      const r = getRoom('cafeteria')
      const i = ctx.slot ?? 0
      return { x: r.x + 2 + (i % 4) * 2, y: r.y + 2 + Math.floor(i / 4) * 2 }
    }
    case 'arcade': {
      // Frente a las maquinitas de la Cafetería.
      const r = getRoom('cafeteria')
      return { x: r.x + 8 + ((ctx.slot ?? 0) % 3), y: r.y + 5 }
    }
    case 'exit':
      return entrance()
  }
}

/** Casillas por segundo. */
export const WALK_SPEED = 6

/**
 * Un personaje en el mapa. Cuando cambia su destino calcula la ruta desde donde
 * está y camina; al llegar toma la pose del estado. Al salir desaparece.
 */
export class Actor {
  pos: Point
  private path: Point[] = []
  private walked = 0
  private target: Point
  state: VisualState = 'starting'
  /** Ya se fue del estudio: quien dibuja lo quita. */
  gone = false

  constructor(
    public id: string,
    public ctx: PlaceContext,
  ) {
    // Todos entran por Recepción y caminan a su escritorio.
    this.pos = entrance()
    this.target = this.pos
    this.setState('starting')
  }

  get look(): Look {
    return LOOKS[this.state]
  }

  get walking(): boolean {
    return this.path.length > 0
  }

  get pose(): Pose {
    return this.walking ? 'walk' : this.look.pose
  }

  setState(state: VisualState, ctx?: Partial<PlaceContext>) {
    if (this.gone) return
    this.state = state
    if (ctx) this.ctx = { ...this.ctx, ...ctx }
    const next = placePoint(this.look.place, this.ctx)
    if (next.x === this.target.x && next.y === this.target.y) return
    this.target = next
    this.path = route(this.pos, next)
    this.walked = 0
  }

  update(dtSeconds: number) {
    if (!this.walking) return
    this.walked += WALK_SPEED * dtSeconds
    const total = routeLength(this.path)
    if (this.walked >= total) {
      this.pos = this.path[this.path.length - 1]
      this.path = []
      if (this.state === 'exited') this.gone = true
    } else {
      this.pos = pointAlong(this.path, this.walked)
    }
  }

  /** Hacia dónde mira mientras camina, para voltear el sprite. */
  facing(): 'left' | 'right' {
    if (!this.walking) return 'right'
    const ahead = pointAlong(this.path, this.walked + 0.1)
    return ahead.x < this.pos.x ? 'left' : 'right'
  }
}
