/**
 * La oficina como dato: lo que el usuario dibuja en el modo creativo. Piso y
 * muros por casilla y muebles apoyados en casillas. De ahí sale el plano que
 * usa el juego (puestos, sillas de descanso, maquinitas, entrada, por dónde se
 * camina), así que nada de lo dibujado es decorado: un puesto es un lugar
 * donde alguien trabaja. No hay áreas: cualquier puesto sirve para cualquier
 * rol, y el rol lo trae cada quien. Lógica pura, sin dibujo.
 */

/** Lado de una casilla en píxeles del mundo: el de una loseta del piso. */
export const TILE = 48

export interface Point {
  x: number
  y: number
}

export interface Rect extends Point {
  w: number
  h: number
}

export const FLOORS = [
  { id: 'madera', label: 'Madera' },
  { id: 'espiga', label: 'Espiga' },
  { id: 'alfombra_gris', label: 'Alfombra gris' },
  { id: 'alfombra_azul', label: 'Alfombra azul' },
  { id: 'concreto', label: 'Concreto' },
  { id: 'loseta', label: 'Loseta' },
] as const

export const WALLS = [
  { id: 'pared', label: 'Pared' },
  { id: 'ventanal', label: 'Ventanal' },
] as const

/** Hueco en un muro: se camina por ahí. */
export const DOOR = 'puerta'

/**
 * Qué es una pieza para el juego:
 * decor estorba el paso; hang cuelga de un muro; rug va en el piso; top va
 * sobre un mueble; station, stationFront, stationRight, stationLeft y boss son
 * puestos (escritorio + silla): de espaldas a la cámara, de frente, de perfil
 * mirando a la derecha o a la izquierda, y el del jefe, de frente; table es
 * una mesa de cafetería con sus dos sillas; arcade es una maquinita; entrance
 * y queue son marcas que solo se ven al editar.
 */
export type PieceKind = 'decor' | 'hang' | 'rug' | 'top' | 'station' | 'stationFront' | 'stationRight' | 'stationLeft' | 'boss' | 'table' | 'arcade' | 'entrance' | 'queue'

export interface Piece {
  id: string
  label: string
  group: string
  /** Sprite que la representa (y su miniatura en la paleta). Las marcas no tienen. */
  sprite?: string
  /** Casillas que ocupa, desde su esquina superior izquierda. */
  w: number
  h: number
  kind: PieceKind
}

function piece(id: string, label: string, group: string, sprite: string | undefined, w: number, kind: PieceKind = 'decor', h = 1): Piece {
  return { id, label, group, sprite, w, h, kind }
}

export const PIECES: Piece[] = [
  piece('puesto', 'Puesto de espaldas', 'Puestos', 'puesto/escritorio', 2, 'station'),
  piece('puesto_frente', 'Puesto de frente', 'Puestos', 'puesto_lados/escritorio_atras', 2, 'stationFront'),
  piece('puesto_derecha', 'Puesto mirando a la derecha', 'Puestos', 'puesto_lados/escritorio_lado_izq', 2, 'stationRight', 2),
  piece('puesto_izquierda', 'Puesto mirando a la izquierda', 'Puestos', 'puesto_lados/escritorio_lado_der', 2, 'stationLeft', 2),
  piece('puesto_jefe', 'Escritorio del jefe', 'Puestos', 'puesto_lados/escritorio_atras', 2, 'boss'),
  piece('escritorio_chico', 'Escritorio chico', 'Puestos', 'puesto/escritorio_chico', 2),
  piece('silla', 'Silla', 'Puestos', 'puesto/silla_frente', 1),

  piece('mesa_cafe', 'Mesa con sillas', 'Cafetería', 'cafeteria/mesa', 3, 'table'),
  piece('barra', 'Barra de café', 'Cafetería', 'cafeteria/barra', 2),
  piece('garrafon', 'Garrafón', 'Cafetería', 'cafeteria/garrafon', 1),
  piece('silla_madera', 'Silla de madera', 'Cafetería', 'cafeteria/silla_madera', 1),

  piece('maquinita_azul', 'Maquinita azul', 'Juegos', 'juegos/maquinita_azul', 1, 'arcade'),
  piece('maquinita_roja', 'Maquinita roja', 'Juegos', 'juegos/maquinita_roja', 1, 'arcade'),
  piece('billar', 'Billar', 'Juegos', 'juegos/billar', 2, 'decor', 3),
  piece('golfito', 'Golfito', 'Juegos', 'juegos/golfito', 2, 'decor', 3),
  piece('futbolito', 'Futbolito', 'Juegos', 'juegos/futbolito', 2, 'decor', 2),
  piece('dardos', 'Dardos', 'Juegos', 'juegos/dardos', 2, 'hang'),

  piece('sofa', 'Sofá', 'Sala', 'cafeteria/sofa', 2),
  piece('sillon', 'Sillón', 'Sala', 'cafeteria/sillon', 1),
  piece('sofa_lado', 'Sofá de lado', 'Sala', 'cafeteria/sofa_lado', 1),
  piece('sillon_lado', 'Sillón de lado', 'Sala', 'cafeteria/sillon_lado', 1),
  piece('archivero', 'Archivero', 'Sala', 'cafeteria/archivero', 1),
  piece('lampara', 'Lámpara', 'Sala', 'cafeteria/lampara', 1),
  piece('pizarra_ruedas', 'Pizarra con ruedas', 'Sala', 'pared/pizarra_ruedas', 2),
  piece('librero', 'Librero', 'Sala', 'sala/librero', 2),
  piece('impresora', 'Impresora', 'Sala', 'sala/impresora', 1),
  piece('mesa_centro', 'Mesa de centro', 'Sala', 'sala/mesa_centro', 2),
  piece('mesa_juntas', 'Mesa de juntas', 'Sala', 'sala/mesa_juntas', 2, 'decor', 3),

  piece('planta_piso', 'Planta', 'Plantas', 'plantas/planta_piso', 1),
  piece('planta_palma', 'Palma', 'Plantas', 'plantas/planta_palma', 1),
  piece('jardinera', 'Jardinera', 'Plantas', 'plantas/jardinera', 3),
  piece('planta_escritorio', 'Planta de escritorio', 'Plantas', 'plantas/planta_escritorio', 1, 'top'),

  piece('corcho', 'Tablón de corcho', 'En el muro', 'pared/corcho', 2, 'hang'),
  piece('kanban', 'Kanban', 'En el muro', 'pared/kanban', 2, 'hang'),
  piece('pizarra', 'Pizarra', 'En el muro', 'pared/pizarra', 2, 'hang'),
  piece('ventana_noche', 'Ventana de noche', 'En el muro', 'pared/ventana_noche', 2, 'hang'),
  piece('ventana_persiana', 'Ventana con persiana', 'En el muro', 'pared/ventana_persiana', 1, 'hang'),
  piece('pantalla', 'Pantalla', 'En el muro', 'pared/pantalla', 2, 'hang'),

  piece('tapete', 'Tapete', 'Tapetes', 'alfombras/tapete', 1, 'rug'),
  piece('alfombra_pasillo', 'Alfombra de pasillo', 'Tapetes', 'alfombras/pasillo', 2, 'rug'),
  piece('alfombra_flecos', 'Alfombra con flecos', 'Tapetes', 'alfombras/flecos', 2, 'rug'),
  piece('alfombra_triangulos', 'Alfombra de triángulos', 'Tapetes', 'alfombras/triangulos', 2, 'rug'),
  piece('alfombra_redonda', 'Alfombra redonda', 'Tapetes', 'alfombras/redonda', 2, 'rug', 2),
  piece('alfombra_grande', 'Alfombra grande', 'Tapetes', 'alfombras/grande', 2, 'rug', 3),

  piece('laptop', 'Laptop', 'Sobre la mesa', 'tecnologia/laptop', 1, 'top'),
  piece('tablet', 'Tablet con soporte', 'Sobre la mesa', 'tecnologia/tablet_soporte', 1, 'top'),
  piece('telefono', 'Teléfono', 'Sobre la mesa', 'tecnologia/telefono_fijo', 1, 'top'),
  piece('diadema', 'Diadema', 'Sobre la mesa', 'tecnologia/diadema', 1, 'top'),

  piece('entrada', 'Entrada', 'Marcas', undefined, 1, 'entrance'),
  piece('fila', 'Fila frente al jefe', 'Marcas', undefined, 1, 'queue'),
]

const BY_ID = new Map(PIECES.map((p) => [p.id, p]))

export function getPiece(id: string): Piece | undefined {
  return BY_ID.get(id)
}

export interface Item {
  piece: string
  /** Esquina superior izquierda de lo que ocupa, en casillas. */
  x: number
  y: number
  flip?: boolean
}

export interface OfficeMap {
  version: 1
  w: number
  h: number
  /** Por casilla (fila por fila): id del piso o '' si no hay. */
  floor: string[]
  /** Por casilla: id del muro, DOOR o ''. */
  wall: string[]
  items: Item[]
}

export const MIN_SIZE = 8
export const MAX_SIZE = 96

export function emptyMap(w = 40, h = 24): OfficeMap {
  return { version: 1, w, h, floor: Array(w * h).fill(''), wall: Array(w * h).fill(''), items: [] }
}

export const inside = (m: OfficeMap, x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h
const at = (m: OfficeMap, x: number, y: number) => y * m.w + x
export const floorAt = (m: OfficeMap, x: number, y: number) => (inside(m, x, y) ? m.floor[at(m, x, y)] : '')
export const wallAt = (m: OfficeMap, x: number, y: number) => (inside(m, x, y) ? m.wall[at(m, x, y)] : '')

/** Muro de verdad en esa casilla: una puerta es un hueco. */
const solidWall = (m: OfficeMap, x: number, y: number) => (wallAt(m, x, y) === DOOR ? '' : wallAt(m, x, y))

/**
 * Cómo se ve un muro: de frente si corre a los lados (o está solo), de canto
 * si corre de arriba abajo y solo se le ve la tapa.
 */
export function wallFacing(m: OfficeMap, x: number, y: number): 'frente' | 'canto' {
  const sides = !!wallAt(m, x - 1, y) || !!wallAt(m, x + 1, y)
  return sides || !(wallAt(m, x, y - 1) || wallAt(m, x, y + 1)) ? 'frente' : 'canto'
}

/**
 * Qué tan alto se levanta un muro. El ventanal siempre es alto: deja ver. La
 * pared es alta solo donde no tapa nada (el fondo de la oficina); un tramo con
 * piso detrás es bajo entero, para que se vea el interior. Una pared de canto
 * sigue a la que tiene arriba, para empatar con ella.
 */
export function wallHeight(m: OfficeMap, x: number, y: number): 'alta' | 'baja' {
  if (solidWall(m, x, y) !== 'pared') return 'alta'
  const hides = (tx: number, ty: number) => !!floorAt(m, tx, ty - 1) && !wallAt(m, tx, ty - 1)
  if (wallFacing(m, x, y) === 'canto') {
    let top = y
    while (wallAt(m, x, top - 1)) top--
    if (top === y || wallFacing(m, x, top) === 'canto') return hides(x, top) ? 'baja' : 'alta'
    return wallHeight(m, x, top)
  }
  const part = (tx: number) => solidWall(m, tx, y) === 'pared' && wallFacing(m, tx, y) === 'frente'
  let a = x
  let b = x
  while (part(a - 1)) a--
  while (part(b + 1)) b++
  for (let tx = a; tx <= b; tx++) if (hides(tx, y)) return 'baja'
  return 'alta'
}

/** Rectángulo entre dos casillas, en cualquier orden. */
export function rectOf(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 }
}

function each(m: OfficeMap, r: Rect, fn: (i: number) => void) {
  for (let y = Math.max(0, r.y); y < Math.min(m.h, r.y + r.h); y++) for (let x = Math.max(0, r.x); x < Math.min(m.w, r.x + r.w); x++) fn(at(m, x, y))
}

// ── Dibujar ────────────────────────────────────────────────────────────────
// Todas cambian el mapa que reciben; quien edita trabaja sobre una copia.

export function paintFloor(m: OfficeMap, r: Rect, id: string) {
  each(m, r, (i) => (m.floor[i] = id))
}

export function paintWall(m: OfficeMap, r: Rect, id: string) {
  each(m, r, (i) => (m.wall[i] = id))
}

/** Abre o cierra una puerta en un muro. Fuera de un muro no hace nada. */
export function toggleDoor(m: OfficeMap, x: number, y: number, closeAs = 'pared'): boolean {
  const w = wallAt(m, x, y)
  if (!w) return false
  // Al cerrarla vuelve al muro de junto, para no cambiarle el material.
  const near = [wallAt(m, x - 1, y), wallAt(m, x + 1, y), wallAt(m, x, y - 1), wallAt(m, x, y + 1)].find((n) => n && n !== DOOR)
  m.wall[at(m, x, y)] = w === DOOR ? (near ?? closeAs) : DOOR
  return true
}

export function placeItem(m: OfficeMap, item: Item) {
  // Solo hay una entrada y un escritorio del jefe: el nuevo reemplaza al anterior.
  const kind = getPiece(item.piece)?.kind
  if (kind === 'entrance' || kind === 'boss') m.items = m.items.filter((i) => getPiece(i.piece)?.kind !== kind)
  m.items.push(item)
}

export function itemRect(i: Item): Rect {
  const p = getPiece(i.piece)
  return { x: i.x, y: i.y, w: p?.w ?? 1, h: p?.h ?? 1 }
}

const contains = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h

/** Quita lo último que se puso sobre esa casilla. */
export function removeItemAt(m: OfficeMap, x: number, y: number): boolean {
  for (let i = m.items.length - 1; i >= 0; i--) {
    if (contains(itemRect(m.items[i]), x, y)) {
      m.items.splice(i, 1)
      return true
    }
  }
  return false
}

/** Cambia el tamaño conservando lo que cabe desde la esquina superior izquierda. */
export function resizeMap(m: OfficeMap, w: number, h: number) {
  w = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(w)))
  h = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(h)))
  const next = emptyMap(w, h)
  for (let y = 0; y < Math.min(h, m.h); y++)
    for (let x = 0; x < Math.min(w, m.w); x++) {
      next.floor[y * w + x] = m.floor[at(m, x, y)]
      next.wall[y * w + x] = m.wall[at(m, x, y)]
    }
  m.items = m.items.filter((i) => i.x < w && i.y < h)
  Object.assign(m, { w, h, floor: next.floor, wall: next.wall })
}

/** Lo que llega de disco puede venir de otra versión o a medias: solo pasa si tiene la forma de un mapa. */
export function isOfficeMap(v: unknown): v is OfficeMap {
  const m = v as OfficeMap
  return (
    !!m &&
    m.version === 1 &&
    Number.isInteger(m.w) &&
    Number.isInteger(m.h) &&
    Array.isArray(m.floor) &&
    m.floor.length === m.w * m.h &&
    Array.isArray(m.wall) &&
    m.wall.length === m.w * m.h &&
    Array.isArray(m.items)
  )
}

// ── Plano: lo que el juego entiende del dibujo ─────────────────────────────

export interface Desk {
  /** Su lugar entre los puestos: con esto nadie cambia de escritorio. */
  index: number
  /** Hacia dónde mira quien se sienta: 'up' de espaldas a la cámara, 'down' de frente, 'left' y 'right' de perfil. */
  faces: 'up' | 'down' | 'left' | 'right'
  /** Casilla del escritorio: la izquierda si corre a lo ancho, la de arriba si corre de arriba abajo. */
  desk: Point
  /** Casilla donde se sienta: debajo del escritorio si mira hacia arriba, detrás si mira al frente, a un lado si va de perfil. */
  seat: Point
  /** Centro del escritorio en casillas (puede caer entre dos). */
  mid: number
  /** No hay puesto para él: se queda de pie en la entrada. */
  virtual?: boolean
}

export interface Seat extends Point {
  /** Hacia dónde mira quien se sienta. */
  faces: 'left' | 'right'
}

export interface Plan {
  map: OfficeMap
  /** Por casilla: 1 si se puede caminar. */
  walk: Uint8Array
  /** Puestos de trabajo, en el orden en que se pusieron. */
  desks: Desk[]
  boss?: Desk
  cafe: Seat[]
  /** Casilla frente a cada maquinita. */
  arcades: Point[]
  queue: Point[]
  entrance: Point
  /** La entrada está marcada; si no, se eligió una casilla cualquiera. */
  hasEntrance: boolean
  /** Por casilla: 1 si se llega caminando desde la entrada. */
  reach: Uint8Array
  /** Por casilla: 1 si quien se pare ahí queda encima de alguien o del lugar de alguien. */
  busy: Uint8Array
}

const SOLID: PieceKind[] = ['decor', 'station', 'stationFront', 'boss', 'arcade']

/** Filas, arriba y abajo, en que dos personas en la misma columna se enciman. */
const REACH = 2

const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

export function buildPlan(map: OfficeMap): Plan {
  const n = map.w * map.h
  const walk = new Uint8Array(n)
  for (let i = 0; i < n; i++) walk[i] = map.floor[i] && (!map.wall[i] || map.wall[i] === DOOR) ? 1 : 0
  const block = (r: Rect) => each(map, r, (i) => (walk[i] = 0))

  const plan: Plan = {
    map,
    walk,
    desks: [],
    cafe: [],
    arcades: [],
    queue: [],
    entrance: { x: 0, y: 0 },
    hasEntrance: false,
    reach: new Uint8Array(n),
    busy: new Uint8Array(n),
  }
  const desk = (it: Item, w: number, index: number, faces: Desk['faces']): Desk => ({
    index,
    faces,
    desk: { x: it.x, y: it.y },
    seat: { x: it.x, y: faces === 'up' ? it.y + 1 : it.y - 1 },
    mid: it.x + w / 2,
  })
  // De perfil el escritorio corre de arriba abajo (dos casillas) y la silla va a su lado, en la de abajo.
  const sideDesk = (it: Item, index: number, faces: 'left' | 'right'): Desk => {
    const col = faces === 'right' ? it.x + 1 : it.x
    block({ x: col, y: it.y, w: 1, h: 2 })
    return { index, faces, desk: { x: col, y: it.y }, seat: { x: faces === 'right' ? it.x : it.x + 1, y: it.y + 1 }, mid: col + 0.5 }
  }

  for (const it of map.items) {
    const p = getPiece(it.piece)
    if (!p) continue
    if (SOLID.includes(p.kind)) block(itemRect(it))
    switch (p.kind) {
      case 'station':
      case 'stationFront':
        plan.desks.push(desk(it, p.w, plan.desks.length, p.kind === 'station' ? 'up' : 'down'))
        break
      case 'stationRight':
      case 'stationLeft':
        plan.desks.push(sideDesk(it, plan.desks.length, p.kind === 'stationRight' ? 'right' : 'left'))
        break
      case 'boss':
        // El jefe mira al frente: se le ve la cara desde la oficina.
        plan.boss = desk(it, p.w, 0, 'down')
        break
      case 'table':
        // La mesa va al centro; las sillas quedan libres para sentarse.
        block({ x: it.x + 1, y: it.y, w: 1, h: 1 })
        plan.cafe.push({ x: it.x, y: it.y, faces: 'right' }, { x: it.x + 2, y: it.y, faces: 'left' })
        break
      case 'arcade':
        plan.arcades.push({ x: it.x, y: it.y + 1 })
        break
      case 'queue':
        plan.queue.push({ x: it.x, y: it.y })
        break
      case 'entrance':
        plan.entrance = { x: it.x, y: it.y }
        plan.hasEntrance = true
        break
    }
  }
  if (!plan.hasEntrance) {
    // Sin entrada marcada se entra por la primera casilla caminable.
    const i = walk.indexOf(1)
    if (i >= 0) plan.entrance = { x: i % map.w, y: Math.floor(i / map.w) }
  }

  // Desde la entrada, ¿a dónde se llega?
  const e = plan.entrance.y * map.w + plan.entrance.x
  const todo = [e]
  plan.reach[e] = 1
  while (todo.length) {
    const c = todo.pop()!
    const x = c % map.w
    const y = (c - x) / map.w
    for (const [dx, dy] of DIRS) {
      if (!inside(map, x + dx, y + dy)) continue
      const nc = (y + dy) * map.w + x + dx
      if (!plan.reach[nc] && walk[nc]) {
        plan.reach[nc] = 1
        todo.push(nc)
      }
    }
  }

  // Lugares con dueño: una persona mide dos casillas y media de alto, así que
  // quien se pare ahí, dos filas atrás o dos adelante, se encima con quien lo ocupa.
  const own = (r: Rect) => each(map, r, (i) => (plan.busy[i] = 1))
  for (const d of [...plan.desks, ...(plan.boss ? [plan.boss] : [])]) {
    // De perfil: su columna y la de afuera, donde quedaría hombro con hombro con él.
    const x = d.faces === 'right' ? d.seat.x - 1 : d.faces === 'left' ? d.seat.x : d.desk.x
    own({ x, y: d.seat.y - REACH, w: 2, h: REACH * 2 + 1 })
  }
  for (const s of [...plan.cafe, ...plan.arcades, ...plan.queue, plan.entrance]) own({ x: s.x, y: s.y - REACH, w: 1, h: REACH * 2 + 1 })
  // En una puerta nadie se queda parado.
  for (let i = 0; i < n; i++) if (map.wall[i] === DOOR) plan.busy[i] = 1
  return plan
}

/**
 * Dónde pararse cerca de un punto sin encimarse con nadie: la casilla más
 * cercana caminando, en el mismo cuarto, que no es el lugar de alguien ni
 * queda delante o detrás de él, y que no comparte columna (a dos filas o
 * menos) con quien ya está de pie. Si no hay ninguna, el mismo punto.
 */
export function standSpot(plan: Plan, near: Point, taken: Point[] = []): Point {
  const { map, walk } = plan
  const start = Math.round(near.y) * map.w + Math.round(near.x)
  if (!inside(map, Math.round(near.x), Math.round(near.y))) return near
  // Se busca caminando desde ahí, no en línea recta: el lugar más cercano no debe quedar tras un muro.
  const seen = new Uint8Array(walk.length)
  const todo = [start]
  seen[start] = 1
  for (let k = 0; k < todo.length; k++) {
    const c = todo[k]
    const x = c % map.w
    const y = (c - x) / map.w
    // Su placa cae en la casilla de abajo: que sea piso libre, no el lugar ni el mueble de alguien.
    const below = c + map.w
    const clear = below < walk.length && walk[below] && !plan.busy[below]
    if (plan.reach[c] && !plan.busy[c] && clear && !taken.some((t) => t.x === x && Math.abs(t.y - y) <= REACH)) return { x, y }
    for (const [dx, dy] of DIRS) {
      if (!inside(map, x + dx, y + dy)) continue
      const nc = (y + dy) * map.w + x + dx
      // Sin cruzar puertas: esperar a alguien es quedarse en su mismo cuarto.
      if (!seen[nc] && walk[nc] && map.wall[nc] !== DOOR) {
        seen[nc] = 1
        todo.push(nc)
      }
    }
  }
  return near
}

/** Para quien no tiene puesto: espera de pie cerca de la entrada, sin estorbar el paso ni a otros. */
export function virtualDesk(plan: Plan, taken: Point[] = []): Desk {
  const p = standSpot(plan, plan.entrance, taken)
  return { index: -1, faces: 'up', desk: p, seat: p, mid: p.x + 0.5, virtual: true }
}

/**
 * Dónde espera su turno quien lleva su entrega al jefe: en las marcas de fila
 * y, cuando se acaban (o no hay), en lugares libres cerca, uno por persona.
 */
export function queueSpot(plan: Plan, slot: number): Point {
  if (slot < plan.queue.length) return plan.queue[slot]
  const b = plan.boss
  const anchor = plan.queue[0] ?? (b ? { x: b.desk.x, y: b.desk.y + (b.faces === 'down' ? 3 : 4) } : plan.entrance)
  const taken = [...plan.queue]
  for (let k = plan.queue.length; k <= slot; k++) taken.push(standSpot(plan, anchor, taken))
  return taken[taken.length - 1]
}

export function cafeSeat(plan: Plan, slot: number): Seat {
  return plan.cafe.length ? plan.cafe[slot % plan.cafe.length] : { ...plan.entrance, faces: 'right' }
}

export function arcadeSpot(plan: Plan, slot: number): Point {
  return plan.arcades.length ? plan.arcades[slot % plan.arcades.length] : plan.entrance
}

// ── Rutas ──────────────────────────────────────────────────────────────────

/** Montículo mínimo de [costo, estado]: el mapa es chico, pero se camina seguido. */
class Heap {
  private a: [number, number][] = []
  get size() {
    return this.a.length
  }
  push(v: [number, number]) {
    const a = this.a
    let i = a.push(v) - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p][0] <= a[i][0]) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop(): [number, number] {
    const a = this.a
    const top = a[0]
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let s = i
        if (l < a.length && a[l][0] < a[s][0]) s = l
        if (r < a.length && a[r][0] < a[s][0]) s = r
        if (s === i) break
        ;[a[s], a[i]] = [a[i], a[s]]
        i = s
      }
    }
    return top
  }
}

/** Dar vuelta cuesta un poco: entre dos caminos igual de largos gana el más derecho. */
const TURN = 0.01

/**
 * Camino entre dos puntos, casilla por casilla, sin atravesar muros ni
 * muebles. Devuelve solo las esquinas; quien anima interpola en línea recta.
 * Si no hay paso (alguien quedó encerrado al redibujar) va derecho: nadie se
 * queda atorado por un mapa a medias.
 */
export function route(plan: Plan, from: Point, to: Point): Point[] {
  const { map, walk } = plan
  const cell = (p: Point) => ({ x: Math.max(0, Math.min(map.w - 1, Math.round(p.x))), y: Math.max(0, Math.min(map.h - 1, Math.round(p.y))) })
  const s = cell(from)
  const g = cell(to)
  const goal = g.y * map.w + g.x
  if (s.x === g.x && s.y === g.y) return corners([from, to])

  const n = map.w * map.h
  const best = new Float64Array(n * 4).fill(Infinity)
  const prev = new Int32Array(n * 4).fill(-1)
  const heap = new Heap()
  const start = s.y * map.w + s.x
  for (let d = 0; d < 4; d++) {
    best[start * 4 + d] = 0
    heap.push([0, start * 4 + d])
  }
  let end = -1
  while (heap.size) {
    const [cost, state] = heap.pop()
    if (cost > best[state]) continue
    const c = state >> 2
    if (c === goal) {
      end = state
      break
    }
    const d = state & 3
    const x = c % map.w
    const y = (c - x) / map.w
    for (let nd = 0; nd < 4; nd++) {
      const nx = x + DIRS[nd][0]
      const ny = y + DIRS[nd][1]
      if (!inside(map, nx, ny)) continue
      const nc = ny * map.w + nx
      // El destino vale aunque esté ocupado: es una silla o el lugar de alguien.
      if (!walk[nc] && nc !== goal) continue
      const next = cost + 1 + (nd === d ? 0 : TURN)
      if (next < best[nc * 4 + nd]) {
        best[nc * 4 + nd] = next
        prev[nc * 4 + nd] = state
        heap.push([next, nc * 4 + nd])
      }
    }
  }
  if (end < 0) return corners([from, to])

  const cells: Point[] = []
  for (let st = end; st >= 0; st = prev[st]) {
    const c = st >> 2
    cells.push({ x: c % map.w, y: Math.floor(c / map.w) })
  }
  return corners([from, ...cells.reverse(), to])
}

/** Quita puntos repetidos y los que quedan a media recta. */
function corners(pts: Point[]): Point[] {
  const out: Point[] = []
  for (const p of pts) {
    const a = out[out.length - 2]
    const b = out[out.length - 1]
    if (b && b.x === p.x && b.y === p.y) continue
    if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) out[out.length - 1] = p
    else out.push(p)
  }
  return out
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

// ── Revisión ───────────────────────────────────────────────────────────────

/** Lo que le falta al dibujo para funcionar como oficina. Vacío = lista. */
export function mapIssues(plan: Plan): string[] {
  const { map, walk } = plan
  const issues: string[] = []
  if (!walk.includes(1)) return ['Pinta piso: todavía no hay por dónde caminar.']
  if (!plan.hasEntrance) issues.push('Marca la entrada: por ahí llega cada contratado.')
  if (!plan.boss) issues.push('Falta el escritorio del jefe.')
  const stations = plan.desks
  if (!stations.length) issues.push('No hay puestos de trabajo.')
  if (!plan.cafe.length) issues.push('Sin mesas con sillas: quien descanse se queda en la entrada.')
  if (!plan.arcades.length) issues.push('Sin maquinitas: quien limpie contexto se queda en la entrada.')

  const reach = (p: Point) => inside(map, p.x, p.y) && !!plan.reach[p.y * map.w + p.x]
  const lost = stations.filter((d) => !reach(d.seat)).length
  if (lost) issues.push(`${lost} ${lost === 1 ? 'puesto no se alcanza' : 'puestos no se alcanzan'} desde la entrada.`)
  if (plan.boss && !reach(plan.boss.seat)) issues.push('El escritorio del jefe no se alcanza desde la entrada.')
  return issues
}

// ── Oficina de ejemplo ─────────────────────────────────────────────────────

/**
 * Una oficina chica para empezar, de planta abierta: la oficina del jefe
 * arriba a la izquierda, una sala de vidrio arriba a la derecha (mesas para
 * descansar), doce puestos de perfil en dos bloques que se dan la cara, juegos y
 * sala abajo a la derecha, y la entrada abajo, al centro.
 */
export function exampleMap(): OfficeMap {
  const m = emptyMap(22, 20)
  const put = (piece: string, x: number, y: number, flip?: boolean) => placeItem(m, { piece, x, y, ...(flip && { flip }) })
  paintFloor(m, { x: 0, y: 0, w: 22, h: 20 }, 'madera')
  // La alfombra de la sala sigue bajo su ventanal: a través del vidrio no debe verse otro piso.
  paintFloor(m, { x: 11, y: 1, w: 10, h: 8 }, 'alfombra_azul')

  // Contorno: pared al fondo y a los lados; al frente queda baja, con la entrada.
  paintWall(m, { x: 0, y: 0, w: 22, h: 1 }, 'pared')
  paintWall(m, { x: 0, y: 0, w: 1, h: 20 }, 'pared')
  paintWall(m, { x: 21, y: 0, w: 1, h: 20 }, 'pared')
  paintWall(m, { x: 0, y: 19, w: 22, h: 1 }, 'pared')
  paintWall(m, { x: 10, y: 19, w: 2, h: 1 }, DOOR)

  // Oficina del jefe: mira al frente, hacia su puerta.
  paintWall(m, { x: 0, y: 7, w: 11, h: 1 }, 'pared')
  paintWall(m, { x: 10, y: 0, w: 1, h: 8 }, 'pared')
  paintWall(m, { x: 7, y: 7, w: 1, h: 1 }, DOOR)
  put('alfombra_grande', 4, 2)
  put('puesto_jefe', 4, 3)
  put('planta_escritorio', 5, 3)
  put('planta_piso', 1, 1)
  put('librero', 7, 1)
  put('archivero', 1, 4)
  put('ventana_noche', 1, 0)
  put('pantalla', 4, 0)
  put('fila', 3, 6)
  put('fila', 5, 6)

  // Sala de vidrio: aquí se descansa.
  paintWall(m, { x: 10, y: 8, w: 12, h: 1 }, 'ventanal')
  paintWall(m, { x: 15, y: 8, w: 2, h: 1 }, DOOR)
  // Las mesas quedan arriba: el ventanal del frente tapa las dos filas de abajo.
  put('mesa_cafe', 12, 2)
  put('mesa_cafe', 17, 2)
  put('mesa_cafe', 12, 5)
  put('mesa_cafe', 17, 5)
  put('corcho', 12, 0)
  put('pantalla', 15, 0)
  put('dardos', 18, 0)
  put('planta_palma', 11, 1)
  put('garrafon', 20, 1)
  put('planta_palma', 20, 6)

  // Doce puestos de perfil en dos bloques: en cada uno, tres mirando a la derecha frente a tres mirando a la izquierda.
  for (const x of [2, 8])
    for (const y of [10, 12, 14]) {
      put('puesto_derecha', x, y)
      put('puesto_izquierda', x + 2, y)
    }
  put('planta_piso', 1, 17)
  put('pizarra_ruedas', 3, 18)
  put('impresora', 6, 18)
  put('archivero', 7, 18)

  // Juegos y sala.
  ;['maquinita_azul', 'maquinita_roja', 'maquinita_azul'].forEach((id, i) => put(id, 15 + i * 2, 10))
  put('barra', 13, 9)
  // Sofá y sillón frente a frente, con la mesa de centro en medio.
  put('alfombra_grande', 16, 13)
  put('sofa_lado', 15, 15)
  put('mesa_centro', 16, 15)
  put('sillon_lado', 18, 15, true)
  put('planta_piso', 20, 12)
  put('futbolito', 18, 17)
  put('jardinera', 13, 18)

  put('tapete', 10, 18)
  put('entrada', 11, 17)
  return m
}
