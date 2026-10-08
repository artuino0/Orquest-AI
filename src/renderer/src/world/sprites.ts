/**
 * Arte del mundo: carga los PNG de `assets/sprites/generados` y entrega
 * texturas por nombre (`puesto/escritorio`, `rizos/front`…). La escena solo
 * pide texturas; aquí se decide qué personaje le toca a cada quien y cómo se
 * parte su hoja de caminata.
 */
import { Assets, Rectangle, Texture } from 'pixi.js'
import type { Bubble } from './behavior'

/** Color por proveedor: así se distingue quién es quién en etiquetas y paneles. */
export const PROVIDER_COLOR: Record<string, number> = {
  claude: 0xd97757,
  codex: 0x3b82f6,
  antigravity: 0x34a853,
  opencode: 0xe5e5e5,
  commandcode: 0xa78bfa,
  kimi: 0xff6b9d,
  grok: 0x404040,
}

// Las hojas completas y los originales del generador se quedan fuera de la app.
const FILES = import.meta.glob<string>(
  ['../../../../assets/sprites/generados/**/*.png', '!**/original.png', '!**/hoja.png', '!**/vistas_original.png'],
  { eager: true, query: '?url', import: 'default' },
)

const URLS = new Map(Object.entries(FILES).map(([path, url]) => [path.replace(/^.*\/generados\//, '').replace(/\.png$/, ''), url]))

const textures = new Map<string, Texture>()

/** Carga todo el arte una vez. Sin esto `tex` no tiene qué entregar. */
export async function loadSprites(): Promise<void> {
  if (textures.size) return
  // La CSP de la app no deja crear workers desde blobs.
  Assets.setPreferences({ preferWorkers: false })
  await Promise.all(
    [...URLS].map(async ([name, url]) => {
      const t = await Assets.load<Texture>(url)
      // Nítido al acercar; al alejar todo el mapa, promedia en vez de perder píxeles.
      t.source.autoGenerateMipmaps = true
      t.source.magFilter = 'nearest'
      t.source.minFilter = 'linear'
      t.source.mipmapFilter = 'linear'
      textures.set(name, t)
    }),
  )
}

export function tex(name: string): Texture {
  const t = textures.get(name)
  if (!t) throw new Error(`Sprite desconocido: ${name}`)
  return t
}

export const BOSS_CHARACTER = 'jefe'
export const CHARACTERS = ['rizos', 'bob', 'coleta', 'gorra', 'rapada', 'trenza']

function hash(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

/** El jefe tiene el suyo; a los demás les toca uno fijo según su id. */
export function characterFor(id: string, role: string): string {
  return role === 'jefe' ? BOSS_CHARACTER : CHARACTERS[hash(id) % CHARACTERS.length]
}

const sheets = new Map<string, Texture[]>()

/** Parte una hoja de cuadros iguales puestos en fila. */
export function frames(sheet: string, count: number): Texture[] {
  let list = sheets.get(sheet)
  if (!list) {
    const t = tex(sheet)
    const w = t.width / count
    list = Array.from({ length: count }, (_, i) => new Texture({ source: t.source, frame: new Rectangle(i * w, 0, w, t.height) }))
    sheets.set(sheet, list)
  }
  return list
}

/** Caminata de perfil, mirando a la derecha. */
export const walkFrames = (character: string) => frames(`${character}/walk/marioneta`, 8)

/** Tecleando sentado: 'espalda' de espaldas a la cámara, 'frente' de cara a ella. */
export const workFrames = (character: string, view: 'espalda' | 'frente') => frames(`${character}/work/sentado_${view}`, 4)

/** ¿Ya tiene su hoja de teclear de perfil? Mientras no, se usa la pose quieta. */
export const hasSideWork = (character: string) => URLS.has(`${character}/work/sentado_lado`)

/** Sentado de perfil, mirando a la derecha: tecleando (cuadro 0–3) o quieto (-1). */
export function sideWork(character: string, frame: number): Texture {
  if (frame < 0 || !hasSideWork(character)) return tex(`${character}/sit`)
  return frames(`${character}/work/sentado_lado`, 4)[frame]
}

/** Pantalla encendida, con su parpadeo. */
export const monitorFrames = () => frames('puesto/monitor_on', 4)

/** Dos letras por proveedor, para la insignia junto al nombre. */
export const PROVIDER_CODE: Record<string, string> = {
  claude: 'CL',
  codex: 'CX',
  antigravity: 'AG',
  opencode: 'OC',
  commandcode: 'CC',
  kimi: 'KM',
  grok: 'GK',
}

/** 7×7 píxeles dentro de la burbuja. */
export const BUBBLE_ICON: Record<Exclude<Bubble, null>, { color: number; rows: string[] }> = {
  alert: { color: 0xef5350, rows: ['...X...', '...X...', '...X...', '...X...', '.......', '...X...', '.......'] },
  clock: { color: 0x5c6bc0, rows: ['..XXX..', '.X.X.X.', 'X..X..X', 'X..XX.X', 'X.....X', '.X...X.', '..XXX..'] },
  check: { color: 0x43a047, rows: ['.......', '......X', '.....X.', 'X...X..', '.X.X...', '..X....', '.......'] },
  dots: { color: 0x757575, rows: ['.......', '.......', '.......', 'X.X.X..', '.......', '.......', '.......'] },
  game: { color: 0x26a69a, rows: ['.......', '.XXXXX.', 'X.X.X.X', 'XXX.XXX', 'X.X.X.X', '.XX.XX.', '.......'] },
  zzz: { color: 0x7e57c2, rows: ['XXXX...', '..X....', '.X.....', 'XXXX...', '....XXX', '.....X.', '....XXX'] },
}

/** Loseta de cada piso del mapa. */
export const FLOOR: Record<string, string> = {
  madera: 'pisos/madera_loseta',
  espiga: 'pisos/espiga_loseta',
  alfombra_gris: 'pisos/alfombra_gris_loseta',
  alfombra_azul: 'pisos/alfombra_azul_loseta',
  concreto: 'pisos/concreto_loseta',
  loseta: 'pisos/loseta_loseta',
}

/** Archivo de un sprite, para mostrarlo fuera del mapa (la paleta del modo creativo). */
export function spriteUrl(name: string): string | undefined {
  return URLS.get(name)
}
