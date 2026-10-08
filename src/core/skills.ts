/**
 * Qué skills y servidores MCP hay instalados en esta máquina, para elegir en
 * el manual de cada puesto con cuáles trabaja. No instala ni activa nada: solo
 * lee lo que ya está en disco.
 *
 * - Skills de Claude Code: las del usuario (`~/.claude/skills`), las de sus
 *   plugins instalados y las del proyecto (`<repo>/.claude/skills`).
 * - Skills de Codex: `~/.codex/skills`.
 * - Servidores MCP: los del usuario (`~/.claude.json`) y los del proyecto (`.mcp.json`).
 */
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface InstalledTool {
  /** Como se le nombra al agente (nombre de la skill o del servidor MCP). */
  name: string
  kind: 'skill' | 'mcp'
  /** De dónde sale, dicho para el usuario: "tuyas", "plugin vercel", "del proyecto", "Codex". */
  source: string
  description?: string
}

/** `name` y `description` del encabezado de un SKILL.md; lo demás no importa aquí. */
export function skillHeader(text: string): { name?: string; description?: string } {
  const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''
  const field = (key: string) => new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(head)?.[1]?.trim().replace(/^["']|["']$/g, '')
  return { name: field('name'), description: field('description') }
}

async function skillsIn(dir: string, source: string): Promise<InstalledTool[]> {
  const names = await readdir(dir).catch(() => [] as string[])
  const found: InstalledTool[] = []
  for (const folder of names) {
    if (folder.startsWith('.')) continue
    // Con readFile se siguen los enlaces: muchas skills son accesos a otra carpeta.
    const text = await readFile(join(dir, folder, 'SKILL.md'), 'utf8').catch(() => null)
    if (text === null) continue
    const h = skillHeader(text)
    found.push({ name: h.name || folder, kind: 'skill', source, description: h.description })
  }
  return found
}

async function json(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

const mcpNames = (config: Record<string, unknown> | null) => Object.keys((config?.mcpServers as Record<string, unknown> | undefined) ?? {})

export async function listTools(repo?: string, home = homedir()): Promise<InstalledTool[]> {
  const tools: InstalledTool[] = [...(await skillsIn(join(home, '.claude', 'skills'), 'tuyas'))]

  // Plugins de Claude Code: cada uno dice dónde quedó instalado.
  const installed = await json(join(home, '.claude', 'plugins', 'installed_plugins.json'))
  const plugins = ((installed?.plugins as Record<string, unknown> | undefined) ?? {}) as Record<string, { installPath?: string }[] | { installPath?: string }>
  for (const [key, entry] of Object.entries(plugins)) {
    const path = (Array.isArray(entry) ? entry[0] : entry)?.installPath
    if (path) tools.push(...(await skillsIn(join(path, 'skills'), `plugin ${key.split('@')[0]}`)))
  }

  if (repo) tools.push(...(await skillsIn(join(repo, '.claude', 'skills'), 'del proyecto')))
  tools.push(...(await skillsIn(join(home, '.codex', 'skills'), 'Codex')))

  for (const name of mcpNames(await json(join(home, '.claude.json')))) tools.push({ name, kind: 'mcp', source: 'MCP tuyo' })
  if (repo) for (const name of mcpNames(await json(join(repo, '.mcp.json')))) tools.push({ name, kind: 'mcp', source: 'MCP del proyecto' })

  // La misma skill puede estar en dos lados: se queda la primera (las tuyas mandan).
  const seen = new Set<string>()
  return tools.filter((t) => !seen.has(`${t.kind}:${t.name}`) && seen.add(`${t.kind}:${t.name}`)).sort((a, b) => a.name.localeCompare(b.name))
}
