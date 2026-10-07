/**
 * Nombres de los empleados. Cada contratado recibe uno que no se repite en el
 * proyecto (ni con los que ya se fueron: sus bitácoras siguen ahí). El usuario
 * lo puede cambiar al aprobar la plantilla.
 */
export const NAMES = [
  'Ana', 'Beto', 'Carla', 'Dani', 'Elena', 'Fede', 'Gabi', 'Hugo', 'Inés', 'Javi', 'Karla', 'Leo', 'Mara',
  'Nico', 'Olga', 'Pau', 'Quique', 'Rosa', 'Saúl', 'Tere', 'Uri', 'Vale', 'Wen', 'Ximena', 'Yara', 'Zoe',
]

/** Para comparar nombres sin importar mayúsculas ni acentos. */
export function nameKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/** Parte de un id o rama: sin acentos, espacios ni símbolos. */
export function slug(name: string): string {
  return nameKey(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'empleado'
}

/** El primer nombre libre; si se acaban, se numeran. */
export function pickName(taken: Iterable<string>): string {
  const used = new Set([...taken].map(nameKey))
  for (let round = 1; ; round++) {
    for (const n of NAMES) {
      const candidate = round === 1 ? n : `${n} ${round}`
      if (!used.has(nameKey(candidate))) return candidate
    }
  }
}
