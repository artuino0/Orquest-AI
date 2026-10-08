/**
 * Plano vivo de la oficina: el que sale del mapa que dibujó el usuario
 * (map.ts). Aquí se reparte a cada quien su puesto (cualquiera sirve para
 * cualquier rol) y se pregunta por dónde se camina y dónde queda cada lugar.
 * Cambiar el mapa cambia el plano; quien dibuja (scene.ts) y quien decide qué
 * se ve (behavior.ts) leen de aquí.
 */
import {
  arcadeSpot as arcadeIn,
  buildPlan,
  cafeSeat as cafeIn,
  exampleMap,
  queueSpot,
  route as routeIn,
  standSpot,
  virtualDesk,
  type Desk,
  type OfficeMap,
  type Plan,
  type Point,
  type Seat,
} from './map'

export { pointAlong, routeLength, TILE } from './map'
export type { Desk, Point, Seat } from './map'

let current: Plan = buildPlan(exampleMap())

/** Pone otra oficina. Los que ya están adentro se reacomodan la próxima vez que se repartan puestos. */
export function setMap(map: OfficeMap) {
  current = buildPlan(map)
}

export function plan(): Plan {
  return current
}

/** Roles que el tablero y la contratación agrupan. En la oficina no son áreas: el rol lo trae cada quien. */
export type Department = 'desarrollo' | 'backend' | 'frontend' | 'dba' | 'infra' | 'qa'
export const DEPARTMENTS: Department[] = ['desarrollo', 'backend', 'frontend', 'dba', 'infra', 'qa']

/** Rol → grupo del tablero. Uno que no conocemos va con Desarrollo. */
export function departmentFor(role: string): Department {
  const r = role.toLowerCase()
  return (DEPARTMENTS as string[]).includes(r) ? (r as Department) : 'desarrollo'
}

/**
 * Reparte puestos conservando los ya asignados: nadie cambia de lugar cuando
 * entra o sale alguien. Nadie comparte escritorio: quien no alcanza puesto
 * espera de pie cerca de la entrada, cada quien en su lugar.
 */
export function assignDesks(employees: { id: string; role: string }[], previous: Map<string, number> = new Map()): Map<string, Desk> {
  const desks = current.desks
  const used = new Set<number>()
  const result = new Map<string, Desk>()
  const pending: string[] = []
  const standing: Point[] = []
  const stand = (id: string) => {
    const d = virtualDesk(current, standing)
    standing.push(d.seat)
    result.set(id, d)
  }

  for (const e of employees) {
    if (e.role === 'jefe') {
      if (current.boss) result.set(e.id, current.boss)
      else stand(e.id)
      continue
    }
    const prev = previous.get(e.id)
    if (prev !== undefined && prev >= 0 && prev < desks.length && !used.has(prev)) {
      used.add(prev)
      result.set(e.id, desks[prev])
    } else {
      pending.push(e.id)
    }
  }
  for (const id of pending) {
    let i = 0
    while (used.has(i)) i++
    if (i >= desks.length) {
      stand(id)
      continue
    }
    used.add(i)
    result.set(id, desks[i])
  }
  return result
}

/**
 * Dónde se para cada quien que espera a otro: cerca del escritorio de quien lo
 * bloquea, sin encimarse con él ni con los demás que esperan.
 */
export function waitingSpots(waits: { id: string; near: Point }[]): Map<string, Point> {
  const taken: Point[] = []
  const out = new Map<string, Point>()
  for (const w of waits) {
    const spot = standSpot(current, w.near, taken)
    taken.push(spot)
    out.set(w.id, spot)
  }
  return out
}

/** Por donde llega cada contratado y se va cada despedido. */
export function entrance(): Point {
  return current.entrance
}

/** Dónde espera quien lleva su entrega al jefe. */
export function bossQueue(slot: number): Point {
  return queueSpot(current, slot)
}

/** Silla de la Cafetería para quien descansa. */
export function cafeSeat(slot: number): Seat {
  return cafeIn(current, slot)
}

/** Donde se para quien juega: frente a su maquinita. */
export function arcadeSpot(slot: number): Point {
  return arcadeIn(current, slot)
}

export function route(from: Point, to: Point): Point[] {
  return routeIn(current, from, to)
}
