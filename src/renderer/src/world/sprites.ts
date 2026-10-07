/**
 * Pixel art provisional, dibujado desde matrices. Cuando lleguen los assets de
 * "Arte y mundo" se reemplaza este archivo; la escena solo pide cuadros.
 */
import type { Bubble, Pose } from './behavior'

/** Colores de playera por proveedor: así se distingue quién es quién. */
export const PROVIDER_COLOR: Record<string, number> = {
  claude: 0xd97757,
  codex: 0x3b82f6,
  antigravity: 0x34a853,
  opencode: 0xe5e5e5,
  commandcode: 0xa78bfa,
  kimi: 0xff6b9d,
  grok: 0x404040,
}

const SKINS = [0xf5d0b0, 0xe0ac80, 0xc68642, 0x8d5524, 0xffdbac]
const HAIRS = [0x2b1d14, 0x5a3825, 0xd6b370, 0x1a1a1a, 0xa0522d, 0x7f8c8d]

function hash(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

export interface Palette {
  H: number
  S: number
  T: number
  P: number
  B: number
  E: number
}

export function paletteFor(id: string, provider: string): Palette {
  const h = hash(id)
  return {
    H: HAIRS[h % HAIRS.length],
    S: SKINS[(h >> 3) % SKINS.length],
    T: PROVIDER_COLOR[provider] ?? 0x9e9e9e,
    P: 0x2f3a56,
    B: 0x1b1a24,
    E: 0x1b1a24,
  }
}

/** 10×14 píxeles. Letras = clave de la paleta; punto = transparente. */
const FRONT_STAND = [
  '..HHHHHH..',
  '.HHHHHHHH.',
  '.HSSSSSSH.',
  '.SSESSESS.',
  '.SSSSSSSS.',
  '..SSSSSS..',
  '..TTTTTT..',
  '.TTTTTTTT.',
  'STTTTTTTTS',
  'STTTTTTTTS',
  '..PPPPPP..',
  '..PP..PP..',
  '..PP..PP..',
  '..BB..BB..',
]

const WALK_A = [...FRONT_STAND.slice(0, 11), '..PP..PP..', '.PP....PP.', '.BB....BB.']
const WALK_B = [...FRONT_STAND.slice(0, 11), '...PPPP...', '...PPPP...', '...BBBB...']

/** De espaldas, frente al monitor. Sin piernas: las tapa la silla. */
const BACK_SIT = [
  '..HHHHHH..',
  '.HHHHHHHH.',
  '.HHHHHHHH.',
  '.HHHHHHHH.',
  '.SHHHHHHS.',
  '..SSSSSS..',
  '..TTTTTT..',
  '.TTTTTTTT.',
  'STTTTTTTTS',
  'STTTTTTTTS',
  '.TTTTTTTT.',
]
const BACK_TYPE_A = [...BACK_SIT.slice(0, 7), 'STTTTTTTTS', '.TTTTTTTT.', '.TTTTTTTT.', '.TTTTTTTT.']
const BACK_TYPE_B = [...BACK_SIT.slice(0, 7), '.TTTTTTTTS', 'STTTTTTTT.', '.TTTTTTTT.', '.TTTTTTTT.']

export function characterFrame(pose: Pose, tick: number): string[] {
  const odd = Math.floor(tick) % 2 === 1
  switch (pose) {
    case 'walk':
      return odd ? WALK_B : WALK_A
    case 'type':
      return odd ? BACK_TYPE_B : BACK_TYPE_A
    case 'sit':
      return BACK_SIT
    case 'stand':
      return FRONT_STAND
  }
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

export const FLOOR: Record<string, [number, number]> = {
  reception: [0x8d6e63, 0x86675c],
  boss: [0x6d4c41, 0x67473c],
  cafeteria: [0xd7ccc8, 0xcfc3bf],
  department: [0x5c6b8a, 0x576583],
  corridor: [0x3f3d52, 0x3b394d],
}
export const WALL = 0x24222f
export const WALL_TOP = 0x34314a
