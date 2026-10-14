/** Los personajes del pack: su imagen de pie y cómo los llama la oficina de píxel. */
const URLS = import.meta.glob<string>('../../../assets/herdr-oficina/sprites/char?.png', { eager: true, query: '?url', import: 'default' })

/** Todos los personajes que hay, por número. */
export const CHARACTERS = [1, 2, 3, 4, 5, 6, 7, 8]
/** En qué orden se reparten a quien va llegando. */
export const CAST_ORDER = [4, 2, 1, 5, 6, 7, 8, 3]
/**
 * De quién parece cada personaje, para darle a cada nombre uno que cuadre (sin
 * dato, vale para cualquiera): 2, 4 y 5 llevan coleta o trenzas; 1, 3, 7 y 8, no.
 */
export const CHARACTER_GENDER: Record<number, 'f' | 'm' | undefined> = { 1: 'm', 2: 'f', 3: 'm', 4: 'f', 5: 'f', 6: undefined, 7: 'm', 8: 'm' }
/** ¿Cuadra el personaje con alguien de ese género? Sin género conocido, cualquiera cuadra. */
export const fits = (n: number, g: 'f' | 'm' | undefined) => !g || !CHARACTER_GENDER[n] || CHARACTER_GENDER[n] === g
/** El del jefe mientras no se elija otro. */
export const DEFAULT_BOSS = 3

export const charUrl = (n: number): string => URLS[`../../../assets/herdr-oficina/sprites/char${n}.png`]
/** Nombre del sprite en la oficina de píxel. */
export const spriteName = (n: number) => `CHAR${n}`
