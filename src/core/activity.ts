/**
 * Qué está haciendo una CLI en este momento, dicho en corto y en español, a
 * partir de lo que muestra su pantalla: "Pensando", "Leyendo api.ts",
 * "Ejecutando npm test"… Es para que quien mira el chat sepa que hay trabajo
 * en curso y de qué tipo, sin abrir la terminal.
 *
 * Es una lectura de pantalla, no un dato de la CLI: reconoce el último paso
 * que ella anuncia (Claude Code los marca con ● y el nombre de la herramienta;
 * Codex con •) y su indicador de espera. Si no reconoce nada, dice "Trabajando".
 */
export interface Activity {
  /** Qué hace, en una o dos palabras. */
  label: string
  /** Con qué: el archivo, el comando… */
  detail?: string
  /** Segundos que lleva este turno, si la CLI lo muestra. */
  seconds?: number
}

/** Herramienta que anuncia la CLI → qué significa para quien mira. */
const STEPS: [RegExp, string][] = [
  // Antes que "Escribiendo": "Update Todos" es planear, no editar un archivo.
  [/^(TodoWrite|Update Todos|Updated Plan|ExitPlanMode|Todo|Plan)\b/i, 'Planeando'],
  [/^(Read|Glob|Grep|Search|LS|List|Explored?|Reading)\b/i, 'Leyendo'],
  [/^(Edit|Write|Update|MultiEdit|NotebookEdit|Create|Apply|Edited|Patch)\b/i, 'Escribiendo'],
  [/^(Bash|PowerShell|Shell|Run|Ran|Running|Exec)\b/i, 'Ejecutando'],
  [/^(Task|Agent|Explore)\b/i, 'Delegando'],
  [/^(WebFetch|WebSearch|Fetch|Web)\b/i, 'Buscando en la web'],
  [/^(Calling orquest|orquest\b|mcp__orquest|Called orquest)/i, 'Usando el tablero'],
  [/^(Calling|Called)\b|\(MCP\)/i, 'Usando una herramienta'],
]

const clip = (text: string, max = 48) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

export function describeActivity(screen: string): Activity {
  const lines = screen.split('\n').map((l) => l.trim()).filter(Boolean)
  // El indicador de espera: "✻ Cogitating… (12s · ↓ 1.2k tokens · thinking)" o "Working (8s • esc to interrupt)".
  const spinner = [...lines].reverse().find((l) => /…\s*\(|\bWorking\s*\(|esc to interrupt/i.test(l)) ?? ''
  const seconds = /\((?:(\d+)m\s*)?(\d+)s\b/.exec(spinner)
  const total = seconds ? Number(seconds[1] ?? 0) * 60 + Number(seconds[2]) : undefined
  const base = total === undefined ? {} : { seconds: total }

  // El último paso anunciado (lo de más abajo es lo más reciente).
  const step = [...lines].reverse().find((l) => /^[●⏺•]\s+\S/.test(l))?.replace(/^[●⏺•]\s+/, '')
  if (step) {
    for (const [pattern, label] of STEPS) {
      if (!pattern.test(step)) continue
      // "Bash(npm test)" → npm test; "Read src/api.ts" → src/api.ts
      const inside = /\(([^)]*)\)?/.exec(step)?.[1] ?? step.replace(pattern, '').replace(/^[\s:·-]+/, '')
      const detail = clip(inside.replace(/\s+/g, ' ').replace(/^[\s:·…-]+|[\s…]+$/g, ''))
      return { label, ...(detail && !/^MCP$/i.test(detail) ? { detail } : {}), ...base }
    }
  }
  if (/thinking|thought/i.test(spinner)) return { label: 'Pensando', ...base }
  // Texto corrido después del último paso: está redactando su respuesta.
  if (step && !/^[A-Z][A-Za-z]+\(/.test(step)) return { label: 'Redactando', ...base }
  return { label: spinner ? 'Pensando' : 'Trabajando', ...base }
}
