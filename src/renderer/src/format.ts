/** Textos chicos que se repiten en varios paneles. */
import { T } from '../../core/i18n'

/** "12 ene", "12 feb"…: cada mes con su fecha completa, porque el orden cambia según el idioma. */
const DATES: ((day: number) => string)[] = [
  (d) => T`${d} ene`,
  (d) => T`${d} feb`,
  (d) => T`${d} mar`,
  (d) => T`${d} abr`,
  (d) => T`${d} may`,
  (d) => T`${d} jun`,
  (d) => T`${d} jul`,
  (d) => T`${d} ago`,
  (d) => T`${d} sep`,
  (d) => T`${d} oct`,
  (d) => T`${d} nov`,
  (d) => T`${d} dic`,
]

/** "hace 12 s", "hace 2 h", "ayer", "hace 3 días", "12 sep". */
export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return T`hace ${s} s`
  if (s < 3600) return T`hace ${Math.floor(s / 60)} min`
  if (s < 86400) return T`hace ${Math.floor(s / 3600)} h`
  const days = Math.floor(s / 86400)
  if (days === 1) return T`ayer`
  if (days < 7) return T`hace ${days} días`
  const d = new Date(at)
  return DATES[d.getMonth()](d.getDate())
}
