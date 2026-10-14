/**
 * Si un nombre es de mujer o de hombre, para darle un personaje que cuadre.
 * Primero los nombres conocidos (los de la lista de la app y los comunes en
 * español); si no, la terminación (-a mujer, -o hombre). Lo que no se sabe con
 * algo de confianza queda sin decir, y entonces vale cualquier personaje.
 */
import { nameKey } from './names.js'

export type Gender = 'f' | 'm'

const WOMEN = [
  'ana', 'carla', 'elena', 'ines', 'karla', 'mara', 'olga', 'rosa', 'tere', 'vale', 'ximena', 'yara', 'zoe',
  'sofi', 'sofia', 'cinthya', 'cynthia', 'maria', 'lupita', 'paty', 'lucia', 'isabel', 'carmen', 'pilar', 'raquel', 'beatriz',
  'mercedes', 'dolores', 'lourdes', 'ruth', 'esther', 'abigail', 'ivonne', 'yolanda', 'monse', 'fer', 'lu', 'mar', 'sol',
  'ella', 'grace', 'kim', 'alice', 'emily', 'sarah', 'karen', 'nicole', 'michelle', 'jennifer', 'elizabeth', 'luz', 'noemi',
  'jazmin', 'belen', 'marisol', 'consuelo', 'socorro', 'rocio', 'aracely', 'itzel', 'abril', 'naomi', 'miriam', 'ingrid',
]
const MEN = [
  'beto', 'fede', 'hugo', 'javi', 'leo', 'nico', 'quique', 'saul', 'uri', 'tavo', 'gus', 'ivan', 'mario', 'pablo', 'juan',
  'jhonny', 'johnny', 'jose', 'luis', 'carlos', 'jorge', 'miguel', 'david', 'daniel', 'raul', 'jesus', 'angel', 'manuel', 'oscar',
  'rafael', 'ruben', 'victor', 'hector', 'arturo', 'alan', 'adan', 'samuel', 'joel', 'isaac', 'abel', 'noe', 'josue', 'cesar',
  'luca', 'nicola', 'joshua', 'borja', 'jaime', 'felipe', 'enrique', 'ricardo', 'eduardo', 'diego', 'tomas', 'max',
  'john', 'mike', 'tom', 'peter', 'paul', 'mark', 'james', 'robert', 'william', 'bob', 'jack', 'ezequiel', 'gael',
]
const known = new Map<string, Gender>([...WOMEN.map((n) => [n, 'f'] as const), ...MEN.map((n) => [n, 'm'] as const)])

export function genderOf(name: string | undefined): Gender | undefined {
  // El primer nombre manda («Ana María», «Juan Pablo»); el número de repetidos («Ana 2») no cuenta.
  const first = nameKey(name ?? '').split(/[\s._-]+/).find((w) => w && !/^\d+$/.test(w))
  if (!first) return undefined
  const hit = known.get(first)
  if (hit) return hit
  if (first.length < 3) return undefined
  if (first.endsWith('a')) return 'f'
  if (first.endsWith('o')) return 'm'
  return undefined
}
