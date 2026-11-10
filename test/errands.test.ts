import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliStatus } from '../src/core/detect.js'
import { addChangelogEntry, branchFor, clashes, errandIdFor } from '../src/core/errands.js'
import { EmployeeManager, type Pty, type Spawner } from '../src/core/employees.js'
import { Library } from '../src/core/library.js'
import { startMcpServer, type McpHandle } from '../src/core/mcp.js'
import { officeState } from '../src/core/officefeed.js'
import { claudePermissions, getProvider, opencodePermissions } from '../src/core/providers.js'
import { StudioStore } from '../src/core/store.js'
import { Studio } from '../src/core/studio.js'
import { listBranches, mergeInto } from '../src/core/worktree.js'

describe('tareas: ramas y nombres', () => {
  it('la rama lleva el prefijo de su tipo y no repite una que exista', () => {
    expect(branchFor('fix', 'Botón de Estudio se queda en «Consultando»', [])).toBe('fix/boton-de-estudio-se-queda-en-consultando')
    expect(branchFor('feature', 'Exportar pedidos a CSV', ['feature/exportar-pedidos-a-csv'])).toBe('feature/exportar-pedidos-a-csv-2')
    expect(branchFor('hotfix', 'Total', [])).toBe('hotfix/total')
    expect(branchFor('chore', 'Ordenar', [])).toBe('chore/ordenar')
    // Un título largo se corta en un guion, sin media palabra.
    const long = branchFor('feature', 'Que la lista de pedidos se pueda exportar a CSV con las columnas visibles', [])
    expect(long.length).toBeLessThanOrEqual('feature/'.length + 40)
    expect(long.endsWith('-')).toBe(false)
    expect(errandIdFor('Exportar a CSV', ['tarea-exportar-a-csv'])).toBe('tarea-exportar-a-csv-2')
  })
})

describe('tareas: registro de cambios', () => {
  it('sin archivo lo crea con «Sin publicar» y la sección del tipo', () => {
    const out = addChangelogEntry(null, 'feature', 'Exportar pedidos a CSV')
    expect(out).toContain('## [Sin publicar]')
    expect(out).toContain('### Agregado\n\n- Exportar pedidos a CSV\n')
  })

  it('agrega a la sección que ya existe, después de su último renglón', () => {
    const before = '# Cambios\n\n## [Sin publicar]\n\n### Corregido\n\n- Uno\n\n## [1.0.0] - 2026-01-01\n\n### Agregado\n\n- Viejo\n'
    const out = addChangelogEntry(before, 'fix', 'Dos')
    expect(out).toBe('# Cambios\n\n## [Sin publicar]\n\n### Corregido\n\n- Uno\n- Dos\n\n## [1.0.0] - 2026-01-01\n\n### Agregado\n\n- Viejo\n')
  })

  it('reconoce los nombres en inglés y agrega la sección que falte sin tocar las versiones', () => {
    const before = '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- One\n\n## [1.0.0]\n\n- Old\n'
    const fixed = addChangelogEntry(before, 'hotfix', 'Two')
    expect(fixed).toContain('### Fixed\n\n- One\n- Urgente: Two\n')
    const added = addChangelogEntry(before, 'feature', 'New thing')
    expect(added).toBe('# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- One\n\n### Agregado\n\n- New thing\n\n## [1.0.0]\n\n- Old\n')
  })

  it('sin «Sin publicar» lo crea antes de la primera versión', () => {
    const out = addChangelogEntry('# Cambios\n\n## [1.0.0]\n\n- Viejo\n', 'chore', 'Ordena tipos')
    expect(out).toBe('# Cambios\n\n## [Sin publicar]\n\n### Cambiado\n\n- Ordena tipos\n\n## [1.0.0]\n\n- Viejo\n')
  })

  it('respeta los saltos de línea de Windows', () => {
    const out = addChangelogEntry('# C\r\n\r\n## [Sin publicar]\r\n\r\n### Agregado\r\n\r\n- A\r\n', 'feature', 'B')
    expect(out).toBe('# C\r\n\r\n## [Sin publicar]\r\n\r\n### Agregado\r\n\r\n- A\r\n- B\r\n')
  })
})

describe('tareas: choques', () => {
  it('se detiene la que llegó después, solo si es del mismo repositorio', () => {
    const r = clashes([
      { id: 'b', createdAt: 2, files: ['api/pedidos.ts', 'x.ts'] },
      { id: 'a', createdAt: 1, files: ['api/pedidos.ts'] },
      { id: 'c', createdAt: 3, repo: 'front', files: ['api/pedidos.ts'] },
      { id: 'd', createdAt: 4, files: ['otro.ts'] },
    ])
    expect(r).toEqual([{ stop: 'b', with: 'a', files: ['api/pedidos.ts'] }])
    // Una que ya está detenida no se vuelve a reportar.
    expect(clashes([{ id: 'a', createdAt: 1, files: ['f'] }, { id: 'b', createdAt: 2, files: ['f'], stopped: true }])).toEqual([])
  })
})

describe('tareas: permisos', () => {
  it('trabajan sin preguntar, pero lo prohibido sigue negado', () => {
    const p = new Library().manual('tarea').permissions
    expect(p.unattended).toBe(true)
    expect(p.deny).toContain('git push')
    expect(claudePermissions(p)).toMatchObject({ defaultMode: 'bypassPermissions', deny: expect.arrayContaining(['Bash(git push:*)']) })
    expect(opencodePermissions(p)).toMatchObject({ edit: 'allow', bash: { '*': 'allow', 'git push': 'deny', 'git push *': 'deny' } })
    const codex = getProvider('codex').mcpArgs!({ url: 'http://x', permissions: p })
    expect(codex.join(' ')).toContain('-a never')
    expect(codex.join(' ')).toContain('workspace-write')
    // Un puesto normal sigue preguntando.
    expect(claudePermissions(new Library().manual('backend').permissions)).not.toHaveProperty('defaultMode')
  })

  it('el manual de las Tareas sale junto a los de los puestos y se guarda', () => {
    const lib = new Library()
    expect(lib.manuals().at(-1)?.role).toBe('tarea')
    lib.saveManual({ ...lib.manual('tarea'), permissions: { ...lib.manual('tarea').permissions, deny: ['git push', 'npm publish'] } })
    expect(lib.manual('tarea').permissions).toMatchObject({ unattended: true, deny: ['git push', 'npm publish'] })
  })

  it('no entran a la oficina de píxel', () => {
    const s = officeState({ employees: [{ id: 'tarea-x', state: 'working', role: 'tarea', provider: 'claude' }, { id: 'ana-backend', state: 'working', role: 'backend', provider: 'claude' }], names: {}, tasks: [], hints: {} })
    expect(s.people.map((p) => p.id)).toEqual(['ana-backend'])
  })
})

// ── Con git real y una CLI de mentira ───────────────────────────────────────

async function makeRepo(): Promise<{ dir: string; git: (...a: string[]) => string }> {
  const dir = await mkdtemp(join(tmpdir(), 'orquest-tareas-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir }).toString().trim()
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@orquest.dev')
  git('config', 'user.name', 'Orquest')
  git('config', 'core.autocrlf', 'false')
  await writeFile(join(dir, 'README.md'), '# tienda\n')
  await writeFile(join(dir, 'api.ts'), 'export const total = 1\n')
  git('add', '.')
  git('commit', '-qm', 'inicio')
  git('branch', 'develop')
  return { dir, git }
}

describe('integrar en una rama que no es la abierta', () => {
  it('une donde la rama está abierta o en una carpeta de paso, con el registro en el mismo commit', async () => {
    const { dir, git } = await makeRepo()
    git('checkout', '-q', '-b', 'fix/uno', 'develop')
    await writeFile(join(dir, 'api.ts'), 'export const total = 2\n')
    git('commit', '-qam', 'arregla')
    git('checkout', '-q', 'main')
    // develop no está abierta en ninguna carpeta: se integra en una de paso.
    const r = await mergeInto(dir, 'develop', 'fix/uno', 'fix: uno', async (d) => {
      await writeFile(join(d, 'CHANGELOG.md'), addChangelogEntry(null, 'fix', 'Arregla el total'))
      return ['CHANGELOG.md']
    })
    expect(r.ok).toBe(true)
    expect(git('show', 'develop:api.ts')).toBe('export const total = 2')
    expect(git('show', 'develop:CHANGELOG.md')).toContain('- Arregla el total')
    expect(git('log', '-1', '--format=%s', 'develop')).toBe('fix: uno')
    // main no se movió y no quedó ninguna carpeta de paso.
    expect(git('show', 'main:api.ts')).toBe('export const total = 1')
    expect(git('worktree', 'list').split('\n')).toHaveLength(1)
    // Otra vez la misma rama: ya no trae nada.
    expect(await mergeInto(dir, 'develop', 'fix/uno', 'x')).toMatchObject({ ok: false, reason: expect.stringContaining('no trae nada') })
    expect((await listBranches(dir)).branches).toEqual(expect.arrayContaining(['main', 'develop', 'fix/uno']))
  })

  it('si choca, aborta sin dejar nada a medias', async () => {
    const { dir, git } = await makeRepo()
    git('checkout', '-q', '-b', 'fix/a', 'main')
    await writeFile(join(dir, 'api.ts'), 'export const total = 3\n')
    git('commit', '-qam', 'a')
    git('checkout', '-q', 'main')
    await writeFile(join(dir, 'api.ts'), 'export const total = 4\n')
    git('commit', '-qam', 'b')
    const r = await mergeInto(dir, 'main', 'fix/a', 'x')
    expect(r).toMatchObject({ ok: false, conflicts: ['api.ts'] })
    expect(git('status', '--porcelain')).toBe('')
  })
})

const typed = new Map<string, string>()
const launched = new Map<string, string[]>()
const fakeSpawn: Spawner = (_file, args, o) => {
  const id = o.env.ORQUEST_EMPLOYEE_ID
  typed.set(id, '')
  launched.set(id, args)
  let onExit: (e: { exitCode: number }) => void = () => {}
  const pty: Pty = {
    pid: 1,
    onData: (cb) => void setTimeout(() => cb('\x1b[2J\x1b[H> \r\n? for shortcuts · ⏎ send'), 5),
    onExit: (cb) => (onExit = cb),
    write: (d) => typed.set(id, typed.get(id) + d),
    resize: () => {},
    kill: () => onExit({ exitCode: 0 }),
  }
  return pty
}
const CLIS: CliStatus[] = [{ id: 'claude', name: 'Claude Code', installed: true, session: true, version: '2' }]

let mcp: McpHandle | undefined
let studio: Studio | undefined
afterEach(async () => {
  studio?.shutdown()
  await mcp?.close()
})

const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms))

async function setup() {
  const repo = await makeRepo()
  const manager = new EmployeeManager(fakeSpawn, { quietMs: 20, settleMs: 0 })
  let s!: Studio
  mcp = await startMcpServer((token) => {
    const caller = s.caller(token)
    return caller && { studio: s, caller }
  })
  s = await new Studio({ repo: repo.dir, manager, store: new StudioStore(':memory:'), detect: async () => CLIS, mcpUrl: (t) => mcp!.url(t), submitDelayMs: 0 }).init()
  studio = s
  return { ...repo, manager, s }
}

async function connect(args: string[], id: string) {
  const url = JSON.parse(args[args.indexOf('--mcp-config') + 1]).mcpServers.orquest.url
  const client = new Client({ name: id, version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url)))
  const call = async (name: string, a: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: a })) as { isError?: boolean; content: { text: string }[] }
    return { error: !!r.isError, text: r.content[0].text }
  }
  return { client, call }
}

describe('una tarea de punta a punta', () => {
  it('sale de la rama elegida, cuenta su avance, se aprueba y vuelve a esa rama con su registro', async () => {
    const { dir, git, s } = await setup()
    const notices: string[] = []
    s.on('notice', (n) => notices.push(n))

    // Sin rama de origen no se crea: el usuario la elige.
    await expect(s.createErrand({ title: 'Total', brief: 'Arregla el total', kind: 'fix', provider: 'claude' })).rejects.toThrow(/de qué rama sale/)
    await expect(s.createErrand({ title: 'Total', brief: 'x', kind: 'fix', provider: 'claude', base: 'no-existe' })).rejects.toThrow(/No existe la rama/)

    const e = await s.createErrand({ title: 'Total con IVA', brief: 'El total no suma el IVA', kind: 'fix', provider: 'claude', base: 'develop' })
    expect(e).toMatchObject({ id: 'tarea-total-con-iva', branch: 'fix/total-con-iva', base: 'develop', status: 'working' })
    expect(git('rev-parse', 'fix/total-con-iva')).toBe(git('rev-parse', 'develop'))
    // Trabaja sin pedir permisos, con su lista de prohibidos.
    const settings = JSON.parse(launched.get(e.id)![launched.get(e.id)!.indexOf('--settings') + 1])
    expect(settings.permissions).toMatchObject({ defaultMode: 'bypassPermissions', deny: expect.arrayContaining(['Bash(git push:*)']) })
    await tick()
    expect(typed.get(e.id)).toContain('El total no suma el IVA')

    // Solo ve sus herramientas.
    const agent = await connect(launched.get(e.id)!, e.id)
    const names = (await agent.client.listTools()).tools.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['contar_avance', 'tarea_lista', 'responder_al_usuario', 'leer_diseno']))
    expect(names).not.toContain('entregar')
    expect(names).not.toContain('leer_proyecto')

    await agent.call('contar_avance', { texto: 'Encontré la suma en api.ts' })
    await writeFile(join(e.office!.path, 'api.ts'), 'export const total = 1.16\n')
    await agent.call('tarea_lista', { registro: 'El total ya incluye el IVA', resumen: 'Cambié api.ts; corre las pruebas' })
    expect(s.board.errands[0]).toMatchObject({ status: 'ready', changelog: 'El total ya incluye el IVA' })
    expect(s.board.errands[0].log.map((l) => l.by)).toEqual(['user', 'agent', 'agent'])
    expect(notices.at(-1)).toContain('lista para que la revises')
    // Lo que cambia contra su rama de origen, ya en commits: el diff no se queda vacío.
    expect(await s.errandChanges(e.id)).toEqual([{ status: 'M', path: 'api.ts', added: 1, removed: 1 }])
    expect(await s.errandDiff(e.id, 'api.ts')).toContain('+export const total = 1.16')

    // El jefe la ve, pero no le manda nada.
    expect(JSON.parse(await s.call({ kind: 'boss' }, 'leer_proyecto', {})).tareas_directas[0]).toMatchObject({ titulo: 'Total con IVA', estado: 'ready' })

    // Aprobar: se une a develop (no a main, que es la abierta) con su línea en el registro, y se cierra.
    const office = e.office!.path
    expect(await s.approveErrand(e.id)).toEqual({ merged: true })
    expect(git('show', 'develop:api.ts')).toBe('export const total = 1.16')
    expect(git('show', 'develop:CHANGELOG.md')).toContain('### Corregido\n\n- El total ya incluye el IVA')
    expect(git('show', 'main:api.ts')).toBe('export const total = 1')
    expect(s.board.errands[0]).toMatchObject({ status: 'merged', office: undefined })
    expect(existsSync(office)).toBe(false)
    expect(git('branch', '--list', 'fix/total-con-iva')).toBe('')
    expect(s.manager.isLive(e.id)).toBe(false)
    await expect(s.approveErrand(e.id)).rejects.toThrow(/ya está cerrada/)
    expect(await readFile(join(dir, 'api.ts'), 'utf8')).toBe('export const total = 1\n')
  })

  it('dos tareas que tocan el mismo archivo: se detiene la segunda; la que choca al integrar lo resuelve ella', async () => {
    const { git, s } = await setup()
    const a = await s.createErrand({ title: 'Uno', brief: 'a', kind: 'feature', provider: 'claude', base: 'main' })
    const b = await s.createErrand({ title: 'Dos', brief: 'b', kind: 'feature', provider: 'claude', base: 'main' })
    await tick()
    const agentB = await connect(launched.get(b.id)!, b.id)
    await writeFile(join(a.office!.path, 'api.ts'), 'export const total = 10\n')
    await writeFile(join(b.office!.path, 'api.ts'), 'export const total = 20\n')
    await agentB.call('tarea_lista', { registro: 'Dos', resumen: 'b' })
    expect(s.board.errands.find((x) => x.id === b.id)).toMatchObject({ status: 'stopped', stopReason: expect.stringContaining('api.ts') })
    expect(typed.get(b.id)).toContain('Detente')
    expect(s.board.errands.find((x) => x.id === a.id)!.status).toBe('working')

    // A se integra primero; B choca al integrar y se le pide resolverlo en su rama.
    expect(await s.approveErrand(a.id)).toEqual({ merged: true })
    const r = await s.approveErrand(b.id)
    expect(r).toMatchObject({ merged: false, reason: expect.stringContaining('api.ts') })
    expect(s.board.errands.find((x) => x.id === b.id)!.status).toBe('working')
    await tick()
    expect(typed.get(b.id)).toContain('git merge main')
    expect(git('status', '--porcelain')).toBe('')

    // Descartarla: no se une y se quita su rama.
    await s.discardErrand(b.id)
    expect(s.board.errands.find((x) => x.id === b.id)!.status).toBe('discarded')
    expect(git('branch', '--list', b.branch)).toBe('')
    expect(git('show', 'main:api.ts')).toBe('export const total = 10')
  })

  it('al reabrir, la tarea abierta vuelve a su carpeta', async () => {
    const { s, manager } = await setup()
    const e = await s.createErrand({ title: 'Vuelve', brief: 'x', kind: 'chore', provider: 'claude', base: 'main' })
    await manager.fire(e.id, s.root)
    expect(s.resumable).toEqual(['Tarea «Vuelve»'])
    await s.resume()
    expect(manager.isLive(e.id)).toBe(true)
    expect(s.resumable).toEqual([])
  })
})
