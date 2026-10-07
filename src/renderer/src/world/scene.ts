/**
 * Dibuja la oficina con PixiJS. No decide nada: lee el plano (layout.ts) y lo
 * que debe verse de cada empleado (behavior.ts) y lo pinta.
 */
import 'pixi.js/unsafe-eval' // la CSP de la app no permite eval
import { Application, Container, Graphics, Text } from 'pixi.js'
import { Actor, type VisualState } from './behavior'
import { assignDesks, MAP_H, MAP_W, ROOMS, TILE, type Desk, type Room } from './layout'
import { BUBBLE_ICON, characterFrame, FLOOR, paletteFor, WALL, WALL_TOP, type Palette } from './sprites'

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface SceneEmployee {
  id: string
  role: string
  provider: string
  state: VisualState
}

interface ActorView {
  actor: Actor
  provider: string
  palette: Palette
  root: Container
  body: Graphics
  bubble: Graphics
  ring: Graphics
  monitor: Graphics
}

const CHAR_W = 10
const CHAR_H = 14

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
  private furniture = new Graphics()
  private monitors = new Container()
  private people = new Container()
  private views = new Map<string, ActorView>()
  private deskIndex = new Map<string, number>()
  private desks = new Map<string, Desk>()
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
    this.app.stage.addChild(this.world)
    this.world.addChild(this.drawMap(), this.furniture, this.monitors, this.people)
    this.world.eventMode = 'static'
    this.world.hitArea = { contains: () => true }
    this.world.on('pointertap', (e) => {
      if (e.target === this.world && !this.dragging()) this.onSelect(null)
    })
    this.app.ticker.add((t) => this.frame(t.deltaMS / 1000))
    this.app.renderer.on('resize', () => this.fit())
    // El drawer en modo dividido cambia el tamaño sin que cambie la ventana.
    this.observer = new ResizeObserver(() => this.app.resize())
    this.observer.observe(this.parent)
    this.enableZoomAndPan()
    this.fit()
  }

  /**
   * Escala: la más grande, en medios pasos y nunca menor a 1, con la que cabe
   * el mapa bajo el HUD; encima va el zoom del usuario. Posición: centrado en la
   * zona libre (sin HUD ni drawer). Si el mapa no cabe ahí y hay alguien
   * elegido, la cámara lo sigue; si no, el usuario lo mueve arrastrando.
   */
  private cameraTarget(): { x: number; y: number; scale: number } {
    const { width, height } = this.app.screen
    const i = this.insets
    const base = Math.max(1, Math.floor(Math.min(width / (MAP_W * TILE), (height - i.top - i.bottom) / (MAP_H * TILE)) * 2) / 2)
    const scale = base * this.zoom
    const w = Math.max(1, width - i.left - i.right)
    const h = Math.max(1, height - i.top - i.bottom)
    const mw = MAP_W * TILE * scale
    const mh = MAP_H * TILE * scale
    const focus = this.selected ? this.views.get(this.selected)?.actor.pos : undefined
    const axis = (start: number, size: number, map: number, f: number | undefined, pan: number) => {
      if (map <= size && this.zoom === 1) return start + (size - map) / 2
      const centered = f !== undefined ? start + size / 2 - (f + 0.5) * TILE * scale : start + (size - map) / 2 + pan
      // Que no quede hueco innecesario a los lados.
      return map <= size ? centered : Math.min(start, Math.max(start + size - map, centered))
    }
    return {
      scale,
      x: axis(i.left, w, mw, focus && this.follow ? focus.x : undefined, this.pan.x),
      y: axis(i.top, h, mh, focus && this.follow ? focus.y : undefined, this.pan.y),
    }
  }

  private fit(smooth = 0) {
    const t = this.cameraTarget()
    this.world.scale.set(t.scale)
    const k = smooth ? Math.min(1, smooth * 8) : 1
    this.world.position.set(
      Math.round(this.world.x + (t.x - this.world.x) * k),
      Math.round(this.world.y + (t.y - this.world.y) * k),
    )
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

  private enableZoomAndPan() {
    const canvas = this.app.canvas
    canvas.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault()
        const before = this.world.toLocal({ x: ev.offsetX, y: ev.offsetY })
        this.zoom = Math.min(4, Math.max(1, this.zoom * Math.pow(1.15, -Math.sign(ev.deltaY))))
        if (this.zoom === 1) this.pan = { x: 0, y: 0 }
        this.fit()
        // Sin nadie a quien seguir, mantiene bajo el cursor el mismo punto del mapa.
        if (!this.follow || !this.selected) {
          const after = this.world.toGlobal(before)
          this.pan.x += ev.offsetX - after.x
          this.pan.y += ev.offsetY - after.y
          this.fit()
        }
      },
      { passive: false },
    )
    let drag: { x: number; y: number; moved: boolean } | null = null
    canvas.addEventListener('pointerdown', (ev) => (drag = { x: ev.clientX, y: ev.clientY, moved: false }))
    window.addEventListener('pointerup', () => setTimeout(() => (drag = null)))
    window.addEventListener('pointermove', (ev) => {
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
    canvas.addEventListener('dblclick', () => this.resetView())
    this.dragging = () => !!drag?.moved
  }

  private drawMap(): Container {
    const c = new Container()
    const g = new Graphics()
    // Pasillos: todo lo que no es cuarto.
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) g.rect(x * TILE, y * TILE, TILE, TILE).fill(FLOOR.corridor[(x + y) % 2])
    for (const r of ROOMS) this.drawRoom(g, c, r)
    c.addChildAt(g, 0)
    return c
  }

  private drawRoom(g: Graphics, labels: Container, r: Room) {
    const [a, b] = FLOOR[r.kind]
    const px = r.x * TILE
    const py = r.y * TILE
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) g.rect(px + x * TILE, py + y * TILE, TILE, TILE).fill((x + y) % 2 ? a : b)
    // Muros: anillo del cuarto, con la cara superior más alta.
    g.rect(px, py, r.w * TILE, TILE).fill(WALL_TOP)
    g.rect(px, py, r.w * TILE, 3).fill(WALL)
    g.rect(px, py + (r.h - 1) * TILE + 12, r.w * TILE, 4).fill(WALL)
    g.rect(px, py, 3, r.h * TILE).fill(WALL)
    g.rect(px + r.w * TILE - 3, py, 3, r.h * TILE).fill(WALL)
    // Puerta.
    const doorTop = r.door.y === r.y
    g.rect(r.door.x * TILE - 4, r.door.y * TILE, TILE + 8, TILE).fill(FLOOR[r.kind][0])
    g.rect(r.door.x * TILE - 4, r.door.y * TILE + (doorTop ? 0 : 12), TILE + 8, 4).fill(0x8d6e63)

    const label = new Text({
      text: r.name.toUpperCase(),
      style: { fontFamily: 'monospace', fontSize: 7, fill: 0xece9f7, fontWeight: 'bold' },
    })
    label.resolution = 4
    label.position.set(px + 6, py + 4)
    labels.addChild(label)

    this.drawDecor(g, r)
  }

  private drawDecor(g: Graphics, r: Room) {
    const at = (x: number, y: number) => [(r.x + x) * TILE, (r.y + y) * TILE] as const
    const plant = (x: number, y: number) => {
      const [px, py] = at(x, y)
      g.rect(px + 4, py + 9, 8, 6).fill(0x8d6e63)
      g.rect(px + 2, py + 1, 12, 9).fill(0x43a047)
      g.rect(px + 5, py - 2, 6, 5).fill(0x66bb6a)
    }
    switch (r.kind) {
      case 'reception': {
        const [bx, by] = at(5, 2)
        g.rect(bx, by, TILE * 4, TILE).fill(0x6d4c41)
        g.rect(bx, by, TILE * 4, 4).fill(0x8d6e63)
        // Tablón con la reputación del mercado (fase 3).
        const [tx, ty] = at(8, 0)
        g.rect(tx, ty + 4, TILE * 3, TILE - 2).fill(0xbcaaa4)
        for (let i = 0; i < 4; i++) g.rect(tx + 4 + i * 11, ty + 7, 7, 7).fill([0xfff59d, 0x90caf9, 0xa5d6a7, 0xffab91][i])
        plant(1, 1)
        plant(10, 5)
        break
      }
      case 'boss': {
        const [bx, by] = at(4, 2)
        g.rect(bx, by, TILE * 4, TILE + 4).fill(0x4e342e)
        g.rect(bx, by, TILE * 4, 4).fill(0x795548)
        g.rect(bx + 26, by - 10, 12, 10).fill(0x263238)
        g.rect(bx + 28, by - 8, 8, 6).fill(0x80deea)
        // El jefe: siempre en su escritorio, de frente.
        const boss = new Graphics()
        pixels(boss, characterFrame('stand', 0), { H: 0x9e9e9e, S: 0xf5d0b0, T: 0xf2b84b, P: 0x2f3a56, B: 0x1b1a24, E: 0x1b1a24 })
        boss.position.set(bx + 27, by - 22)
        this.furniture.addChild(boss)
        plant(1, 1)
        plant(10, 1)
        break
      }
      case 'cafeteria': {
        for (let i = 0; i < 2; i++) {
          const [tx, ty] = at(2 + i * 4, 3)
          g.rect(tx, ty, TILE * 2, TILE).fill(0xa1887f)
        }
        const [cx, cy] = at(10, 1)
        g.rect(cx, cy, TILE, TILE + 6).fill(0x455a64)
        g.rect(cx + 4, cy + 4, 8, 4).fill(0xef5350)
        plant(1, 6)
        break
      }
      case 'department':
        plant(r.w - 2, r.door.y === r.y ? r.h - 2 : 1)
        break
    }
  }

  private drawDesk(desk: Desk): Graphics {
    const g = new Graphics()
    const x = desk.desk.x * TILE
    const y = desk.desk.y * TILE
    g.rect(x - 4, y + 4, TILE + 8, TILE - 2).fill(0x8d6e63)
    g.rect(x - 4, y + 4, TILE + 8, 3).fill(0xa1887f)
    // Silla.
    g.rect(x + 2, y + TILE + 6, 12, 8).fill(0x37474f)
    this.furniture.addChild(g)
    return g
  }

  private drawMonitor(view: ActorView) {
    const desk = this.desks.get(view.actor.id)!
    const m = view.monitor
    const mode = view.actor.walking && view.actor.state !== 'working' ? 'off' : view.actor.look.monitor
    const lit = mode === 'on' || (mode === 'blink' && Math.floor(this.tick * 4) % 2 === 0)
    m.clear()
    const x = desk.desk.x * TILE + 1
    const y = desk.desk.y * TILE - 4
    m.rect(x, y, 14, 10).fill(0x263238)
    m.rect(x + 2, y + 2, 10, 6).fill(lit ? (mode === 'blink' ? 0x4fc3f7 : 0x80deea) : 0x37474f)
    m.rect(x + 6, y + 10, 2, 2).fill(0x263238)
  }

  async sync(list: SceneEmployee[], selected: string | null) {
    await this.ready
    if (selected !== this.selected) this.follow = true
    this.selected = selected
    this.desks = assignDesks(list, this.deskIndex)
    for (const [id, d] of this.desks) this.deskIndex.set(id, d.index)

    const seen = new Set<string>()
    for (const e of list) {
      seen.add(e.id)
      const desk = this.desks.get(e.id)!
      let view = this.views.get(e.id)
      if (!view) view = this.addActor(e, desk)
      view.actor.setState(e.state, { desk })
    }
    // Despedidos: caminan a la salida antes de desaparecer.
    for (const [id, v] of this.views) if (!seen.has(id)) v.actor.setState('exited')
  }

  private addActor(e: SceneEmployee, desk: Desk): ActorView {
    const actor = new Actor(e.id, { desk })
    const root = new Container()
    const ring = new Graphics()
    const body = new Graphics()
    const bubble = new Graphics()
    root.addChild(ring, body, bubble)
    root.eventMode = 'static'
    root.cursor = 'pointer'
    root.hitArea = { contains: (x: number, y: number) => x >= -2 && x <= CHAR_W + 2 && y >= -14 && y <= CHAR_H + 2 }
    root.on('pointertap', () => !this.dragging() && this.onSelect(e.id))
    this.people.addChild(root)
    const monitor = new Graphics()
    this.drawDesk(desk)
    this.monitors.addChild(monitor)
    const view: ActorView = { actor, provider: e.provider, palette: paletteFor(e.id, e.provider), root, body, bubble, ring, monitor }
    this.views.set(e.id, view)
    return view
  }

  private frame(dt: number) {
    this.tick += dt
    for (const [id, v] of this.views) {
      v.actor.update(dt)
      if (v.actor.gone) {
        v.root.destroy({ children: true })
        v.monitor.destroy()
        this.views.delete(id)
        continue
      }
      this.drawActor(v)
      this.drawMonitor(v)
    }
    this.fit(dt)
    // Los de abajo tapan a los de arriba.
    this.people.children.sort((a, b) => a.y - b.y)
  }

  private drawActor(v: ActorView) {
    const { actor } = v
    const pose = actor.pose
    const speed = pose === 'walk' ? 8 : pose === 'type' ? 6 : 1
    const rows = characterFrame(pose, this.tick * speed)
    v.body.clear()
    pixels(v.body, rows, v.palette as unknown as Record<string, number>)
    const flip = actor.facing() === 'left'
    v.body.scale.x = flip ? -1 : 1
    v.body.x = flip ? CHAR_W : 0

    // Sentado frente al escritorio queda más arriba, metido en la silla.
    const seated = pose === 'type' || pose === 'sit'
    v.root.position.set(Math.round(actor.pos.x * TILE + 3), Math.round(actor.pos.y * TILE + (seated ? -2 : -1)))

    v.ring.clear()
    if (this.selected === actor.id) v.ring.ellipse(CHAR_W / 2, CHAR_H + 1, 8, 3).stroke({ color: 0xf2b84b, width: 1.5 })

    v.bubble.clear()
    const b = actor.walking ? null : actor.look.bubble
    if (b) {
      const icon = BUBBLE_ICON[b]
      const bob = Math.round(Math.sin(this.tick * 4)) // flota un poco
      // Al lado de la cabeza, para no tapar el monitor.
      const bx = CHAR_W - 1
      const by = -9 + bob
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
