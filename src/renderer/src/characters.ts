/** Los personajes del pack: su imagen de pie y cómo los llama la oficina de píxel. */
const URLS = import.meta.glob<string>('../../../assets/herdr-oficina/sprites/char?.png', { eager: true, query: '?url', import: 'default' })

/** Todos los personajes que hay, por número. */
export const CHARACTERS = [1, 2, 3, 4, 5, 6, 7, 8]
/** En qué orden se reparten a quien va llegando. */
export const CAST_ORDER = [4, 2, 1, 5, 6, 7, 8, 3]
/** El del jefe mientras no se elija otro. */
export const DEFAULT_BOSS = 3

export const charUrl = (n: number): string => URLS[`../../../assets/herdr-oficina/sprites/char${n}.png`]
/** Nombre del sprite en la oficina de píxel. */
export const spriteName = (n: number) => `CHAR${n}`
