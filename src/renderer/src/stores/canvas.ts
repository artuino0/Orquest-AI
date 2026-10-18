/**
 * El lienzo de un proyecto: qué paneles hay, dónde quedó cada uno, la cámara
 * con que se mira y su fondo. Cada proyecto recuerda el suyo (en este
 * navegador: es acomodo de la vista, no del proyecto). La lógica de dónde va
 * cada cosa está en `canvas/layout.ts`.
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { Backdrop } from '../canvas/backdrops'
import {
  arrange,
  arrangeWidth,
  bounds,
  fitCamera,
  focusRects,
  freeSpot,
  GAP,
  inView,
  MIN_SIZE,
  panelId,
  reveal,
  shapeOf,
  SIZES,
  snap,
  startingPanels,
  toWorld,
  widenBoss,
  zoomAt,
  type Camera,
  type Panel,
  type PanelKind,
  type Point,
  type Rect,
  type Size,
} from '../canvas/layout'

export interface BackdropSettings {
  kind: Backdrop
  /** 0–0.9: cuánto se oscurece para que los paneles se lean. */
  dim: number
  guides: boolean
}

interface Saved {
  /** 1: el jefe nacía angosto; 2: ya con su columna a la derecha. */
  v: 1 | 2
  panels: Panel[]
  camera: Camera
  backdrop: BackdropSettings
}

const KEY = (root: string) => `orquest.lienzo.${root}`
const IMAGE_KEY = (root: string) => `orquest.lienzo.imagen.${root}`
const DEFAULT_BACKDROP: BackdropSettings = { kind: 'plain', dim: 0.45, guides: true }

/** El almacenamiento del navegador puede fallar (modo privado, cuota): el lienzo sigue sin él. */
const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Sin espacio: se queda solo en memoria.
  }
}

/** Una imagen subida, reducida para que quepa guardada. */
async function shrink(file: Blob, max = 1920): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * k)
  canvas.height = Math.round(bitmap.height * k)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.86)
}
/** La CSP no deja usar imágenes `data:` (ni pedirlas con fetch): se pasan a `blob:` a mano. */
const blobUrl = async (data: string) => {
  const [head, body] = data.split(',')
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  return URL.createObjectURL(new Blob([bytes], { type: head.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg' }))
}

export const useCanvas = defineStore('canvas', () => {
  const root = ref<string | null>(null)
  const panels = ref<Panel[]>([])
  const camera = ref<Camera>({ x: 0, y: 0, zoom: 1 })
  const view = ref<Size>({ w: 1200, h: 800 })
  const backdrop = ref<BackdropSettings>({ ...DEFAULT_BACKDROP })
  /** La imagen subida por el usuario para este proyecto (dirección blob:). */
  const image = ref<string | null>(null)
  /** El panel que tocaste al último: se resalta. */
  const active = ref<string | null>(null)
  /** Paneles enfocados (llenan la vista) y la cámara a la que se vuelve. */
  const focus = ref<{ ids: string[]; saved: Camera } | null>(null)
  /** La cámara se desliza en vez de saltar (al traer un panel, al «Ver todo»). */
  const glide = ref(false)
  /** Arrastrando o recorriendo: las páginas incrustadas no se quedan con el puntero. */
  const busy = ref(false)
  /** Recién cargado sin acomodo guardado: se encuadra al conocer el tamaño de la vista. */
  let fresh = false

  const get = (id: string) => panels.value.find((p) => p.id === id)
  const has = (id: string) => panels.value.some((p) => p.id === id)
  const top = () => Math.max(0, ...panels.value.map((p) => p.z))

  // ── Recordar por proyecto ────────────────────────────────────────────────
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  function persist() {
    if (!root.value) return
    const data: Saved = { v: 2, panels: panels.value, camera: focus.value?.saved ?? camera.value, backdrop: backdrop.value }
    write(KEY(root.value), JSON.stringify(data))
  }
  watch([panels, camera, backdrop], () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(persist, 300)
  }, { deep: true })

  async function load(next: string) {
    if (root.value === next) return
    clearTimeout(saveTimer)
    persist()
    root.value = next
    focus.value = null
    active.value = null
    let saved: Saved | null = null
    try {
      saved = JSON.parse(read(KEY(next)) ?? 'null') as Saved | null
    } catch {
      saved = null
    }
    const known = (p: Panel) => p && typeof p.x === 'number' && p.kind in SIZES
    if ((saved?.v === 1 || saved?.v === 2) && Array.isArray(saved.panels)) {
      panels.value = saved.v === 1 ? widenBoss(saved.panels.filter(known)) : saved.panels.filter(known)
      camera.value = saved.camera ?? { x: 0, y: 0, zoom: 1 }
      backdrop.value = { ...DEFAULT_BACKDROP, ...saved.backdrop }
      fresh = false
    } else {
      panels.value = startingPanels()
      backdrop.value = { ...DEFAULT_BACKDROP }
      fresh = true
    }
    if (image.value) URL.revokeObjectURL(image.value)
    image.value = null
    const data = read(IMAGE_KEY(next))
    if (data) image.value = await blobUrl(data).catch(() => null)
    if (fresh) fitAll(false)
  }

  /** La vista cambió de tamaño. La primera vez de un proyecto nuevo, se encuadra. */
  function resize(size: Size) {
    view.value = size
    if (fresh) {
      fresh = false
      fitAll(false)
    }
  }

  // ── Cámara ───────────────────────────────────────────────────────────────
  let glideTimer: ReturnType<typeof setTimeout> | undefined
  function setCamera(c: Camera, smooth = true) {
    if (smooth) {
      glide.value = true
      clearTimeout(glideTimer)
      glideTimer = setTimeout(() => (glide.value = false), 320)
    }
    camera.value = c
  }
  function panBy(dx: number, dy: number) {
    camera.value = { ...camera.value, x: camera.value.x + dx, y: camera.value.y + dy }
  }
  function zoomTo(zoom: number, at?: Point, smooth = false) {
    setCamera(zoomAt(camera.value, zoom, at ?? { x: view.value.w / 2, y: view.value.h / 2 }), smooth)
  }
  function fitAll(smooth = true) {
    const all = bounds(panels.value.map(shapeOf))
    if (all) setCamera(fitCamera(all, view.value, 56, 1), smooth)
  }
  /** Lleva la vista a un punto del plano (el minimapa). */
  function centerOn(p: Point, smooth = false) {
    const z = camera.value.zoom
    setCamera({ zoom: z, x: view.value.w / 2 - p.x * z, y: view.value.h / 2 - p.y * z }, smooth)
  }
  const center = () => toWorld(camera.value, { x: view.value.w / 2, y: view.value.h / 2 })

  // ── Paneles ──────────────────────────────────────────────────────────────
  function front(id: string) {
    const p = get(id)
    if (!p) return
    active.value = id
    if (p.z !== top()) p.z = top() + 1
  }
  function show(id: string) {
    const p = get(id)
    if (p && !focus.value) setCamera(reveal(camera.value, shapeOf(p), view.value))
  }

  /** De qué panel sale uno nuevo: la gente junto a la oficina, su versión junto a su panel. */
  function anchorOf(kind: PanelKind, ref?: string): Rect | undefined {
    const from = kind === 'version' && ref ? get(panelId('employee', ref)) : kind === 'employee' ? get('office') : undefined
    return from ? shapeOf(from) : undefined
  }

  /**
   * Abre un panel en el primer hueco libre (o lo trae si ya estaba). Con `at`,
   * donde se pidió (el menú del fondo).
   */
  function open(kind: PanelKind, ref?: string, at?: Point): Panel {
    const id = panelId(kind, ref)
    let p = get(id)
    if (p) {
      if (p.min) p.min = false
      if (at) Object.assign(p, { x: snap(at.x), y: snap(at.y) })
    } else {
      const size = SIZES[kind]
      const taken = panels.value.map(shapeOf)
      const spot = at ? freeSpot(taken, size, undefined, { x: at.x + size.w / 2, y: at.y + size.h / 2 }) : freeSpot(taken, size, anchorOf(kind, ref), center())
      p = { id, kind, ...(ref ? { ref } : {}), ...spot, ...size, z: top() + 1 }
      panels.value.push(p)
    }
    if (focus.value) unfocus()
    front(id)
    show(id)
    return get(id)!
  }

  function close(id: string) {
    panels.value = panels.value.filter((p) => p.id !== id)
    if (focus.value?.ids.includes(id)) {
      const rest = focus.value.ids.filter((x) => x !== id)
      if (rest.length) focus.value = { ...focus.value, ids: rest }
      else unfocus()
    }
    if (active.value === id) active.value = null
  }
  /** Botón de la barra: si no está, se abre; si ya está a la vista y encima, se cierra; si no, se trae. */
  function toggle(kind: PanelKind) {
    const p = get(kind)
    if (!p) return void open(kind)
    const r = shapeOf(p)
    const seen = !focus.value && active.value === p.id && !p.min && inView(r, camera.value, view.value)
    if (seen) close(p.id)
    else open(kind)
  }

  function move(id: string, x: number, y: number) {
    const p = get(id)
    if (p) Object.assign(p, { x, y })
  }
  function setSize(id: string, w: number, h: number) {
    const p = get(id)
    if (p) Object.assign(p, { w: Math.max(MIN_SIZE.w, w), h: Math.max(MIN_SIZE.h, h) })
  }
  function settle(id: string) {
    const p = get(id)
    if (p) Object.assign(p, { x: snap(p.x), y: snap(p.y), w: snap(p.w), h: snap(p.h) })
  }
  function toggleMin(id: string) {
    const p = get(id)
    if (p) p.min = !p.min
  }

  function arrangeAll() {
    if (focus.value) unfocus()
    const spots = arrange(panels.value, arrangeWidth(panels.value, view.value))
    for (const p of panels.value) Object.assign(p, spots[p.id])
    fitAll()
  }

  /** Los de alguien van juntos: su panel y su versión. */
  function related(p: Panel): string[] {
    if (p.kind === 'employee' && p.ref) return [p.id, panelId('version', p.ref)].filter(has)
    if (p.kind === 'version' && p.ref) return [panelId('employee', p.ref), p.id].filter(has)
    return [p.id]
  }
  function focusOn(id: string) {
    const p = get(id)
    if (!p) return
    if (focus.value?.ids.includes(id)) return unfocus()
    const saved = focus.value?.saved ?? camera.value
    for (const x of related(p)) {
      const q = get(x)
      if (q) q.min = false
    }
    // A zoom 1 para que las terminales se lean nítidas; el centro de la vista se queda donde estaba.
    setCamera(zoomAt(camera.value, 1, { x: view.value.w / 2, y: view.value.h / 2 }))
    focus.value = { ids: related(p), saved }
    front(id)
  }
  function unfocus() {
    if (!focus.value) return
    const saved = focus.value.saved
    focus.value = null
    setCamera(saved)
  }
  /** Dónde se dibuja cada panel enfocado (en el plano). */
  const focused = computed<Record<string, Rect>>(() => {
    if (!focus.value) return {}
    const list = focus.value.ids.map(get).filter((p): p is Panel => !!p)
    // Abajo queda la barra de «Volver al lienzo».
    return focusRects(list, camera.value, view.value, 16, 52)
  })

  /** Quita los paneles de quien ya no está en el proyecto. */
  function prune(alive: Set<string>) {
    for (const p of [...panels.value]) if ((p.kind === 'employee' || p.kind === 'version') && p.ref && !alive.has(p.ref)) close(p.id)
  }

  // ── Fondo ────────────────────────────────────────────────────────────────
  function setBackdrop(change: Partial<BackdropSettings>) {
    backdrop.value = { ...backdrop.value, ...change }
  }
  async function useImage(file: Blob) {
    if (!root.value) return
    const data = await shrink(file)
    write(IMAGE_KEY(root.value), data)
    if (image.value) URL.revokeObjectURL(image.value)
    image.value = await blobUrl(data)
    setBackdrop({ kind: 'image' })
  }
  function resetBackdrop() {
    if (root.value) write(IMAGE_KEY(root.value), null)
    if (image.value) URL.revokeObjectURL(image.value)
    image.value = null
    backdrop.value = { ...DEFAULT_BACKDROP }
  }

  return {
    root, panels, camera, view, backdrop, image, active, focus, focused, glide, busy,
    get, has, load, resize, setCamera, panBy, zoomTo, fitAll, centerOn, front, show, open, close, toggle, move, setSize, settle, toggleMin, arrangeAll, focusOn, unfocus, prune, setBackdrop, useImage, resetBackdrop,
  }
})
