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

import type { Permissions } from './library.js'

export type Effort = 'low' | 'medium' | 'high'

const EDIT_TOOLS = ['Edit', 'Write', 'NotebookEdit']

/**
 * Permisos del puesto en formato de Claude Code. Van en --settings como JSON
 * para que reglas con espacios ("Bash(git reset --hard:*)") no se partan.
 */
export function claudePermissions(p: Permissions) {
  return {
    allow: ['mcp__orquest', ...(p.edit ? EDIT_TOOLS : []), ...p.allow.map((c) => `Bash(${c}:*)`)],
    deny: [...(p.edit ? [] : EDIT_TOOLS), ...p.deny.map((c) => `Bash(${c}:*)`)],
  }
}

export interface LaunchOptions {
  model?: string
  effort?: Effort
  /** Prompt de sistema del puesto (manual). Solo si el proveedor lo soporta. */
  systemPrompt?: string
}

/** Proveedores que reciben el manual por argumento; al resto se le manda como primer mensaje. */
export function takesSystemPrompt(p: ProviderAdapter): boolean {
  return p.unsupported({ systemPrompt: 'x' }).length === 0
}

export interface ScreenPatterns {
  /** La CLI está pensando o ejecutando herramientas. */
  working: RegExp[]
  /** La CLI espera una decisión del usuario (permiso, confirmación). */
  blocked: RegExp[]
  /** La CLI terminó su turno y espera instrucción. */
  idle: RegExp[]
  /** % de contexto usado, si la CLI lo muestra en pantalla. */
  context?: (screen: string) => number | undefined
}

/** Toma el primer patrón que coincida y lo pasa a % usado. */
function contextFrom(rules: [RegExp, (n: number) => number][]) {
  return (screen: string) => {
    for (const [re, toUsed] of rules) {
      const m = re.exec(screen)
      if (m) return Math.max(0, Math.min(100, toUsed(Number(m[1]))))
    }
    return undefined
  }
}

export interface ConnectOptions {
  /** URL MCP de Orquest con el token del agente. */
  url: string
  /** Permisos del puesto. */
  permissions?: Permissions
  /** URL donde la CLI reporta su estado (contexto, uso de la cuenta), si sabe hacerlo. */
  statusUrl?: string
}

export interface SessionCheck {
  args: string[]
  /** Lee la respuesta: hay sesión o no y, si lo dice, de qué cuenta. */
  read(out: { stdout: string; stderr: string; code: number }): { ok: boolean; account?: string }
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
  /**
   * Cómo preguntarle a la propia CLI si hay sesión. Es mejor fuente que un
   * archivo (que puede seguir ahí tras cerrar sesión); si el comando no corre,
   * se cae a sessionPaths.
   */
  sessionCheck?: SessionCheck
  /** Qué hacer para iniciar sesión, dicho para el usuario. */
  login: string
  /** Cómo se instala: comando si es uno solo y la página oficial. */
  install: { command?: string; url: string }
  /** Argumentos para lanzar la CLI interactiva en su PTY. */
  buildArgs(opts: LaunchOptions): string[]
  /** Advertencias sobre opciones que este proveedor no sabe recibir. */
  unsupported(opts: LaunchOptions): string[]
  screen: ScreenPatterns
  /**
   * Argumentos para conectar la CLI al servidor MCP de Orquest. El token va en
   * la URL. undefined = no sabemos conectarla; el jefe le habla por terminal.
   */
  mcpArgs?(o: ConnectOptions): string[]
  /** Partes de los permisos del puesto que esta CLI no sabe aplicar. */
  permissionGaps?(permissions: Permissions): string[]
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
  install: ProviderAdapter['install'],
  sessionPaths: string[] = [],
  extra: Partial<ProviderAdapter> = {},
): ProviderAdapter {
  return {
    id,
    name,
    binaries,
    versionArgs: ['--version'],
    sessionPaths,
    // Sin comando de login conocido: la propia CLI lo pide al abrirla.
    login: `abre ${binaries[0]} en una terminal y sigue su inicio de sesión`,
    install,
    buildArgs: (o) => (o.model ? ['--model', o.model] : []),
    unsupported: (o) => [
      ...(o.effort ? [`${name} no recibe esfuerzo por argumento; se ignora`] : []),
      ...(o.systemPrompt ? [`${name} no recibe prompt de sistema por argumento; se envía como primer mensaje`] : []),
    ],
    screen: { working: [SPINNER, ESC_TO_INTERRUPT], blocked: PERMISSION, idle: [/^\s*>\s*$/m] },
    verified: false,
    ...extra,
  }
}

export const PROVIDERS: Record<ProviderId, ProviderAdapter> = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    binaries: ['claude'],
    versionArgs: ['--version'],
    sessionPaths: ['.claude/.credentials.json'],
    sessionCheck: {
      args: ['auth', 'status'],
      // Contesta JSON: { loggedIn, email, subscriptionType, … }
      read({ stdout }) {
        try {
          const s = JSON.parse(stdout) as { loggedIn?: boolean; email?: string; subscriptionType?: string }
          return { ok: !!s.loggedIn, account: [s.email, s.subscriptionType].filter(Boolean).join(' · ') || undefined }
        } catch {
          return { ok: false }
        }
      },
    },
    login: 'claude auth login',
    install: { command: 'npm install -g @anthropic-ai/claude-code', url: 'https://docs.claude.com/en/docs/claude-code/setup' },
    buildArgs(o) {
      const args: string[] = []
      if (o.model) args.push('--model', o.model)
      if (o.effort) args.push('--effort', o.effort)
      if (o.systemPrompt) args.push('--append-system-prompt', o.systemPrompt)
      return args
    },
    unsupported: () => [],
    mcpArgs: ({ url, permissions, statusUrl }) => [
      '--mcp-config',
      JSON.stringify({ mcpServers: { orquest: { type: 'http', url } } }),
      '--settings',
      JSON.stringify({
        // Las herramientas de Orquest se validan en la app; no piden permiso.
        // Lo demás, según el manual del puesto.
        permissions: permissions ? claudePermissions(permissions) : { allow: ['mcp__orquest'] },
        // La barra de estado recibe el % de contexto usado y el uso de la
        // cuenta; se lo reenvía a Orquest y no pinta nada.
        ...(statusUrl && {
          statusLine: {
            type: 'command',
            command: `curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- '${statusUrl}' >/dev/null 2>&1; printf ''`,
          },
        }),
      }),
    ],
    screen: {
      working: [ESC_TO_INTERRUPT, SPINNER],
      // Primer arranque: tema, notas de seguridad y confiar en la carpeta. Las resuelve el usuario.
      blocked: [...PERMISSION, /press enter to continue/i, /trust (this|the files in this) folder/i, /choose the text style/i, /select login method/i],
      // La pista "? for shortcuts" desaparece cuando hay barra de estado; la
      // caja de entrada entre dos líneas siempre está.
      idle: [/\? for shortcuts/i, /─{10,}\n\s*❯[^\n]*\n─{10,}/],
      // Respaldo si la barra de estado no reporta.
      context: contextFrom([
        [/(\d+)% context used/i, (n) => n],
        [/Context low \((\d+)% remaining\)/i, (n) => 100 - n],
        [/(\d+)% until auto-compact/i, (n) => 100 - n],
      ]),
    },
    verified: true,
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    binaries: ['codex'],
    versionArgs: ['--version'],
    sessionPaths: ['.codex/auth.json'],
    sessionCheck: {
      args: ['login', 'status'],
      // "Logged in using ChatGPT" / "Not logged in"
      read: ({ stdout, stderr, code }) => {
        const text = `${stdout}
${stderr}`
        const ok = code === 0 && /logged in/i.test(text) && !/not logged in/i.test(text)
        return { ok, account: ok ? /using (.+)/i.exec(text)?.[1]?.trim() : undefined }
      },
    },
    login: 'codex login',
    install: { command: 'npm install -g @openai/codex', url: 'https://developers.openai.com/codex/cli' },
    buildArgs(o) {
      const args: string[] = []
      if (o.model) args.push('-m', o.model)
      if (o.effort) args.push('-c', `model_reasoning_effort=${o.effort}`)
      return args
    },
    unsupported: (o) =>
      o.systemPrompt ? ['Codex no recibe prompt de sistema por argumento; se envía como primer mensaje'] : [],
    mcpArgs: ({ url, permissions }) => [
      '-c',
      `mcp_servers.orquest.url=${JSON.stringify(url)}`,
      ...(permissions ? ['-s', permissions.edit ? 'workspace-write' : 'read-only'] : []),
    ],
    // Codex solo distingue escribir o no; los comandos los aprueba el usuario.
    permissionGaps: (p) => (p.allow.length || p.deny.length ? ['Codex no aplica listas de comandos permitidos o prohibidos; los pide al usuario.'] : []),
    screen: {
      working: [ESC_TO_INTERRUPT, /Working \(/],
      blocked: [...PERMISSION, /allow command\?/i],
      idle: [/send ⏎|⏎ send/i],
      context: contextFrom([[/(\d+)% context left/i, (n) => 100 - n]]),
    },
    verified: false,
  },
  antigravity: generic('antigravity', 'Antigravity', ['agy', 'antigravity'], { url: 'https://antigravity.google' }),
  opencode: generic('opencode', 'OpenCode', ['opencode'], { command: 'npm install -g opencode-ai', url: 'https://opencode.ai' }, ['.local/share/opencode/auth.json'], {
    sessionCheck: {
      args: ['auth', 'list'],
      // Lista las credenciales guardadas y termina con "N credentials".
      read: ({ stdout, code }) => {
        const n = Number(/(\d+)\s+credentials?/i.exec(stdout)?.[1] ?? 0)
        return { ok: code === 0 && n > 0, account: n ? `${n} ${n === 1 ? 'credencial' : 'credenciales'}` : undefined }
      },
    },
    login: 'opencode auth login',
  }),
  // El binario corto de Command Code es `cmd`, que en Windows es el intérprete del sistema: no se busca por ese nombre.
  commandcode: generic('commandcode', 'Command Code', ['commandcode', 'command-code', 'cmd-code'], { url: 'https://commandcode.ai' }, ['.commandcode/auth.json']),
  kimi: generic('kimi', 'Kimi', ['kimi', 'kimi-code'], { url: 'https://github.com/MoonshotAI/kimi-cli' }, ['.kimi/credentials']),
  grok: generic('grok', 'Grok', ['grok'], { url: 'https://x.ai' }),
}

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]

export function getProvider(id: string): ProviderAdapter {
  const p = PROVIDERS[id as ProviderId]
  if (!p) throw new Error(`Proveedor desconocido: ${id}`)
  return p
}
