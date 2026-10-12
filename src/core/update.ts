/**
 * ¿Hay una versión más nueva de Orquest AI? Se le pregunta a GitHub por las
 * publicadas y se compara con la instalada. No descarga ni instala nada: solo
 * dice cuál hay y de dónde bajar el instalador de este sistema.
 */
export const RELEASES_API = 'https://api.github.com/repos/artuino0/Orquest-AI/releases?per_page=5'

export interface UpdateInfo {
  /** La versión nueva, sin la «v». */
  version: string
  /** El instalador para este sistema; si esa versión no lo trae, su página. */
  url: string
}

/** Lo que interesa de cada versión publicada en GitHub. */
export interface Release {
  tag_name: string
  draft?: boolean
  html_url: string
  assets?: { name: string; browser_download_url: string }[]
}

const numbers = (version: string) => version.replace(/^v/i, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0)

/** `a` es más nueva que `b` (1.2.10 > 1.2.9). */
export function isNewer(a: string, b: string): boolean {
  const x = numbers(a)
  const y = numbers(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  }
  return false
}

const INSTALLER: Partial<Record<NodeJS.Platform, RegExp>> = { win32: /\.exe$/i, darwin: /\.dmg$/i, linux: /\.AppImage$/i }

/** La más nueva de las publicadas, si le gana a la instalada. */
export function pickUpdate(releases: Release[], current: string, platform: NodeJS.Platform = process.platform): UpdateInfo | null {
  const published = releases.filter((r) => !r.draft && r.tag_name)
  const latest = published.reduce<Release | undefined>((best, r) => (!best || isNewer(r.tag_name, best.tag_name) ? r : best), undefined)
  if (!latest || !isNewer(latest.tag_name, current)) return null
  const pattern = INSTALLER[platform]
  const asset = pattern && latest.assets?.find((a) => pattern.test(a.name))
  return { version: latest.tag_name.replace(/^v/i, ''), url: asset?.browser_download_url ?? latest.html_url }
}

/** Pregunta a GitHub. Sin red, o si tarda, no hay aviso: nunca frena a la app. */
export async function checkUpdate(current: string, fetcher: typeof fetch = fetch): Promise<UpdateInfo | null> {
  try {
    const res = await fetcher(RELEASES_API, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return pickUpdate((await res.json()) as Release[], current)
  } catch {
    return null
  }
}
