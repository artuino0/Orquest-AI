/** Textos chicos que se repiten en varios paneles. */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "hace 12 s", "hace 2 h", "ayer", "hace 3 días", "12 sep". */
export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return `hace ${s} s`
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  const days = Math.floor(s / 86400)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  const d = new Date(at)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
