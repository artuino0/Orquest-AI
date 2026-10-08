import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listTools, skillHeader } from '../src/core/skills.js'

const dirs: string[] = []
// En Windows git puede tardar en soltar la carpeta: se reintenta en vez de tumbar la prueba.
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })))
const temp = (name: string) => {
  const d = mkdtempSync(join(tmpdir(), name))
  dirs.push(d)
  return d
}
function skill(dir: string, folder: string, header: string) {
  mkdirSync(join(dir, folder), { recursive: true })
  writeFileSync(join(dir, folder, 'SKILL.md'), `---\n${header}\n---\n\n# Cuerpo\n`)
}

describe('skills y servidores MCP instalados', () => {
  it('lee nombre y descripción del encabezado', () => {
    expect(skillHeader('---\nname: playwright-cli\ndescription: "Prueba en el navegador"\n---\ncuerpo')).toEqual({ name: 'playwright-cli', description: 'Prueba en el navegador' })
    expect(skillHeader('sin encabezado')).toEqual({ name: undefined, description: undefined })
  })

  it('junta las tuyas, las de plugins, las del proyecto, las de Codex y los MCP, sin repetir', async () => {
    const home = temp('orquest-home-')
    const repo = temp('orquest-repo-')
    skill(join(home, '.claude', 'skills'), 'playwright-cli', 'name: playwright-cli\ndescription: Prueba en el navegador')
    skill(join(home, '.claude', 'skills'), 'sin-nombre', 'description: toma el nombre de su carpeta')
    const plugin = join(home, 'plugins-cache', 'vercel')
    skill(join(plugin, 'skills'), 'deploy', 'name: deploy')
    skill(join(plugin, 'skills'), 'playwright-cli', 'name: playwright-cli\ndescription: repetida')
    mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
    writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'vercel@oficial': [{ installPath: plugin }] } }))
    skill(join(repo, '.claude', 'skills'), 'corte', 'name: corte')
    skill(join(home, '.codex', 'skills'), 'revisar', 'name: revisar')
    skill(join(home, '.codex', 'skills'), '.system', 'name: interna')
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ mcpServers: { Neon: {}, pencil: {} }, otro: 1 }))
    writeFileSync(join(repo, '.mcp.json'), JSON.stringify({ mcpServers: { playwright: {} } }))

    const tools = await listTools(repo, home)
    expect(tools.map((t) => `${t.kind}:${t.name}:${t.source}`)).toEqual([
      'skill:corte:del proyecto',
      'skill:deploy:plugin vercel',
      'mcp:Neon:MCP tuyo',
      'mcp:pencil:MCP tuyo',
      'mcp:playwright:MCP del proyecto',
      'skill:playwright-cli:tuyas',
      'skill:revisar:Codex',
      'skill:sin-nombre:tuyas',
    ])
    expect(tools.find((t) => t.name === 'playwright-cli')?.description).toBe('Prueba en el navegador')
  })

  it('sin nada instalado devuelve vacío en vez de fallar', async () => {
    expect(await listTools(undefined, temp('orquest-vacio-'))).toEqual([])
  })
})
