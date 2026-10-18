/**
 * Los fondos del lienzo, pintados en píxel por código: ciudad de noche, bosque,
 * montañas y espacio. Se pintan a 384×216 con colores contados y tramado
 * (dithering), y la pantalla los agranda sin suavizar. Cada uno sale siempre
 * igual (semilla fija) y se pinta una sola vez.
 */

export type Backdrop = 'plain' | 'city' | 'forest' | 'mountains' | 'space' | 'image'

const W = 384
const H = 216

type RGB = [number, number, number]
const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]

/** Números al azar que salen siempre iguales con la misma semilla. */
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]
const dither = (x: number, y: number, f: number) => f * 16 > BAYER[y & 3][x & 3] + 0.5

class Raster {
  data = new Uint8ClampedArray(W * H * 4)
  set(x: number, y: number, c: RGB) {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const i = (y * W + x) * 4
    this.data[i] = c[0]
    this.data[i + 1] = c[1]
    this.data[i + 2] = c[2]
    this.data[i + 3] = 255
  }
  rect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c)
  }
  /** Cielo en bandas de colores contados, tramadas donde se juntan. */
  bands(y0: number, y1: number, stops: RGB[]) {
    for (let y = y0; y < y1; y++) {
      const t = ((y - y0) / Math.max(1, y1 - y0 - 1)) * (stops.length - 1)
      const i = Math.min(stops.length - 2, Math.floor(t))
      const f = t - i
      for (let x = 0; x < W; x++) this.set(x, y, dither(x, y, f) ? stops[i + 1] : stops[i])
    }
  }
  disc(cx: number, cy: number, r: number, c: RGB) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.set(cx + x, cy + y, c)
  }
  /** Rellena de `top[x]` hacia abajo. */
  fillBelow(top: number[], c: RGB, bottom = H) {
    for (let x = 0; x < W; x++) for (let y = Math.max(0, Math.round(top[x])); y < bottom; y++) this.set(x, y, c)
  }
}

/** Ruido suave de una dimensión (para crestas de montaña). */
function ridge(rnd: () => number, base: number, amp: number, octaves = 4): number[] {
  const layers = Array.from({ length: octaves }, (_, o) => {
    const step = Math.max(2, Math.round(96 / 2 ** o))
    const knots = Array.from({ length: Math.ceil(W / step) + 2 }, () => rnd() * 2 - 1)
    return { step, knots, amp: amp / 2 ** o }
  })
  return Array.from({ length: W }, (_, x) => {
    let h = base
    for (const l of layers) {
      const i = Math.floor(x / l.step)
      const f = x / l.step - i
      const s = f * f * (3 - 2 * f)
      h += (l.knots[i] * (1 - s) + l.knots[i + 1] * s) * l.amp
    }
    return h
  })
}

/** Ruido suave de dos dimensiones (para nebulosas). */
function noise2(rnd: () => number, cell: number) {
  const cols = Math.ceil(W / cell) + 2
  const rows = Math.ceil(H / cell) + 2
  const g = Array.from({ length: cols * rows }, () => rnd())
  return (x: number, y: number) => {
    const i = Math.floor(x / cell)
    const j = Math.floor(y / cell)
    const fx = x / cell - i
    const fy = y / cell - j
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const at = (a: number, b: number) => g[b * cols + a]
    const top = at(i, j) * (1 - sx) + at(i + 1, j) * sx
    const bot = at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx
    return top * (1 - sy) + bot * sy
  }
}

function stars(r: Raster, rnd: () => number, n: number, maxY: number, colors: RGB[]) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rnd() * W)
    const y = Math.floor(rnd() * maxY)
    const c = colors[Math.floor(rnd() * colors.length)]
    r.set(x, y, c)
    // Unas cuantas brillan en cruz.
    if (rnd() < 0.06) {
      r.set(x - 1, y, c)
      r.set(x + 1, y, c)
      r.set(x, y - 1, c)
      r.set(x, y + 1, c)
    }
  }
}

function city(r: Raster) {
  const rnd = random(7)
  r.bands(0, H, ['#0b0920', '#151236', '#22184a', '#35205a', '#4b2563', '#6a2c6b'].map(hex))
  stars(r, rnd, 140, 110, ['#ffffff', '#c9c4ff', '#8f87d9'].map(hex))
  // Luna con su sombra.
  r.disc(316, 38, 14, hex('#f4e9c4'))
  r.disc(322, 34, 13, hex('#151236'))
  r.disc(316, 38, 14, hex('#f4e9c4'))
  for (const [x, y, s] of [[310, 34, 2], [319, 43, 3], [322, 31, 1]]) r.disc(x, y, s, hex('#d8c99a'))
  // Dos filas de edificios: los de atrás más oscuros y con menos luces.
  const rows: { base: number; min: number; max: number; body: RGB; lit: RGB[]; p: number }[] = [
    { base: 168, min: 40, max: 110, body: hex('#2a1d4d'), lit: ['#5b4a8f', '#7b67b8'].map(hex), p: 0.18 },
    { base: 216, min: 50, max: 130, body: hex('#140f2c'), lit: ['#ffd36b', '#ffb547', '#7fe3ff'].map(hex), p: 0.32 },
  ]
  for (const row of rows) {
    let x = -4
    while (x < W) {
      const w = 14 + Math.floor(rnd() * 22)
      const h = row.min + Math.floor(rnd() * (row.max - row.min))
      const top = row.base - h
      r.rect(x, top, w, h, row.body)
      // Remates: antena con foco rojo o azotea escalonada.
      if (rnd() < 0.3) {
        const ax = x + Math.floor(w / 2)
        r.rect(ax, top - 10, 1, 10, row.body)
        r.set(ax, top - 11, hex('#ff4d6d'))
      } else if (rnd() < 0.4) r.rect(x + 3, top - 4, w - 6, 4, row.body)
      for (let wy = top + 4; wy < row.base - 6; wy += 4) {
        for (let wx = x + 3; wx < x + w - 3; wx += 3) {
          if (rnd() < row.p) r.rect(wx, wy, 2, 2, row.lit[Math.floor(rnd() * row.lit.length)])
        }
      }
      x += w + (rnd() < 0.3 ? 2 : 0)
    }
  }
  // Resplandor de la calle.
  for (let y = 200; y < H; y++) for (let x = 0; x < W; x++) if (dither(x, y, (y - 200) / 20)) r.set(x, y, hex('#3a1f4f'))
}

function forest(r: Raster) {
  const rnd = random(11)
  r.bands(0, 150, ['#1d2b4a', '#2c4a6b', '#3f6d86', '#6e9a9a', '#d8a466', '#f0c27a'].map(hex))
  r.disc(250, 132, 16, hex('#ffe3a3'))
  const layers: { base: number; color: RGB; mist?: RGB; min: number; max: number; gap: number }[] = [
    { base: 150, color: hex('#3b5d6b'), mist: hex('#57808a'), min: 24, max: 46, gap: 7 },
    { base: 172, color: hex('#264552'), mist: hex('#3b5d6b'), min: 34, max: 62, gap: 9 },
    { base: 198, color: hex('#16303b'), mist: hex('#264552'), min: 46, max: 84, gap: 12 },
    { base: 216, color: hex('#0b1d24'), min: 60, max: 110, gap: 18 },
  ]
  for (const l of layers) {
    // Suelo de la capa, con lomas suaves.
    const ground = ridge(rnd, l.base - 6, 5, 3)
    r.fillBelow(ground, l.color)
    for (let x = -10; x < W + 10; x += l.gap + Math.floor(rnd() * l.gap)) {
      const h = l.min + Math.floor(rnd() * (l.max - l.min))
      const foot = Math.round(ground[Math.max(0, Math.min(W - 1, x))]) + 2
      // Pino: ramas en escalones que se abren hacia abajo.
      for (let k = 0; k < h; k++) {
        const tier = k % Math.max(6, Math.round(h / 4))
        const half = Math.floor(k * 0.22 + tier * 0.55)
        r.rect(x - half, foot - h + k, half * 2 + 1, 1, l.color)
      }
      r.rect(x, foot - 2, 1, 4, l.color)
    }
    // Neblina entre capas.
    if (l.mist) for (let y = l.base - 4; y < l.base + 4; y++) for (let x = 0; x < W; x++) if (dither(x, y, 0.25 - Math.abs(y - l.base) / 20)) r.set(x, y, l.mist)
  }
}

function mountains(r: Raster) {
  const rnd = random(23)
  r.bands(0, 140, ['#2b1b4e', '#4d2463', '#8a3170', '#cf4f6f', '#f27f5b', '#ffbe6b'].map(hex))
  r.disc(120, 118, 22, hex('#ffe9a8'))
  r.disc(120, 118, 18, hex('#fff4cf'))
  const far = ridge(rnd, 92, 26)
  r.fillBelow(far, hex('#7a3a78'))
  // Nieve en las cumbres de atrás.
  for (let x = 0; x < W; x++) {
    const top = Math.round(far[x])
    if (top < 84) for (let y = top; y < top + 3 + ((x * 7) % 3); y++) r.set(x, y, hex('#f6d6e3'))
  }
  r.fillBelow(ridge(rnd, 128, 22), hex('#56286a'))
  r.fillBelow(ridge(rnd, 156, 16), hex('#3a1f56'))
  // Lago: el cielo reflejado en franjas.
  r.rect(0, 178, W, H - 178, hex('#2a1640'))
  for (let y = 180; y < H; y += 3) {
    for (let x = 0; x < W; x++) {
      if (rnd() < 0.08) r.set(x, y, hex('#cf4f6f'))
      if (Math.abs(x - 120) < 22 - (y - 180) / 2 && rnd() < 0.5) r.set(x, y, hex('#ffd98a'))
    }
  }
  r.fillBelow(ridge(rnd, 200, 6), hex('#1d1030'))
}

function space(r: Raster) {
  const rnd = random(5)
  r.bands(0, H, ['#07060f', '#0d0a1f', '#140f2e'].map(hex))
  // Nebulosa: ruido en capas mapeado a pocos colores y tramado.
  const n1 = noise2(rnd, 48)
  const n2 = noise2(rnd, 20)
  const pal = ['#1f1446', '#3a1d6b', '#6a2a8f', '#b03c9c', '#ff6fb5'].map(hex)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const band = 1 - Math.min(1, Math.abs(y - (60 + x * 0.35)) / 70)
      const v = (n1(x, y) * 0.7 + n2(x, y) * 0.3) * band * 1.35
      if (v < 0.3) continue
      const t = Math.min(pal.length - 1.001, ((v - 0.3) / 0.7) * pal.length)
      const i = Math.floor(t)
      r.set(x, y, dither(x, y, t - i) && i + 1 < pal.length ? pal[i + 1] : pal[i])
    }
  }
  stars(r, rnd, 260, H, ['#ffffff', '#cfd8ff', '#ffd9f0', '#9aa6ff'].map(hex))
  // Planeta con anillo.
  const [cx, cy, rad] = [300, 150, 30]
  for (let y = -rad; y <= rad; y++) {
    for (let x = -rad; x <= rad; x++) {
      if (x * x + y * y > rad * rad) continue
      const light = (-x - y) / (rad * 1.6) + 0.5
      const stripe = Math.floor((y + rad) / 6) % 2
      const c = light > 0.75 ? '#7fd8ff' : light > 0.45 ? (stripe ? '#3f8fd6' : '#4aa3e6') : light > 0.2 ? '#2a5a9e' : '#18306a'
      r.set(cx + x, cy + y, hex(dither(cx + x, cy + y, light % 0.25 * 4) && light > 0.2 && light < 0.3 ? '#18306a' : c))
    }
  }
  for (let a = 0; a < Math.PI * 2; a += 0.004) {
    const x = Math.cos(a) * 52
    const y = Math.sin(a) * 9
    // Por detrás del planeta no se ve.
    if (y < 0 && x * x + (y - 0) ** 2 < rad * rad) continue
    r.set(cx + x, cy + y - x * 0.12, hex(Math.abs(x) > 44 ? '#a07cc8' : '#d9b8ff'))
  }
}

const PAINTERS: Partial<Record<Backdrop, (r: Raster) => void>> = { city, forest, mountains, space }

const cache = new Map<Backdrop, Promise<string>>()

/** La imagen del fondo como dirección `blob:`, pintada la primera vez que se pide. */
export function backdropUrl(kind: Backdrop): Promise<string> | null {
  const paint = PAINTERS[kind]
  if (!paint) return null
  let url = cache.get(kind)
  if (!url) {
    url = new Promise<string>((done, fail) => {
      const r = new Raster()
      paint(r)
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      canvas.getContext('2d')!.putImageData(new ImageData(r.data, W, H), 0, 0)
      canvas.toBlob((b) => (b ? done(URL.createObjectURL(b)) : fail(new Error('canvas'))), 'image/png')
    })
    cache.set(kind, url)
  }
  return url
}
