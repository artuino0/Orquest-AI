/**
 * Modo creativo: qué le hace cada herramienta al mapa. Lógica pura; la escena
 * solo avisa en qué casilla se apretó y se soltó, y aquí se decide el cambio.
 */
import {
  getPiece,
  itemRect,
  paintFloor,
  paintWall,
  placeItem,
  rectOf,
  removeItemAt,
  toggleDoor,
  wallAt,
  type Item,
  type OfficeMap,
  type Point,
  type Rect,
} from './map'

export type Tool =
  /** Pinta piso en un rectángulo; con id vacío lo quita. */
  | { type: 'floor'; id: string }
  /** Traza un muro recto; con id vacío lo quita. */
  | { type: 'wall'; id: string }
  /** Abre o cierra una puerta en un muro. */
  | { type: 'door' }
  | { type: 'item'; piece: string; flip?: boolean }
  /** Quita muebles; en una sola casilla sin muebles, quita el muro. */
  | { type: 'erase' }

/** Se arrastra de una casilla a otra; las demás actúan donde se suelta. */
export const drags = (t: Tool) => t.type === 'floor' || t.type === 'wall' || t.type === 'erase'

/** Dónde queda una pieza si el cursor está en esa casilla: el cursor va en su base, al centro. */
export function itemAt(piece: string, tile: Point, flip?: boolean): Item {
  const p = getPiece(piece)
  const w = p?.w ?? 1
  const h = p?.h ?? 1
  return { piece, x: tile.x - Math.floor((w - 1) / 2), y: tile.y - (h - 1), ...(flip && { flip }) }
}

/** Casillas que tocaría la herramienta entre donde se apretó y donde va el cursor. */
export function toolRect(tool: Tool, from: Point, to: Point): Rect {
  if (tool.type === 'item') return itemRect(itemAt(tool.piece, to))
  if (tool.type === 'door') return { ...to, w: 1, h: 1 }
  if (tool.type === 'wall') {
    // Un muro es una línea: manda la dirección en que más se arrastró.
    const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)
    return rectOf(from, horizontal ? { x: to.x, y: from.y } : { x: from.x, y: to.y })
  }
  return rectOf(from, to)
}

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Aplica la herramienta y devuelve un mapa nuevo; el que recibe queda igual (sirve para deshacer). */
export function applyTool(map: OfficeMap, tool: Tool, from: Point, to: Point): OfficeMap {
  const m: OfficeMap = structuredClone(map)
  const r = toolRect(tool, from, to)
  switch (tool.type) {
    case 'floor':
      paintFloor(m, r, tool.id)
      break
    case 'wall':
      paintWall(m, r, tool.id)
      break
    case 'door':
      toggleDoor(m, to.x, to.y)
      break
    case 'item':
      placeItem(m, itemAt(tool.piece, to, tool.flip))
      break
    case 'erase': {
      const before = m.items.length
      m.items = m.items.filter((i) => !overlap(itemRect(i), r))
      if (m.items.length === before && r.w === 1 && r.h === 1) {
        if (wallAt(m, r.x, r.y)) paintWall(m, r, '')
        else removeItemAt(m, r.x, r.y)
      }
      break
    }
  }
  return m
}
