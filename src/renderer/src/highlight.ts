/**
 * Colores de sintaxis para el visor de archivos: de qué lenguaje es un archivo
 * (por su nombre) y su texto pintado como HTML. Lo que no se reconoce sale
 * como texto simple, siempre escapado.
 */
import hljs from 'highlight.js/lib/common'

/** Extensión → lenguaje de highlight.js. */
const BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  vue: 'xml', html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml',
  json: 'json', jsonc: 'json', md: 'markdown', markdown: 'markdown',
  css: 'css', scss: 'scss', less: 'less',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', kts: 'kotlin',
  cs: 'csharp', php: 'php', swift: 'swift', lua: 'lua', r: 'r', pl: 'perl', sql: 'sql',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', m: 'objectivec',
  sh: 'bash', bash: 'bash', zsh: 'bash', yml: 'yaml', yaml: 'yaml',
  toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', env: 'ini', properties: 'ini',
  graphql: 'graphql', gql: 'graphql', diff: 'diff', patch: 'diff', vb: 'vbnet',
}
/** Archivos que se reconocen por su nombre entero. */
const BY_NAME: Record<string, string> = { makefile: 'makefile', '.env': 'ini', '.gitconfig': 'ini', '.npmrc': 'ini', '.editorconfig': 'ini', '.bashrc': 'bash', '.zshrc': 'bash' }

/** Más largo que esto no se pinta: tardaría y se nota al abrirlo. */
const MAX_PAINT = 200_000

/** El lenguaje de un archivo según su nombre; undefined si no se sabe. */
export function langOf(path: string): string | undefined {
  const name = path.split(/[\\/]/).pop()!.toLowerCase()
  if (BY_NAME[name]) return BY_NAME[name]
  // `.env.local`, `.env.production`: siguen siendo variables.
  if (name.startsWith('.env.')) return 'ini'
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  return BY_EXT[ext]
}

export const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** El texto como HTML con sus colores (`<span class="hljs-…">`); sin lenguaje conocido, solo escapado. */
export function paint(text: string, path: string): string {
  const language = langOf(path)
  if (!language || text.length > MAX_PAINT) return escapeHtml(text)
  try {
    return hljs.highlight(text, { language, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(text)
  }
}
