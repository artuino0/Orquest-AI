/**
 * Plano de la oficina en casillas. Lógica pura: dónde está cada cuarto, sus
 * puertas, los escritorios y por dónde se camina. El dibujo vive en scene.ts.
 *
 *   ┌hall┐┌Recepción──┐┌Jefe──────┐┌Cafetería─┐
 *   │    │└────door───┘└───door───┘└───door───┘
 *   │    │  pasillo A
 *   │    │┌───door────┐┌───door───┐┌───door───┐
 *   │    │└Desarrollo─┘└Backend───┘└Frontend──┘
 *   │    │  pasillo B
 *   │    │┌───door────┐┌───door───┐┌───door───┐
 *   └────┘└DBA────────┘└Infra─────┘└QA────────┘
 */

export const TILE = 16

export type Department = 'desarrollo' | 'backend' | 'frontend' | 'dba' | 'infra' | 'qa'
export const DEPARTMENTS: Department[] = ['desarrollo', 'backend', 'frontend', 'dba', 'infra', 'qa']

export type RoomKind = 'reception' | 'boss' | 'cafeteria' | 'department'

export interface Point {
  x: number
  y: number
}

export interface Room {
  id: string
  name: string
  kind: RoomKind
  dept?: Department
  /** Rectángulo interior en casillas (sin muros). */
  x: number
  y: number
  w: number
  h: number
  /** Casilla de la puerta, dentro del cuarto, junto al pasillo. */
  door: Point
  /** Fila central del pasillo al que da la puerta. */
  corridorY: number
}

const ROOM_W = 12
const ROOM_H = 8
const HALL_W = 3
const CORRIDOR_H = 3
/** Columna central del pasillo vertical que une los pasillos A y B. */
export const HALL_X = 1

function room(
  id: string,
  name: string,
  kind: RoomKind,
  col: number,
  row: number,
  dept?: Department,
): Room {
  const x = HALL_W + col * (ROOM_W + 1)
  const y = row * (ROOM_H + CORRIDOR_H)
  const doorOnTop = row > 0
  const doorY = doorOnTop ? y : y + ROOM_H - 1
  const corridorY = row === 0 ? y + ROOM_H + 1 : y - 2
  return { id, name, kind, dept, x, y, w: ROOM_W, h: ROOM_H, door: { x: x + ROOM_W / 2, y: doorY }, corridorY }
}

export const ROOMS: Room[] = [
  room('recepcion', 'Recepción', 'reception', 0, 0),
  room('jefe', 'Oficina del Jefe', 'boss', 1, 0),
  room('cafeteria', 'Cafetería', 'cafeteria', 2, 0),
  room('desarrollo', 'Desarrollo', 'department', 0, 1, 'desarrollo'),
  room('backend', 'Backend', 'department', 1, 1, 'backend'),
  room('frontend', 'Frontend', 'department', 2, 1, 'frontend'),
  room('dba', 'DBA', 'department', 0, 2, 'dba'),
  room('infra', 'Infra', 'department', 1, 2, 'infra'),
  room('qa', 'QA', 'department', 2, 2, 'qa'),
]

export const MAP_W = HALL_W + 3 * (ROOM_W + 1)
export const MAP_H = 3 * ROOM_H + 2 * CORRIDOR_H

export function getRoom(id: string): Room {
  const r = ROOMS.find((x) => x.id === id)
  if (!r) throw new Error(`Cuarto desconocido: ${id}`)
  return r
}

/** Puesto → departamento. Un puesto que no conocemos va a Desarrollo. */
export function departmentFor(role: string): Department {
  const r = role.toLowerCase()
  return (DEPARTMENTS as string[]).includes(r) ? (r as Department) : 'desarrollo'
}

export function roomForDepartment(dept: Department): Room {
  return ROOMS.find((r) => r.dept === dept)!
}

export interface Desk {
  room: Room
  index: number
  /** Casilla del escritorio (mueble). */
  desk: Point
  /** Casilla donde se sienta el empleado, debajo del escritorio. */
  seat: Point
}

export const DESKS_PER_ROOM = 8

/** Fila libre junto a la puerta, por donde se camina dentro del cuarto. */
export function aisleY(room: Room): number {
  return room.door.y === room.y ? room.y + 1 : room.y + room.h - 2
}

/**
 * Ocho escritorios por cuarto en dos filas de cuatro. La columna de la puerta
 * y la de junto a cada escritorio quedan libres para caminar.
 */
export function deskAt(room: Room, index: number): Desk {
  const col = [2, 4, 8, 10][index % 4]
  const row = Math.floor(index / 4) % 2
  const doorOnTop = room.door.y === room.y
  const baseY = doorOnTop ? room.y + 2 : room.y + 1
  const desk = { x: room.x + col, y: baseY + row * 3 }
  return { room, index, desk, seat: { x: desk.x, y: desk.y + 1 } }
}

/** Escritorio del jefe: el grande de su oficina. */
export function bossDesk(): Desk {
  const room = getRoom('jefe')
  const desk = { x: room.x + 6, y: room.y + 2 }
  return { room, index: 0, desk, seat: { x: desk.x, y: desk.y + 1 } }
}

/**
 * Reparte escritorios conservando los ya asignados: nadie cambia de lugar
 * cuando entra o sale alguien. Si un cuarto se llena, los nuevos comparten
 * escritorio en orden (el mapa crece en fases posteriores).
 */
export function assignDesks(
  employees: { id: string; role: string }[],
  previous: Map<string, number> = new Map(),
): Map<string, Desk> {
  const taken = new Map<string, Set<number>>()
  const result = new Map<string, Desk>()
  const pending: { id: string; room: Room }[] = []

  for (const e of employees) {
    if (e.role === 'jefe') {
      result.set(e.id, bossDesk())
      continue
    }
    const room = roomForDepartment(departmentFor(e.role))
    const prev = previous.get(e.id)
    const used = taken.get(room.id) ?? new Set<number>()
    taken.set(room.id, used)
    if (prev !== undefined && !used.has(prev)) {
      used.add(prev)
      result.set(e.id, deskAt(room, prev))
    } else {
      pending.push({ id: e.id, room })
    }
  }
  for (const { id, room } of pending) {
    const used = taken.get(room.id)!
    let i = 0
    while (used.has(i) && i < DESKS_PER_ROOM) i++
    if (i === DESKS_PER_ROOM) i = used.size % DESKS_PER_ROOM
    used.add(i)
    result.set(id, deskAt(room, i))
  }
  return result
}

/** Cuarto que contiene la casilla, si hay alguno. */
export function roomAt(p: Point): Room | undefined {
  return ROOMS.find((r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h)
}

/** Del punto a la puerta y al pasillo, sin atravesar escritorios. */
function wayOut(room: Room, p: Point): Point[] {
  const aisle = aisleY(room)
  const side = { x: p.x + 1, y: p.y }
  return [p, side, { x: side.x, y: aisle }, { x: room.door.x, y: aisle }, room.door, { x: room.door.x, y: room.corridorY }]
}

/**
 * Ruta en casillas entre dos puntos: sale por la puerta, recorre su pasillo,
 * cruza por el pasillo vertical si cambia de pasillo y entra por la otra
 * puerta. Devuelve solo las esquinas; quien anima interpola en línea recta.
 */
export function route(from: Point, to: Point): Point[] {
  const a = roomAt(from)
  const b = roomAt(to)
  if (a && b && a.id === b.id) {
    const aisle = aisleY(a)
    return [from, { x: from.x + 1, y: from.y }, { x: from.x + 1, y: aisle }, { x: to.x + 1, y: aisle }, { x: to.x + 1, y: to.y }, to].filter(dedupe())
  }
  const pts: Point[] = a ? wayOut(a, from) : [from]
  let y = pts[pts.length - 1].y
  const back = b ? wayOut(b, to).reverse() : [to]
  const targetY = back[0].y
  if (y !== targetY) {
    pts.push({ x: HALL_X, y: pts[pts.length - 1].y }, { x: HALL_X, y: targetY })
    y = targetY
  }
  pts.push({ x: back[0].x, y }, ...back)
  return pts.filter(dedupe())
}

function dedupe() {
  let last: Point | undefined
  return (p: Point) => {
    const keep = !last || last.x !== p.x || last.y !== p.y
    last = p
    return keep
  }
}

export function routeLength(pts: Point[]): number {
  let d = 0
  for (let i = 1; i < pts.length; i++) d += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y)
  return d
}

/** Posición a una distancia recorrida sobre la ruta (en casillas). */
export function pointAlong(pts: Point[], dist: number): Point {
  let left = dist
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    if (left <= seg) {
      const t = seg === 0 ? 1 : left / seg
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    left -= seg
  }
  return pts[pts.length - 1]
}
