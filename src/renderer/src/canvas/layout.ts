/**
 * El lienzo como dato: paneles con su lugar en un plano sin bordes y la cámara
 * que lo mira. Puro, sin DOM: lo usa el store del lienzo y lo prueban en
 * `test/canvas.test.ts`.
 *
 * La cámara convierte el plano en pantalla así: pantalla = plano × zoom + (x, y).
 * El plano no tiene límites: crece hacia donde se muevan los paneles.
 */

export interface Point {
  x: number
  y: number
}
export interface Size {
  w: number
  h: number
}
export interface Rect extends Point, Size {}
export interface Camera extends Point {
  zoom: number
}

/** Qué muestra un panel. Los que llevan `ref` son de alguien (un empleado, su versión). */
export type PanelKind = 'office' | 'boss' | 'employee' | 'version' | 'editor' | 'usage' | 'hire' | 'board' | 'inbox' | 'library' | 'plans' | 'accounts' | 'mobile'

export interface Panel extends Rect {
  id: string
  kind: PanelKind
  /** De quién es (id del empleado), para los paneles de una persona. */
  ref?: string
  /** Orden de apilado: el último que tocaste queda encima. */
  z: number
  /** Minimizado: solo se ve su encabezado. */
  min?: boolean
}

/** Cuadrícula a la que se acomodan los paneles al soltarlos. */
export const GRID = 16
/** Espacio entre paneles al buscarles lugar o al ordenarlos. */
export const GAP = 32
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 2
/** Alto del encabezado de un panel: lo que queda a la vista al minimizarlo. */
export const HEADER_H = 36
export const MIN_SIZE: Size = { w: 300, h: 180 }

/** Tamaño con que nace cada panel. */
export const SIZES: Record<PanelKind, Size> = {
  office: { w: 960, h: 592 },
  // Como su ventana de siempre: la conversación y, a la derecha, quién es y lo que espera de ti.
  boss: { w: 912, h: 704 },
  employee: { w: 656, h: 640 },
  version: { w: 576, h: 528 },
  editor: { w: 960, h: 592 },
  usage: { w: 336, h: 416 },
  hire: { w: 1008, h: 656 },
  board: { w: 1008, h: 624 },
  inbox: { w: 864, h: 624 },
  library: { w: 1008, h: 656 },
  plans: { w: 864, h: 624 },
  accounts: { w: 752, h: 576 },
  mobile: { w: 672, h: 608 },
}

/** Orden al «Ordenar»: la oficina y el jefe primero, luego la gente y lo demás. */
const ORDER: PanelKind[] = ['office', 'boss', 'employee', 'version', 'editor', 'hire', 'board', 'inbox', 'plans', 'library', 'accounts', 'mobile', 'usage']

export const panelId = (kind: PanelKind, ref?: string) => (ref ? `${kind}:${ref}` : kind)
export const snap = (v: number, g = GRID) => Math.round(v / g) * g
export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

/** Lo que ocupa un panel a la vista: minimizado, solo su encabezado. */
export const shapeOf = (p: Panel): Rect => ({ x: p.x, y: p.y, w: p.w, h: p.min ? HEADER_H : p.h })

export function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
}

/** El rectángulo que abarca todos; null si no hay ninguno. */
export function bounds(rects: Rect[]): Rect | null {
  if (!rects.length) return null
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  const right = Math.max(...rects.map((r) => r.x + r.w))
  const bottom = Math.max(...rects.map((r) => r.y + r.h))
  return { x, y, w: right - x, h: bottom - y }
}

/**
 * El primer hueco libre para un panel nuevo, sin tapar a nadie. Con `anchor`
 * (el panel del que sale, por ejemplo la oficina al abrir a alguien) se busca
 * a su lado, empezando por la derecha; sin él, cerca de `around`.
 */
export function freeSpot(taken: Rect[], size: Size, anchor?: Rect, around?: Point): Point {
  const fits = (p: Point) => !taken.some((r) => overlaps({ ...p, ...size }, r, GAP - 1))
  const starts: Point[] = anchor
    ? [
        { x: anchor.x + anchor.w + GAP, y: anchor.y },
        { x: anchor.x, y: anchor.y + anchor.h + GAP },
        { x: anchor.x - size.w - GAP, y: anchor.y },
        { x: anchor.x, y: anchor.y - size.h - GAP },
      ]
    : [{ x: (around?.x ?? 0) - size.w / 2, y: (around?.y ?? 0) - size.h / 2 }]
  for (const s of starts) {
    const p = { x: snap(s.x), y: snap(s.y) }
    if (fits(p)) return p
  }
  // Nada justo al lado: se busca en anillos cada vez más lejos del primer lugar, el más cercano primero.
  const origin = { x: snap(starts[0].x), y: snap(starts[0].y) }
  const step = GRID * 4
  for (let ring = 1; ring < 80; ring++) {
    const ringSpots: Point[] = []
    for (let i = -ring; i <= ring; i++) {
      ringSpots.push({ x: origin.x + i * step, y: origin.y - ring * step }, { x: origin.x + i * step, y: origin.y + ring * step })
      if (i > -ring && i < ring) ringSpots.push({ x: origin.x - ring * step, y: origin.y + i * step }, { x: origin.x + ring * step, y: origin.y + i * step })
    }
    ringSpots.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y))
    const hit = ringSpots.find(fits)
    if (hit) return hit
  }
  // El plano no se acaba: abajo de todo siempre cabe.
  const all = bounds(taken)
  return { x: snap(all?.x ?? 0), y: snap((all ? all.y + all.h : 0) + GAP) }
}

/** La cámara que encuadra `r` en una vista de `view`, sin pasar de `maxZoom`. */
export function fitCamera(r: Rect, view: Size, pad = 48, maxZoom = 1): Camera {
  const zoom = clampZoom(Math.min(maxZoom, (view.w - pad * 2) / Math.max(1, r.w), (view.h - pad * 2) / Math.max(1, r.h)))
  return { zoom, x: view.w / 2 - (r.x + r.w / 2) * zoom, y: view.h / 2 - (r.y + r.h / 2) * zoom }
}

/** Cambia el zoom dejando quieto el punto del plano que está bajo `screen` (el cursor). */
export function zoomAt(cam: Camera, zoom: number, screen: Point): Camera {
  const z = clampZoom(zoom)
  const world = toWorld(cam, screen)
  return { zoom: z, x: screen.x - world.x * z, y: screen.y - world.y * z }
}

export const toWorld = (cam: Camera, p: Point): Point => ({ x: (p.x - cam.x) / cam.zoom, y: (p.y - cam.y) / cam.zoom })

/** Lo que se ve del plano con esta cámara. */
export const visibleRect = (cam: Camera, view: Size): Rect => ({ x: -cam.x / cam.zoom, y: -cam.y / cam.zoom, w: view.w / cam.zoom, h: view.h / cam.zoom })

/** ¿Se ve entero el panel? */
export const inView = (r: Rect, cam: Camera, view: Size) => {
  const v = visibleRect(cam, view)
  return r.x >= v.x && r.y >= v.y && r.x + r.w <= v.x + v.w && r.y + r.h <= v.y + v.h
}

/** La cámara más cercana a la actual que deja ver entero el panel (si cabe), sin cambiar el zoom. */
export function reveal(cam: Camera, r: Rect, view: Size, pad = 32): Camera {
  const v = visibleRect(cam, view)
  const p = pad / cam.zoom
  let dx = 0
  let dy = 0
  if (r.w + p * 2 > v.w) dx = r.x + r.w / 2 - (v.x + v.w / 2)
  else if (r.x - p < v.x) dx = r.x - p - v.x
  else if (r.x + r.w + p > v.x + v.w) dx = r.x + r.w + p - (v.x + v.w)
  if (r.h + p * 2 > v.h) dy = r.y - p - v.y
  else if (r.y - p < v.y) dy = r.y - p - v.y
  else if (r.y + r.h + p > v.y + v.h) dy = r.y + r.h + p - (v.y + v.h)
  return { ...cam, x: cam.x - dx * cam.zoom, y: cam.y - dy * cam.zoom }
}

/**
 * «Ordenar»: los paneles en renglones, de izquierda a derecha, sin pasar de
 * `width` de ancho. Arranca donde estaba el primero, para no mandarlos lejos.
 */
export function arrange(panels: Panel[], width: number): Record<string, Point> {
  const sorted = [...panels].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (a.ref ?? '').localeCompare(b.ref ?? ''))
  const start = bounds(panels.map(shapeOf)) ?? { x: 0, y: 0, w: 0, h: 0 }
  const out: Record<string, Point> = {}
  let x = start.x
  let y = start.y
  let row = 0
  for (const p of sorted) {
    const s = shapeOf(p)
    if (x > start.x && x + s.w > start.x + width) {
      x = start.x
      y += row + GAP
      row = 0
    }
    out[p.id] = { x: snap(x), y: snap(y) }
    x += s.w + GAP
    row = Math.max(row, s.h)
  }
  return out
}

/** El ancho para «Ordenar» que deja el conjunto con la forma de la vista (ni una tira ni una torre). */
export function arrangeWidth(panels: Panel[], view: Size): number {
  const area = panels.reduce((n, p) => n + (shapeOf(p).w + GAP) * (shapeOf(p).h + GAP), 0)
  const widest = Math.max(0, ...panels.map((p) => p.w))
  return Math.max(widest, Math.sqrt(area * 1.15 * (view.w / Math.max(1, view.h))))
}

/**
 * El panel del jefe nacía angosto (solo la conversación). Uno guardado así se
 * ensancha a su tamaño de ahora y lo que tenía a su derecha se recorre lo mismo,
 * para no encimarse.
 */
export function widenBoss(panels: Panel[]): Panel[] {
  const boss = panels.find((p) => p.kind === 'boss')
  if (!boss || boss.w >= SIZES.boss.w) return panels
  const grow = SIZES.boss.w - boss.w
  const edge = boss.x + boss.w
  return panels.map((p) => (p === boss ? { ...p, w: SIZES.boss.w } : p.x >= edge ? { ...p, x: p.x + grow } : p))
}

/** Con qué arranca un proyecto que nunca se abrió en el lienzo: el jefe a la izquierda y la oficina a su lado. */
export function startingPanels(): Panel[] {
  const boss: Panel = { id: 'boss', kind: 'boss', x: 0, y: 0, ...SIZES.boss, z: 1 }
  const office: Panel = { id: 'office', kind: 'office', x: boss.w + GAP, y: 0, ...SIZES.office, z: 2 }
  return [boss, office]
}

/**
 * Enfocar: los paneles elegidos llenan la vista, lado a lado y en proporción a
 * su ancho, a zoom 1 (así las terminales se ven nítidas). Da su rectángulo en
 * el plano para la cámara `cam`.
 */
export function focusRects(panels: Panel[], cam: Camera, view: Size, pad = 16, bottom = 0): Record<string, Rect> {
  const v = visibleRect(cam, view)
  const total = panels.reduce((n, p) => n + p.w, 0) || 1
  const free = v.w - pad * (panels.length + 1)
  const out: Record<string, Rect> = {}
  let x = v.x + pad
  for (const p of panels) {
    const w = Math.max(MIN_SIZE.w, Math.round((free * p.w) / total))
    out[p.id] = { x, y: v.y + pad, w, h: v.h - pad * 2 - bottom / cam.zoom }
    x += w + pad
  }
  return out
}

/** Las letras de un proyecto en el dock: «orquest-web» → OW, «herdr» → HE. */
export function initials(name: string): string {
  const words = name.split(/[\s._-]+/).filter(Boolean)
  const two = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)
  return two.toUpperCase()
}

/** Un color fijo por proyecto, para su ficha en el dock. */
export function hueOf(name: string): number {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}
