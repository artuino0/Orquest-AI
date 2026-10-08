/**
 * Adaptadores por proveedor. Cada CLI es distinta: cómo se llama, cómo recibe
 * modelo y esfuerzo, dónde guarda su sesión y cómo se ve en pantalla cuando
 * trabaja o espera. Son formatos internos que cambian, por eso todo lo
 * específico de un proveedor vive aquí y en ningún otro lado.
 */

import { dirname, join } from 'node:path'
export type ProviderId =
  | 'claude'
  | 'codex'
  | 'antigravity'
  | 'opencode'
  | 'commandcode'
  | 'kimi'
  | 'grok'

import type { Permissions } from './library.js'

/** Niveles de esfuerzo que existen; cada CLI recibe solo algunos (ver `efforts`). */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type Effort = (typeof EFFORTS)[number]

/**
 * De dónde salen los modelos que ofrece una CLI. No se inventan: son los alias
 * que ella misma documenta, lo que contesta su comando de listado o el modelo
 * por defecto de su archivo de configuración. Sin fuente, el modelo se escribe.
 */
export interface ModelSource {
  /** Alias fijos que la CLI resuelve al modelo vigente. */
  list?: string[]
  /** Comando que los lista. */
  command?: { args: string[]; read(stdout: string): string[] }
  /**
   * Para la CLI que no lista sus modelos: los nombres que trae su propio
   * programa. `files` da dónde puede estar a partir del lanzador encontrado;
   * `read` recibe los nombres hallados y deja los que se ofrecen.
   */
  scan?: { files(binary: string): string[]; pattern: RegExp; read(found: string[]): string[] }
  /** Archivos de la CLI (relativos a $HOME) que dicen qué modelos hay: su lista guardada, su configuración. */
  files?: { path: string; read(text: string): string[] }[]
}

/** Primera palabra de cada renglón, si parece un id de modelo (trae guion o diagonal). */
export const modelIds = (stdout: string): string[] => [
  ...new Set(stdout.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((w) => /^[\w.:@/-]+$/.test(w) && /[-/]/.test(w))),
]

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
  /** Qué modelos ofrece (ver ModelSource). */
  models: ModelSource
  /** Esfuerzos que recibe por argumento, de menor a mayor. Vacío = no recibe. */
  efforts: Effort[]
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
    models: {},
    efforts: [],
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

/** Los modelos que Codex muestra en su selector, de la lista que guarda en disco. */
export function codexModels(text: string): string[] {
  try {
    const { models } = JSON.parse(text) as { models?: { slug?: string; visibility?: string }[] }
    return (models ?? []).filter((m) => m.slug && m.visibility === 'list').map((m) => m.slug!)
  } catch {
    return []
  }
}

/**
 * De los nombres que trae el programa de Claude Code, los vigentes: de la 4.5
 * en adelante, lo más nuevo primero. Los anteriores siguen ahí por
 * compatibilidad, pero ya no se ofrecen.
 */
export function claudeModels(found: string[]): string[] {
  const FAMILIES = ['fable', 'opus', 'sonnet', 'haiku']
  const parse = (id: string) => {
    const [, family, major, minor] = /^claude-(\w+)-(\d)-(\d)$/.exec(id) ?? []
    return { id, family, version: Number(major) * 10 + Number(minor) }
  }
  return [...new Set(found)]
    .map(parse)
    .filter((m) => m.family && m.version >= 45)
    .sort((a, b) => b.version - a.version || FAMILIES.indexOf(a.family) - FAMILIES.indexOf(b.family))
    .map((m) => m.id)
}

/** Para las CLIs genéricas que sí reciben esfuerzo: con qué bandera (según su `--help`). */
function withEffort(name: string, flag: string): Partial<ProviderAdapter> {
  const efforts: Effort[] = ['low', 'medium', 'high']
  return {
    efforts,
    buildArgs: (o) => [...(o.model ? ['--model', o.model] : []), ...(o.effort && efforts.includes(o.effort) ? [flag, o.effort] : [])],
    unsupported: (o) => [
      ...(o.effort && !efforts.includes(o.effort) ? [`${name} no recibe el esfuerzo "${o.effort}"; se ignora`] : []),
      ...(o.systemPrompt ? [`${name} no recibe prompt de sistema por argumento; se envía como primer mensaje`] : []),
    ],
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
    // Alias que la propia CLI resuelve al modelo más nuevo de cada familia (ver `claude --help`).
    // No tiene comando de listado: además de los alias, los nombres completos que trae su programa.
    models: {
      list: ['fable', 'opus', 'sonnet', 'haiku'],
      scan: {
        // Instalada con npm el lanzador es un .cmd y el programa va junto, en node_modules.
        files: (binary) => [binary, join(dirname(binary), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude')],
        pattern: /claude-(?:fable|opus|sonnet|haiku)-\d-\d(?![\d-])/g,
        read: claudeModels,
      },
    },
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
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
    // No tiene comando de listado, pero guarda la lista que le da su servidor; primero va el que tengas por defecto.
    models: {
      files: [
        { path: '.codex/config.toml', read: (t) => [/^model\s*=\s*"([^"]+)"/m.exec(t)?.[1]].filter((m): m is string => !!m) },
        { path: '.codex/models_cache.json', read: codexModels },
      ],
    },
    // Los que admiten todos sus modelos visibles (algunos tienen además uno propio más alto).
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    buildArgs(o) {
      const args: string[] = []
      if (o.model) args.push('-m', o.model)
      if (o.effort && this.efforts.includes(o.effort)) args.push('-c', `model_reasoning_effort=${o.effort}`)
      return args
    },
    unsupported(o) {
      return [
        ...(o.effort && !this.efforts.includes(o.effort) ? [`Codex no recibe el esfuerzo "${o.effort}"; se ignora`] : []),
        ...(o.systemPrompt ? ['Codex no recibe prompt de sistema por argumento; se envía como primer mensaje'] : []),
      ]
    },
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
  // agy no tiene comando para preguntar por la sesión; guarda su acceso de Google junto al de Gemini.
  // `agy models` lista "id<tab>nombre"; el esfuerzo va en el propio id (…-high, …-low).
  antigravity: generic('antigravity', 'Antigravity', ['agy', 'antigravity'], { url: 'https://antigravity.google' }, ['.gemini/oauth_creds.json'], {
    models: { command: { args: ['models'], read: modelIds } },
  }),
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
    models: { command: { args: ['models'], read: modelIds } },
  }),
  // El binario corto de Command Code es `cmd`, que en Windows es el intérprete del sistema: no se busca por ese nombre.
  commandcode: generic('commandcode', 'Command Code', ['commandcode', 'command-code', 'cmd-code'], { url: 'https://commandcode.ai' }, ['.commandcode/auth.json'], {
    models: { command: { args: ['--list-models'], read: modelIds } },
    ...withEffort('Command Code', '--effort'),
  }),
  kimi: generic('kimi', 'Kimi', ['kimi', 'kimi-code'], { url: 'https://github.com/MoonshotAI/kimi-cli' }, ['.kimi/credentials']),
  grok: generic('grok', 'Grok', ['grok'], { url: 'https://x.ai' }, [], withEffort('Grok', '--reasoning-effort')),
}

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]

export function getProvider(id: string): ProviderAdapter {
  const p = PROVIDERS[id as ProviderId]
  if (!p) throw new Error(`Proveedor desconocido: ${id}`)
  return p
}
