/**
 * Adaptadores por proveedor. Cada CLI es distinta: cómo se llama, cómo recibe
 * modelo y esfuerzo, dónde guarda su sesión y cómo se ve en pantalla cuando
 * trabaja o espera. Son formatos internos que cambian, por eso todo lo
 * específico de un proveedor vive aquí y en ningún otro lado.
 */

export type ProviderId =
  | 'claude'
  | 'codex'
  | 'antigravity'
  | 'opencode'
  | 'commandcode'
  | 'kimi'
  | 'grok'

export type Effort = 'low' | 'medium' | 'high'

export interface LaunchOptions {
  model?: string
  effort?: Effort
  /** Prompt de sistema del puesto (manual). Solo si el proveedor lo soporta. */
  systemPrompt?: string
}

export interface ScreenPatterns {
  /** La CLI está pensando o ejecutando herramientas. */
  working: RegExp[]
  /** La CLI espera una decisión del usuario (permiso, confirmación). */
  blocked: RegExp[]
  /** La CLI terminó su turno y espera instrucción. */
  idle: RegExp[]
}

export interface ProviderAdapter {
  id: ProviderId
  name: string
  /** Ejecutables candidatos, en orden de preferencia. */
  binaries: string[]
  versionArgs: string[]
  /**
   * Rutas (relativas a $HOME) cuya existencia indica una sesión iniciada.
   * Vacío = no hay forma conocida de comprobarlo; se asume que sí.
   */
  sessionPaths: string[]
  /** Argumentos para lanzar la CLI interactiva en su PTY. */
  buildArgs(opts: LaunchOptions): string[]
  /** Advertencias sobre opciones que este proveedor no sabe recibir. */
  unsupported(opts: LaunchOptions): string[]
  screen: ScreenPatterns
  /** true si los argumentos se comprobaron contra la CLI real. */
  verified: boolean
}

const SPINNER = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✻✽✶✳✢·]\s+\w+…/
const ESC_TO_INTERRUPT = /esc to interrupt/i
const PERMISSION = [
  /do you want to (proceed|make this edit|create|run)/i,
  /allow (this|command)\?/i,
  /\(y\/n\)/i,
  /approve\?/i,
]

function generic(
  id: ProviderId,
  name: string,
  binaries: string[],
  sessionPaths: string[] = [],
): ProviderAdapter {
  return {
    id,
    name,
    binaries,
    versionArgs: ['--version'],
    sessionPaths,
    buildArgs: (o) => (o.model ? ['--model', o.model] : []),
    unsupported: (o) => [
      ...(o.effort ? [`${name} no recibe esfuerzo por argumento; se ignora`] : []),
      ...(o.systemPrompt ? [`${name} no recibe prompt de sistema por argumento; se envía como primer mensaje`] : []),
    ],
    screen: { working: [SPINNER, ESC_TO_INTERRUPT], blocked: PERMISSION, idle: [/^\s*>\s*$/m] },
    verified: false,
  }
}

export const PROVIDERS: Record<ProviderId, ProviderAdapter> = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    binaries: ['claude'],
    versionArgs: ['--version'],
    sessionPaths: ['.claude.json', '.claude/.credentials.json'],
    buildArgs(o) {
      const args: string[] = []
      if (o.model) args.push('--model', o.model)
      if (o.effort) args.push('--effort', o.effort)
      if (o.systemPrompt) args.push('--append-system-prompt', o.systemPrompt)
      return args
    },
    unsupported: () => [],
    screen: {
      working: [ESC_TO_INTERRUPT, SPINNER],
      blocked: PERMISSION,
      idle: [/\? for shortcuts/i],
    },
    verified: true,
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    binaries: ['codex'],
    versionArgs: ['--version'],
    sessionPaths: ['.codex/auth.json'],
    buildArgs(o) {
      const args: string[] = []
      if (o.model) args.push('-m', o.model)
      if (o.effort) args.push('-c', `model_reasoning_effort=${o.effort}`)
      return args
    },
    unsupported: (o) =>
      o.systemPrompt ? ['Codex no recibe prompt de sistema por argumento; se envía como primer mensaje'] : [],
    screen: {
      working: [ESC_TO_INTERRUPT, /Working \(/],
      blocked: [...PERMISSION, /allow command\?/i],
      idle: [/send ⏎|⏎ send/i],
    },
    verified: false,
  },
  antigravity: generic('antigravity', 'Antigravity', ['antigravity', 'agy']),
  opencode: generic('opencode', 'OpenCode', ['opencode'], ['.local/share/opencode/auth.json']),
  commandcode: generic('commandcode', 'Command Code', ['commandcode', 'cmd-code']),
  kimi: generic('kimi', 'Kimi', ['kimi']),
  grok: generic('grok', 'Grok', ['grok']),
}

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]

export function getProvider(id: string): ProviderAdapter {
  const p = PROVIDERS[id as ProviderId]
  if (!p) throw new Error(`Proveedor desconocido: ${id}`)
  return p
}
