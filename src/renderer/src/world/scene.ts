/**
 * Dibuja la oficina con PixiJS. No decide nada: lee el mapa (map.ts), el plano
 * que sale de él (layout.ts) y lo que debe verse de cada empleado
 * (behavior.ts) y lo pinta. En modo creativo además avisa en qué casilla anda
 * el cursor y muestra lo que la herramienta está por hacer.
 */
import 'pixi.js/unsafe-eval' // la CSP de la app no permite eval
import { Application, Container, Graphics, Sprite, Text, TilingSprite } from 'pixi.js'
import { Actor, type VisualState } from './behavior'
import { assignDesks, cafeSeat, plan, setMap, TILE, waitingSpots, type Desk, type Point } from './layout'
import { DOOR, getPiece, wallAt, wallFacing, wallHeight, type Item, type OfficeMap, type Rect } from './map'
import { BUBBLE_ICON, characterFor, FLOOR, hasSideWork, loadSprites, monitorFrames, PROVIDER_CODE, PROVIDER_COLOR, sideWork, tex, walkFrames, workFrames } from './sprites'

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface SceneEmployee {
  id: string
  name?: string
  role: string
  provider: string
  state: VisualState
  /** Con state 'waiting': a quién espera (camina a su escritorio). */
  waitingFor?: string
  /** Con state 'delivering': lugar en la fila frente al jefe. */
  slot?: number
}

/** Lo que hace el cursor sobre el mapa en modo creativo, en casillas. */
export interface EditEvent {
  type: 'down' | 'move' | 'up' | 'leave'
  tile: Point
}

/** Lo que la herramienta está por hacer: casillas resaltadas y, si es una pieza, su silueta. */
export interface Preview {
  rect?: Rect
  /** Rojo cuando la herramienta quita. */
  removes?: boolean
  item?: Item
}

interface ActorView {
  actor: Actor
  provider: string
  /** Carpeta de sus sprites. */
  character: string
  root: Container
  body: Sprite
  bubble: Graphics
  ring: Graphics
  monitor: Sprite
  /** Placa con nombre, rol e insignia del proveedor: va en su propia capa, encima de los muebles. */
  tag: Container
  label: Text
  /** Su rol, bajo el nombre: en la oficina no hay áreas que lo digan. */
  role: Text
  plate: Graphics
  /** Ancho del nombre y rol, sin la insignia. */
  tagWidth: number
}

/** Más cerca que esto el píxel ya no aporta. */
const MAX_SCALE = 1.5

// Medidas en píxeles del mundo, tomadas de los sprites.
/** Grosor de la tapa de un muro: lo que se le ve desde arriba. */
const CAP = 24
/**
 * Un puesto, medido desde la base de su escritorio (restar es subir). De
 * espaldas: la persona abajo, metida en su silla. De frente: la persona detrás
 * del escritorio, que le tapa de la cintura para abajo.
 */
const BACK = { monitor: -38, chair: 62, person: 54 }
// De frente va pegado: el escritorio le tapa de la cintura para abajo, rodillas incluidas.
const FRONT = { monitor: -34, chair: -46, person: -26 }
/**
 * De perfil, desde la base del puesto (el borde inferior de su casilla de
 * abajo) y hacia el escritorio (`in`: píxeles desde el centro de su casilla).
 * La silla se dibuja encima de la persona: con el descansabrazos y el asiento
 * por delante se lee sentada; al revés parece parada frente a la silla.
 */
const SIDE = { person: -38, personIn: 4, chair: -26, chairIn: -14, monitor: -50, monitorIn: 8, panel: -44, tag: -96, tagStep: 46, tagOut: 30 }
/** En una mesa con sillas: igual, la silla va por delante y la persona sube al asiento y se arrima a la mesa. */
const TABLE = { person: -16, personIn: 8, chair: -6, chairIn: -4 }
/** Mamparas de cubículo entre dos hileras frente a frente, desde la base del escritorio de abajo. */
const PANEL = { back: -62, side: 10, sideBehind: -96 }
/** Dónde va la placa de quien mira al frente, sobre la base de su escritorio: tapa la espalda de su monitor, no la pantalla del de enfrente. */
const TAG_UP = 80
/** Ancho de la insignia del proveedor en la placa. */
const BADGE = 26
const ACCENT = 0xf2b84b
const PLATE = 0x14121c

const cx = (tile: number) => tile * TILE + TILE / 2
const base = (tile: number) => (tile + 1) * TILE

function pixels(g: Graphics, rows: string[], colors: Record<string, number>, ox = 0, oy = 0) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = colors[row[x]]
      if (c !== undefined) g.rect(ox + x, oy + y, 1, 1).fill(c)
    }
  })
}

export class OfficeScene {
  private app = new Application()
  private world = new Container()
  /** Pisos, tapetes y muros delgados: nunca tapan a nadie. */
  private ground = new Container()
  /** Muebles, muros de frente y personas, ordenados por su base: lo de abajo tapa a lo de arriba. */
  private objects = new Container()
  /** Placas de nombre: siempre a la vista. */
  private tags = new Container()
  /** Solo en modo creativo: cuadrícula y marcas. */
  private guides = new Container()
  private preview = new Container()
  /** Lo que se dibujó del mapa dentro de `objects`, para quitarlo al redibujar. */
  private fixtures: Container[] = []
  private views = new Map<string, ActorView>()
  private deskIndex = new Map<string, number>()
  private desks = new Map<string, Desk>()
  private list: SceneEmployee[] = []
  private selected: string | null = null
  private tick = 0
  private ready: Promise<void>
  private observer?: ResizeObserver
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
  private zoom = 1
  private pan = { x: 0, y: 0 }
  private dragging: () => boolean = () => false
  /** La cámara sigue al elegido hasta que el usuario arrastra el mapa. */
  private follow = true
  private onEdit: ((e: EditEvent) => void) | null = null

  constructor(
    private parent: HTMLElement,
    private onSelect: (id: string | null) => void,
  ) {
    this.ready = this.init()
  }

  private async init() {
    await this.app.init({ resizeTo: this.parent, background: 0x1b1a24, antialias: false, autoDensity: true, resolution: window.devicePixelRatio || 1 })
    this.parent.appendChild(this.app.canvas)
    this.app.canvas.style.imageRendering = 'pixelated'
    await loadSprites()
    this.app.stage.addChild(this.world)
    this.objects.sortableChildren = true
    this.guides.visible = false
    this.world.addChild(this.ground, this.objects, this.tags, this.guides, this.preview)
    this.drawMap()
    this.world.eventMode = 'static'
    this.world.hitArea = { contains: () => true }
    this.world.on('pointertap', (e) => {
      if (!this.onEdit && e.target === this.world && !this.dragging()) this.onSelect(null)
    })
    this.app.ticker.add((t) => this.frame(t.deltaMS / 1000))
    this.app.renderer.on('resize', () => this.fit())
    // El drawer en modo dividido cambia el tamaño sin que cambie la ventana.
    this.observer = new ResizeObserver(() => this.app.resize())
    this.observer.observe(this.parent)
    this.enablePointer()
    this.fit()
  }

  /**
   * Lo que la cámara encuadra, en píxeles del mundo: al dibujar, el lienzo
   * entero; en la oficina, solo donde hay piso (con aire arriba para muros y
   * muebles altos), para que una oficina chica no se pierda en un lienzo grande.
   */
  private get frameRect(): Rect {
    const map = plan().map
    let x0 = map.w
    let y0 = map.h
    let x1 = -1
    let y1 = -1
    if (!this.onEdit)
      for (let y = 0; y < map.h; y++)
        for (let x = 0; x < map.w; x++)
          if (map.floor[y * map.w + x] || map.wall[y * map.w + x]) {
            x0 = Math.min(x0, x)
            y0 = Math.min(y0, y)
            x1 = Math.max(x1, x)
            y1 = Math.max(y1, y)
          }
    // Lienzo entero, con aire arriba para ver completo un muro alto en la primera fila.
    if (x1 < 0) return { x: -16, y: -112, w: map.w * TILE + 32, h: map.h * TILE + 128 }
    // Arriba, lo que sube un muro alto sobre su casilla; abajo, nombre y rol de quien esté en la última fila.
    return { x: x0 * TILE - 16, y: y0 * TILE - 112, w: (x1 - x0 + 1) * TILE + 32, h: (y1 - y0 + 1) * TILE + 112 + 56 }
  }

  /**
   * Escala: la mayor con la que cabe la oficina bajo el HUD; encima va el
   * zoom del usuario, hasta MAX_SCALE. Posición: centrado en la zona libre
   * (sin HUD ni paneles). Si el mapa no cabe ahí y hay alguien elegido, la
   * cámara lo sigue; si no, el usuario lo mueve arrastrando.
   */
  private cameraTarget(): { x: number; y: number; scale: number } {
    const { width, height } = this.app.screen
    const i = this.insets
    const scale = this.baseScale() * this.zoom
    const w = Math.max(1, width - i.left - i.right)
    const h = Math.max(1, height - i.top - i.bottom)
    const r = this.frameRect
    const focus = this.selected && !this.onEdit ? this.views.get(this.selected)?.actor.pos : undefined
    const axis = (start: number, size: number, off: number, len: number, f: number | undefined, pan: number) => {
      const fitted = start + (size - len) / 2 - off
      if (len <= size && this.zoom === 1) return fitted
      const centered = f !== undefined ? start + size / 2 - (f + 0.5) * TILE * scale : fitted + pan
      // Que no quede hueco innecesario a los lados.
      return len <= size ? centered : Math.min(start - off, Math.max(start + size - len - off, centered))
    }
    return {
      scale,
      x: axis(i.left, w, r.x * scale, r.w * scale, focus && this.follow ? focus.x : undefined, this.pan.x),
      y: axis(i.top, h, r.y * scale, r.h * scale, focus && this.follow ? focus.y : undefined, this.pan.y),
    }
  }

  private baseScale(): number {
    const { width, height } = this.app.screen
    const i = this.insets
    const r = this.frameRect
    const fits = Math.min((width - i.left - i.right) / r.w, (height - i.top - i.bottom) / r.h)
    // Reducir admite cualquier escala (se promedia); ampliar va en pasos enteros para que el píxel quede parejo.
    return fits >= MAX_SCALE ? MAX_SCALE : fits >= 1 ? 1 : Math.max(0.1, fits)
  }

  private fit(smooth = 0) {
    const t = this.cameraTarget()
    this.world.scale.set(t.scale)
    const k = smooth ? Math.min(1, smooth * 8) : 1
    this.world.position.set(Math.round(this.world.x + (t.x - this.world.x) * k), Math.round(this.world.y + (t.y - this.world.y) * k))
  }

  setInsets(insets: Partial<Insets>) {
    this.insets = { ...this.insets, ...insets }
    this.ready.then(() => this.fit())
  }

  resetView() {
    this.zoom = 1
    this.pan = { x: 0, y: 0 }
    this.follow = true
    this.fit()
  }

  private tileAt(ev: PointerEvent): Point {
    const box = this.app.canvas.getBoundingClientRect()
    const p = this.world.toLocal({ x: ev.clientX - box.left, y: ev.clientY - box.top })
    return { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) }
  }

  /** Rueda: zoom. Arrastrar: mover el mapa; en modo creativo el botón izquierdo dibuja y el derecho mueve. */
  private enablePointer() {
    const canvas = this.app.canvas
    canvas.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault()
        const before = this.world.toLocal({ x: ev.offsetX, y: ev.offsetY })
        this.zoom = Math.min(MAX_SCALE / this.baseScale(), Math.max(1, this.zoom * Math.pow(1.15, -Math.sign(ev.deltaY))))
        if (this.zoom === 1) this.pan = { x: 0, y: 0 }
        this.fit()
        // Sin nadie a quien seguir, mantiene bajo el cursor el mismo punto del mapa.
        if (this.onEdit || !this.follow || !this.selected) {
          const after = this.world.toGlobal(before)
          this.pan.x += ev.offsetX - after.x
          this.pan.y += ev.offsetY - after.y
          this.fit()
        }
      },
      { passive: false },
    )
    canvas.addEventListener('contextmenu', (ev) => this.onEdit && ev.preventDefault())
    let drag: { x: number; y: number; moved: boolean } | null = null
    let drawing = false
    canvas.addEventListener('pointerdown', (ev) => {
      if (this.onEdit && ev.button === 0) {
        drawing = true
        this.onEdit({ type: 'down', tile: this.tileAt(ev) })
        return
      }
      drag = { x: ev.clientX, y: ev.clientY, moved: false }
    })
    canvas.addEventListener('pointerleave', () => !drawing && this.onEdit?.({ type: 'leave', tile: { x: -1, y: -1 } }))
    window.addEventListener('pointerup', (ev) => {
      if (drawing) {
        drawing = false
        this.onEdit?.({ type: 'up', tile: this.tileAt(ev) })
      }
      setTimeout(() => (drag = null))
    })
    window.addEventListener('pointermove', (ev) => {
      if (this.onEdit && !drag && (drawing || ev.target === canvas)) this.onEdit({ type: 'move', tile: this.tileAt(ev) })
      if (!drag) return
      const dx = ev.clientX - drag.x
      const dy = ev.clientY - drag.y
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
      if (!drag.moved) return
      // Arrastrar suelta la cámara del elegido.
      if (this.follow) {
        this.follow = false
        const t = this.cameraTarget()
        this.pan = { x: this.world.x - t.x, y: this.world.y - t.y }
      }
      this.pan.x += dx
      this.pan.y += dy
      drag.x = ev.clientX
      drag.y = ev.clientY
      this.fit()
    })
    canvas.addEventListener('dblclick', () => !this.onEdit && this.resetView())
    this.dragging = () => !!drag?.moved
  }

  // ── Mapa ─────────────────────────────────────────────────────────────────

  /** Pone otra oficina (o la misma, redibujada) y reacomoda a quien ya está adentro. */
  async setMap(map: OfficeMap) {
    setMap(map)
    await this.ready
    this.drawMap()
    this.place(true)
    this.fit()
  }

  /** Sprite apoyado en el suelo: `x` es su centro y `y` su base, que además decide a quién tapa. */
  private put(name: string, x: number, y: number, o: { z?: number; flip?: boolean; layer?: Container } = {}): Sprite {
    const s = new Sprite(tex(name))
    s.anchor.set(0.5, 1)
    s.position.set(Math.round(x), Math.round(y))
    if (o.flip) s.scale.x = -1
    s.zIndex = o.z ?? y
    this.add(s, o.layer)
    return s
  }

  private add(c: Container, layer: Container = this.objects) {
    layer.addChild(c)
    if (layer === this.objects) this.fixtures.push(c)
  }

  private tiled(name: string, x: number, y: number, w: number, h: number, layer: Container, z = 0) {
    const t = new TilingSprite({ texture: tex(name), width: w, height: h })
    t.position.set(x, y)
    t.zIndex = z
    this.add(t, layer)
  }

  /** Tramos seguidos de casillas iguales en cada fila: se dibujan de una pieza. */
  private runs(value: (x: number, y: number) => string, draw: (id: string, x: number, y: number, n: number) => void) {
    const { w, h } = plan().map
    for (let y = 0; y < h; y++) {
      let start = 0
      for (let x = 1; x <= w; x++) {
        const id = value(start, y)
        if (x < w && value(x, y) === id) continue
        if (id) draw(id, start, y, x - start)
        start = x
      }
    }
  }

  private drawMap() {
    for (const f of this.fixtures) f.destroy({ children: true })
    this.fixtures = []
    for (const layer of [this.ground, this.guides]) for (const c of layer.removeChildren()) c.destroy({ children: true })

    const map = plan().map
    this.runs(
      (x, y) => map.floor[y * map.w + x],
      (id, x, y, n) => FLOOR[id] && this.tiled(FLOOR[id], x * TILE, y * TILE, n * TILE, TILE, this.ground),
    )

    this.drawWalls(map)

    for (const it of map.items) {
      // Un mapa guardado puede traer una pieza cuyo arte ya no está: se salta esa, no la oficina entera.
      try {
        this.drawItem(it)
      } catch (err) {
        console.warn(`No se pudo dibujar ${it.piece}:`, (err as Error).message)
      }
    }
    this.drawGuides()
  }

  /** Juego de piezas de un muro según su material y su altura. */
  private kit(map: OfficeMap, x: number, y: number): string {
    if (wallAt(map, x, y) === 'ventanal') return 'ventanales'
    return wallHeight(map, x, y) === 'baja' ? 'paredes_bajas' : 'paredes'
  }

  /**
   * Muros con el kit de piezas: de frente, un tramo por casilla apoyado en el
   * borde inferior de la suya, con remate donde termina; de canto, solo la
   * tapa, levantada a la altura del muro, y un poste donde acaba.
   */
  private drawWalls(map: OfficeMap) {
    const solid = (x: number, y: number) => {
      const w = wallAt(map, x, y)
      return !!w && w !== DOOR
    }
    const front = (x: number, y: number) => solid(x, y) && wallFacing(map, x, y) === 'frente'
    const cap = (kit: string, x: number, y: number, z: number) => {
      const s = new Sprite(tex(`${kit}/columna`))
      s.position.set(x * TILE, y * TILE - (tex(`${kit}/tramo`).height - CAP))
      s.zIndex = z
      this.add(s)
    }
    this.runs(
      (x, y) => (front(x, y) ? this.kit(map, x, y) : ''),
      (kit, x, y, n) => {
        const h = tex(`${kit}/tramo`).height
        const bottom = (y + 1) * TILE
        const left = solid(x - 1, y) ? 0 : 1
        const right = solid(x + n, y) && n > left ? 0 : 1
        if (left) this.put(`${kit}/tramo_izq`, cx(x), bottom)
        if (right && n > left) this.put(`${kit}/tramo_der`, cx(x + n - 1), bottom)
        const mid = n - left - (n > left ? right : 0)
        if (mid > 0) this.tiled(`${kit}/tramo`, (x + left) * TILE, bottom - h, mid * TILE, h, this.objects, bottom)
      },
    )
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        if (wallAt(map, x, y) === DOOR) this.drawDoor(map, x, y)
        if (!solid(x, y)) continue
        const kit = this.kit(map, x, y)
        const bottom = (y + 1) * TILE
        if (front(x, y)) {
          // Esquina de abajo: la tapa del muro que baja llega hasta aquí; el tramo le tapa lo que sobra.
          if (solid(x, y - 1) && !front(x, y - 1)) cap(this.kit(map, x, y - 1), x, y, bottom - 1)
          continue
        }
        cap(kit, x, y, bottom)
        if (!wallAt(map, x, y + 1)) this.put(`${kit}/poste`, cx(x), bottom)
      }
  }

  /** Puerta de vidrio donde el hueco está en un ventanal; en pared queda el hueco. Dos huecos seguidos son una puerta doble. */
  private drawDoor(map: OfficeMap, x: number, y: number) {
    const door = (tx: number) => wallAt(map, tx, y) === DOOR
    if (door(x - 1)) return // la dibujó su hoja izquierda
    let end = x
    while (door(end + 1)) end++
    if (wallAt(map, x - 1, y) !== 'ventanal' && wallAt(map, end + 1, y) !== 'ventanal') return
    const bottom = (y + 1) * TILE
    for (let tx = x; tx <= end; tx += 2) {
      if (tx < end) this.put('ventanales/puerta_alta', (tx + 1) * TILE, bottom)
      else this.put('ventanales/puerta_alta_1', cx(tx), bottom)
    }
  }

  /** ¿Hay en esa casilla un puesto de ese tipo? Para saber si dos hileras se dan la cara. */
  private stationAt(x: number, y: number, kind: string): boolean {
    return plan().map.items.some((i) => i.x === x && i.y === y && getPiece(i.piece)?.kind === kind)
  }

  private drawItem(it: Item) {
    const p = getPiece(it.piece)
    if (!p?.sprite) return
    const x = (it.x + p.w / 2) * TILE
    const y = (it.y + p.h) * TILE
    switch (p.kind) {
      case 'rug':
        this.put(p.sprite, x, y, { layer: this.ground, flip: it.flip })
        break
      case 'hang': {
        // Colgado en la cara del muro de su casilla; en un murete apenas cabe.
        const bottom = (it.y + 1) * TILE
        this.put(p.sprite, x, bottom - this.hangUp(it), { z: bottom + 2, flip: it.flip })
        break
      }
      case 'top':
        this.put(p.sprite, x, y - 26, { z: y + 2, flip: it.flip })
        break
      case 'station':
        // Un puesto vacío: escritorio y silla. El monitor llega con quien lo ocupa.
        this.put(p.sprite, x, y)
        this.put('puesto/silla_atras', x, y + BACK.chair, { z: y + BACK.chair + 1 })
        if (this.stationAt(it.x, it.y - 1, 'stationFront')) {
          // Frente a frente con el de arriba: mamparas entre las hileras y entre vecinos.
          this.put('cubiculos/mampara_fondo', x, y + PANEL.back, { z: y - 2 })
          for (const edge of [it.x, it.x + p.w]) {
            if (edge === it.x + p.w && this.stationAt(edge, it.y, 'station') && this.stationAt(edge, it.y - 1, 'stationFront')) continue
            this.put('cubiculos/mampara_lado_atras', edge * TILE, y + PANEL.sideBehind, { z: y - 46 })
            this.put('cubiculos/mampara_lado', edge * TILE, y + PANEL.side, { z: y + 2 })
          }
        }
        break
      case 'stationFront':
      case 'boss':
        this.put('puesto/silla_frente', x, y + FRONT.chair, { z: y - 3 })
        this.put(p.sprite, x, y)
        break
      case 'stationRight':
      case 'stationLeft': {
        // De perfil: el escritorio corre de arriba abajo y la silla va a su lado, mirándolo.
        const right = p.kind === 'stationRight'
        const dir = right ? 1 : -1
        this.put(p.sprite, cx(right ? it.x + 1 : it.x), y)
        this.put('puesto_lados/silla_lado', cx(right ? it.x : it.x + 1) + SIDE.chairIn * dir, y + SIDE.chair, { z: y - 1, flip: !right })
        if (right && this.stationAt(it.x + 2, it.y, 'stationLeft')) {
          // Se dan la cara: mampara donde se tocan los dos escritorios, y su remate al final de la columna.
          const edge = (it.x + 2) * TILE
          this.put('cubiculos/mampara_vertical', edge, y + SIDE.panel, { z: y + 2 })
          const more = this.stationAt(it.x, it.y + 2, 'stationRight') && this.stationAt(it.x + 2, it.y + 2, 'stationLeft')
          if (!more) this.put('cubiculos/mampara_vertical_fin', edge, y, { z: y + 3 })
        }
        break
      }
      case 'table':
        this.put(p.sprite, x, y)
        // Cada silla mira a la mesa; quien se siente queda entre su silla y la mesa.
        this.put('cafeteria/silla_madera_lado', cx(it.x) + TABLE.chairIn, y + TABLE.chair, { z: y - 1 })
        this.put('cafeteria/silla_madera_lado', cx(it.x + 2) - TABLE.chairIn, y + TABLE.chair, { z: y - 1, flip: true })
        break
      default:
        this.put(p.sprite, x, y, { flip: it.flip })
    }
  }

  /** Cuánto sube lo colgado desde la base del muro. */
  private hangUp(it: Item): number {
    const map = plan().map
    return wallAt(map, it.x, it.y) && wallHeight(map, it.x, it.y) === 'baja' ? 10 : 34
  }

  private plate(text: string, x: number, y: number, layer: Container, size = 24, color = ACCENT) {
    const label = new Text({ text, style: { fontFamily: 'monospace', fontSize: size, fill: color, fontWeight: 'bold' } })
    label.position.set(x + 8, y + 4)
    layer.addChild(new Graphics().rect(x, y, label.width + 16, label.height + 8).fill({ color: PLATE, alpha: 0.9 }), label)
  }

  /** Lo que solo importa al dibujar: cuadrícula y marcas. */
  private drawGuides() {
    const map = plan().map
    const g = new Graphics()
    for (let x = 0; x <= map.w; x++) g.moveTo(x * TILE, 0).lineTo(x * TILE, map.h * TILE)
    for (let y = 0; y <= map.h; y++) g.moveTo(0, y * TILE).lineTo(map.w * TILE, y * TILE)
    g.stroke({ color: 0xffffff, width: 2, alpha: 0.16 })
    g.rect(0, 0, map.w * TILE, map.h * TILE).stroke({ color: ACCENT, width: 3, alpha: 0.6 })
    this.guides.addChild(g)
    for (const it of map.items) {
      const kind = getPiece(it.piece)?.kind
      if (kind !== 'entrance' && kind !== 'queue') continue
      const color = kind === 'entrance' ? 0x66bb6a : ACCENT
      g.rect(it.x * TILE + 4, it.y * TILE + 4, TILE - 8, TILE - 8).fill({ color, alpha: 0.45 }).stroke({ color, width: 3 })
      this.plate(kind === 'entrance' ? 'ENTRADA' : 'FILA', it.x * TILE, it.y * TILE - 22, this.guides, 14, color)
    }
  }

  // ── Modo creativo ────────────────────────────────────────────────────────

  /** Con un manejador, el botón izquierdo dibuja en vez de elegir gente; con null vuelve a la oficina. */
  setEditing(handler: ((e: EditEvent) => void) | null) {
    this.onEdit = handler
    this.ready.then(() => {
      this.guides.visible = !!handler
      this.app.canvas.style.cursor = handler ? 'crosshair' : ''
      if (!handler) this.setPreview(null)
      this.fit()
    })
  }

  setPreview(p: Preview | null) {
    for (const c of this.preview.removeChildren()) c.destroy({ children: true })
    if (!p) return
    if (p.rect) {
      const color = p.removes ? 0xef5350 : ACCENT
      const r = p.rect
      this.preview.addChild(new Graphics().rect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE).fill({ color, alpha: 0.25 }).stroke({ color, width: 3 }))
    }
    const piece = p.item && getPiece(p.item.piece)
    if (p.item && piece?.sprite) {
      const ghost = new Sprite(tex(piece.sprite))
      ghost.anchor.set(0.5, 1)
      ghost.alpha = 0.7
      if (p.item.flip) ghost.scale.x = -1
      const up = piece.kind === 'hang' ? this.hangUp(p.item) : piece.kind === 'top' ? 26 : 0
      ghost.position.set((p.item.x + piece.w / 2) * TILE, (p.item.y + piece.h) * TILE - up)
      this.preview.addChild(ghost)
    }
  }

  // ── Personas ─────────────────────────────────────────────────────────────

  async sync(list: SceneEmployee[], selected: string | null) {
    await this.ready
    if (selected !== this.selected) this.follow = true
    this.selected = selected
    this.list = list
    this.place(false)
  }

  /** Reparte puestos y manda a cada quien a su lugar. `replan`: el mapa cambió bajo sus pies. */
  private place(replan: boolean) {
    this.desks = assignDesks(this.list, this.deskIndex)
    for (const [id, d] of this.desks) this.deskIndex.set(id, d.index)
    // Quien espera a otro se para cerca de él, cada quien en su casilla.
    const spots = waitingSpots(
      this.list.filter((e) => e.state === 'waiting').map((e) => ({ id: e.id, near: (this.desks.get(e.waitingFor ?? '') ?? this.desks.get(e.id)!).seat })),
    )

    const seen = new Set<string>()
    for (const e of this.list) {
      seen.add(e.id)
      const desk = this.desks.get(e.id)!
      let view = this.views.get(e.id)
      if (!view) view = this.addActor(e, desk)
      if (e.name && view.label.text !== e.name) this.setName(view, e.name)
      const dependencyDesk = e.waitingFor ? this.desks.get(e.waitingFor) : undefined
      view.actor.setState(e.state, { desk, dependencyDesk, slot: e.slot, standAt: spots.get(e.id) }, replan)
    }
    // Despedidos: caminan a la salida antes de desaparecer.
    for (const [id, v] of this.views) if (!seen.has(id)) v.actor.setState('exited', undefined, replan)
  }

  /** Placa: insignia del proveedor, nombre y rol. */
  private setName(v: ActorView, name: string) {
    v.label.text = name
    const w = Math.max(24, v.label.width, v.role.width)
    const h = v.label.height + v.role.height - 2
    const color = PROVIDER_COLOR[v.provider] ?? 0x9e9e9e
    v.role.position.set(0, v.label.height - 2)
    v.plate
      .clear()
      .rect(-w / 2 - 4, -2, w + 8, h + 4)
      .fill({ color: PLATE, alpha: 0.85 })
      .rect(-w / 2 - 4, h + 2, w + 8, 3)
      .fill(color)
      // Insignia a la izquierda: de un vistazo, qué IA es.
      .rect(-w / 2 - 4 - BADGE, -2, BADGE, h + 7)
      .fill(color)
    v.tagWidth = w + 8
    const code = v.tag.getChildByLabel('code') as Text
    code.position.set(-w / 2 - 4 - BADGE / 2, (h + 3) / 2)
  }

  private addActor(e: SceneEmployee, desk: Desk): ActorView {
    const actor = new Actor(e.id, { desk })
    const character = characterFor(e.id, e.role)
    const root = new Container()
    const ring = new Graphics()
    const body = new Sprite(tex(`${character}/front`))
    body.anchor.set(0.5, 1)
    const bubble = new Graphics()
    bubble.scale.set(3)
    root.addChild(ring, body, bubble)
    root.eventMode = 'static'
    root.cursor = 'pointer'
    root.hitArea = { contains: (x: number, y: number) => x >= -32 && x <= 32 && y >= -126 && y <= 8 }
    root.on('pointertap', () => !this.onEdit && !this.dragging() && this.onSelect(e.id))
    this.objects.addChild(root)

    const tag = new Container()
    const plate = new Graphics()
    const label = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 20, fill: 0xece9f7, fontWeight: 'bold' } })
    label.anchor.set(0.5, 0)
    const role = new Text({ text: e.role, style: { fontFamily: 'monospace', fontSize: 14, fill: 0xb7b3cf } })
    role.anchor.set(0.5, 0)
    // Texto oscuro o claro según el color del proveedor.
    const light = ((PROVIDER_COLOR[e.provider] ?? 0x9e9e9e) & 0xff00) >> 8 > 0x90
    const code = new Text({ text: PROVIDER_CODE[e.provider] ?? '??', style: { fontFamily: 'monospace', fontSize: 15, fill: light ? 0x14121c : 0xffffff, fontWeight: 'bold' } })
    code.label = 'code'
    code.anchor.set(0.5)
    tag.addChild(plate, label, role, code)
    this.tags.addChild(tag)

    const monitor = new Sprite(tex('puesto/monitor'))
    monitor.anchor.set(0.5, 1)
    this.objects.addChild(monitor)
    const view: ActorView = { actor, provider: e.provider, character, root, body, bubble, ring, monitor, tag, label, role, plate, tagWidth: 0 }
    this.setName(view, e.name ?? '')
    this.views.set(e.id, view)
    return view
  }

  private frame(dt: number) {
    this.tick += dt
    for (const [id, v] of this.views) {
      v.actor.update(dt)
      if (v.actor.gone) {
        v.root.destroy({ children: true })
        v.tag.destroy({ children: true })
        v.monitor.destroy()
        this.views.delete(id)
        continue
      }
      this.drawActor(v)
      this.drawMonitor(v)
    }
    this.fit(dt)
  }

  private drawMonitor(v: ActorView) {
    const d = v.actor.ctx.desk
    v.monitor.visible = !d.virtual
    if (d.virtual) return
    const mode = v.actor.walking && v.actor.state !== 'working' ? 'off' : v.actor.look.monitor
    v.monitor.scale.x = 1
    if (d.faces === 'left' || d.faces === 'right') {
      // De perfil el monitor es un canto: se ve la pantalla hacia quien lo usa.
      const dir = d.faces === 'right' ? 1 : -1
      const bottom = base(d.seat.y)
      v.monitor.texture = tex(d.faces === 'right' ? 'puesto_lados/monitor_lado_der' : 'puesto_lados/monitor_lado_izq')
      v.monitor.position.set(d.mid * TILE + SIDE.monitorIn * dir, bottom + SIDE.monitor)
      v.monitor.zIndex = bottom + 1
      v.monitor.tint = mode === 'off' ? 0x7a7a86 : 0xffffff
      return
    }
    const y = base(d.desk.y)
    const front = d.faces === 'down'
    v.monitor.position.set(d.mid * TILE, y + (front ? FRONT : BACK).monitor)
    v.monitor.zIndex = y + 1
    if (front) {
      // De frente solo se le ve la espalda al monitor: apagado se oscurece.
      v.monitor.texture = tex('puesto/monitor_atras')
      v.monitor.tint = mode === 'off' ? 0x7a7a86 : 0xffffff
      return
    }
    v.monitor.tint = 0xffffff
    const on = monitorFrames()
    v.monitor.texture = mode === 'off' ? tex('puesto/monitor_apagado') : mode === 'blink' ? on[Math.floor(this.tick * 5) % on.length] : on[0]
  }

  /**
   * Placa de quien trabaja de perfil: hacia afuera, a la altura de su cabeza.
   * Bajo los pies taparía al de abajo. Las de quien mira a la izquierda van
   * media altura más abajo, para que en el pasillo entre dos bloques no choquen
   * con las del bloque de junto.
   */
  private sideTag(v: ActorView, d: Desk): [number, number] {
    const out = d.faces === 'right' ? -1 : 1
    const half = v.tagWidth / 2
    // La insignia queda a la izquierda del nombre: del lado derecho hay que dejarle su lugar.
    const x = cx(d.seat.x) + out * (SIDE.tagOut + half) + (out > 0 ? BADGE : 0)
    return [x, base(d.seat.y) + SIDE.tag + (out > 0 ? SIDE.tagStep : 0)]
  }

  private drawActor(v: ActorView) {
    const { actor, body } = v
    const { place } = actor.look
    const pose = actor.pose
    const p: Point = actor.pos
    const d = actor.ctx.desk
    let texture = tex(`${v.character}/front`)
    let flip = false
    let x = cx(p.x)
    let y = base(p.y)
    let z = y
    let bob = 0
    /** La placa va bajo los pies; detrás de un escritorio va sobre su frente, como el letrero de un puesto. */
    let tagY: number | undefined
    let tagX: number | undefined
    if (pose === 'walk') {
      const dir = actor.facing()
      if (dir === 'left' || dir === 'right') {
        const frames = walkFrames(v.character)
        texture = frames[Math.floor(this.tick * 10) % frames.length]
        flip = dir === 'left'
      } else {
        if (dir === 'up') texture = tex(`${v.character}/back`)
        bob = Math.floor(this.tick * 8) % 2
      }
    } else if (place === 'desk' && pose !== 'stand' && !d.virtual && (d.faces === 'left' || d.faces === 'right')) {
      // De perfil, pegado a su escritorio. La placa va sobre el escritorio: bajo los pies taparía al de abajo.
      const dir = d.faces === 'right' ? 1 : -1
      texture = sideWork(v.character, pose === 'type' ? Math.floor(this.tick * 6) % 4 : -1)
      if (pose === 'type' && !hasSideWork(v.character)) bob = Math.floor(this.tick * 6) % 2
      flip = dir < 0
      x = cx(d.seat.x) + SIDE.personIn * dir
      y = base(d.seat.y) + SIDE.person
      z = base(d.seat.y) - 2
      ;[tagX, tagY] = this.sideTag(v, d)
    } else if (place === 'desk' && pose !== 'stand' && !d.virtual) {
      const typing = pose === 'type'
      const frame = typing ? Math.floor(this.tick * 6) % 4 : 0
      x = d.mid * TILE
      if (d.faces === 'down') {
        // De frente, detrás de su escritorio: se le ve de la cintura para arriba.
        texture = typing ? workFrames(v.character, 'frente')[frame] : tex(`${v.character}/sit_front`)
        y = base(d.desk.y) + FRONT.person
        z = base(d.desk.y) - 2
        tagY = base(d.desk.y) - TAG_UP
      } else {
        // De espaldas, metido en su silla: la silla lo tapa de los hombros para abajo.
        texture = typing ? workFrames(v.character, 'espalda')[frame] : tex(`${v.character}/back`)
        y = base(d.desk.y) + BACK.person
        z = base(d.desk.y) + BACK.chair
      }
    } else if (place === 'desk' && !d.virtual) {
      if (d.faces === 'left' || d.faces === 'right') {
        // De pie junto a su silla (te necesita); la placa no se mueve.
        ;[tagX, tagY] = this.sideTag(v, d)
      } else {
        // De pie en su puesto: al centro del escritorio, como cuando está sentado.
        x = d.mid * TILE
        if (d.faces === 'down') tagY = base(d.desk.y) - TAG_UP
      }
    } else if (place === 'arcade') {
      texture = tex(`${v.character}/back`)
      bob = Math.floor(this.tick * 6) % 2
    } else if (place === 'cafeteria' && plan().cafe.length) {
      texture = tex(`${v.character}/sit`)
      flip = cafeSeat(actor.ctx.slot ?? 0).faces === 'left'
      x += TABLE.personIn * (flip ? -1 : 1)
      // La placa se queda en el piso, no sube con él.
      tagY = y + 6
      z = y - 2
      y += TABLE.person
    }
    body.texture = texture
    body.scale.x = flip ? -1 : 1
    body.y = -bob * 2
    v.root.position.set(Math.round(x), Math.round(y))
    v.root.zIndex = z
    v.tag.position.set(Math.round(tagX ?? x), Math.round(tagY ?? y + 6))

    v.ring.clear()
    if (this.selected === actor.id) v.ring.ellipse(0, -2, 30, 10).stroke({ color: ACCENT, width: 4 })

    v.bubble.clear()
    const b = actor.walking ? null : actor.look.bubble
    if (b) {
      const icon = BUBBLE_ICON[b]
      const float = Math.round(Math.sin(this.tick * 4)) // flota un poco
      // Sobre la cabeza, a un lado, para no tapar el monitor.
      const bx = 4
      const by = -Math.round(body.height / 3) - 14 + float
      v.bubble.rect(bx, by, 11, 11).fill(0xffffff)
      v.bubble.rect(bx + 4, by + 11, 3, 2).fill(0xffffff)
      v.bubble.rect(bx, by, 11, 11).stroke({ color: icon.color, width: 1, alignment: 1 })
      if (b !== 'alert' || Math.floor(this.tick * 3) % 2 === 0) pixels(v.bubble, icon.rows, { X: icon.color }, bx + 2, by + 2)
    }
  }

  destroy() {
    this.observer?.disconnect()
    this.ready.then(() => this.app.destroy(true, { children: true }))
  }
}
