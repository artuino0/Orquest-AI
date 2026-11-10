import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliStatus } from '../src/core/detect.js'
import { EmployeeManager, type Pty, type Spawner } from '../src/core/employees.js'
import { startMcpServer, type McpHandle } from '../src/core/mcp.js'
import { getProvider } from '../src/core/providers.js'
import { BOSS_ID, Studio } from '../src/core/studio.js'

/** Argumentos con que nació cada terminal (la última vez). */
const launched = new Map<string, string[]>()
const spawn: Spawner = (_file, args, o) => {
  launched.set(o.env.ORQUEST_EMPLOYEE_ID, args)
  let onExit: (e: { exitCode: number }) => void = () => {}
  const pty: Pty = {
    pid: 1,
    onData: (cb) => void setTimeout(() => cb('\x1b[2J\x1b[H> \r\n? for shortcuts · ⏎ send'), 5),
    onExit: (cb) => (onExit = cb),
    write: () => {},
    resize: () => {},
    kill: () => onExit({ exitCode: 0 }),
  }
  return pty
}
const CLIS: CliStatus[] = [{ id: 'claude', name: 'Claude Code', installed: true, session: true, version: '2' }]
const settingsOf = (id: string) => {
  const a = launched.get(id)!
  return JSON.parse(a[a.indexOf('--settings') + 1]).permissions
}

let mcp: McpHandle | undefined
let studio: Studio | undefined
afterEach(async () => {
  studio?.shutdown()
  await mcp?.close()
})

describe('YOLO: empleados que trabajan sin pedir permisos', () => {
  it('lo marca el usuario al aprobar la plantilla; el jefe no; lo prohibido sigue negado', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orquest-yolo-'))
    const git = (...a: string[]) => execFileSync('git', a, { cwd: dir })
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 't@t')
    git('config', 'user.name', 't')
    await writeFile(join(dir, 'README.md'), '# x\n')
    git('add', '.')
    git('commit', '-qm', 'inicio')
    const manager = new EmployeeManager(spawn, { quietMs: 20, settleMs: 0 })
    let s!: Studio
    mcp = await startMcpServer((token) => {
      const caller = s.caller(token)
      return caller && { studio: s, caller }
    })
    s = await new Studio({ repo: dir, manager, detect: async () => CLIS, mcpUrl: (t) => mcp!.url(t), submitDelayMs: 0 }).init()
    studio = s
    await s.hireBoss({ provider: 'claude', goal: 'x' })
    const url = JSON.parse(launched.get(BOSS_ID)![launched.get(BOSS_ID)!.indexOf('--mcp-config') + 1]).mcpServers.orquest.url
    const boss = new Client({ name: 'jefe', version: '1' })
    await boss.connect(new StreamableHTTPClientTransport(new URL(url)))
    const call = (name: string, args: Record<string, unknown>) => boss.callTool({ name, arguments: args })
    // El jefe propone; aunque mandara el campo, no existe en su herramienta: la propuesta nace sin YOLO.
    await call('proponer_plantilla', { puestos: [{ puesto: 'backend', proveedor: 'claude', motivo: 'a' }, { puesto: 'qa', proveedor: 'claude', motivo: 'b', unattended: true }] })
    expect(s.board.slots.every((x) => !x.unattended)).toBe(true)
    // El usuario aprueba: backend en YOLO, QA no.
    s.approveTemplate(s.board.slots.map((x) => ({ id: x.id, role: x.role, provider: x.provider, unattended: x.role === 'backend' })))
    await call('levantar_empleado', { puesto: 'backend' })
    await call('levantar_empleado', { puesto: 'qa' })
    const back = s.board.staff.find((m) => m.role === 'backend')!.id
    const qa = s.board.staff.find((m) => m.role === 'qa')!.id
    expect(settingsOf(back)).toMatchObject({ defaultMode: 'bypassPermissions', deny: expect.arrayContaining(['Bash(git push:*)']) })
    expect(settingsOf(qa)).not.toHaveProperty('defaultMode')

    // Ya contratado: el usuario se lo prende a QA y vuelve a entrar con sus permisos nuevos.
    await s.retune(qa, { unattended: true })
    expect(s.board.slots.find((x) => x.employeeId === qa)!.unattended).toBe(true)
    await new Promise((r) => setTimeout(r, 50))
    expect(await (s as unknown as { launches: Map<string, { req: { extraArgs: string[] } }> }).launches.get(qa)!.req.extraArgs.join(' ')).toContain('bypassPermissions')
  })

  it('un manual que no deja editar sigue sin dejar editar, aunque esté en YOLO', async () => {
    const { claudePermissions, opencodePermissions } = await import('../src/core/providers.js')
    const p = { edit: false, allow: [], deny: ['git push'], unattended: true }
    expect(claudePermissions(p).deny).toEqual(expect.arrayContaining(['Edit', 'Write', 'Bash(git push:*)']))
    expect(opencodePermissions(p).edit).toBe('deny')
    expect(getProvider('codex').mcpArgs!({ url: 'http://x', permissions: p }).join(' ')).toContain('read-only')
  })

  it('Antigravity no deja quitarle las preguntas desde Orquest: se avisa cómo hacerlo en su ajuste', () => {
    const gaps = getProvider('antigravity').permissionGaps!({ edit: true, allow: [], deny: ['git push'], unattended: true })
    expect(gaps.join(' ')).toContain('always-proceed')
  })
})

import { Board } from '../src/core/board.js'

describe('lo que deja quien se va', () => {
  const team = () => {
    const b = new Board()
    b.staff.push(
      { id: 'dani', name: 'Dani', role: 'frontend', provider: 'claude', online: true },
      { id: 'fede', name: 'Fede', role: 'qa', provider: 'antigravity', online: true },
      { id: 'karla', name: 'Karla', role: 'qa', provider: 'claude', online: true },
      { id: 'beto', name: 'Beto', role: 'backend', provider: 'codex', online: true },
    )
    const t4 = b.assign({ assignee: 'dani', title: 'Front', description: '' })
    b.start('dani')
    b.deliver('dani', { report: 'listo', screenshots: [] })
    const t9 = b.toQa(t4.id, 'fede', 'revisa')
    const mine = b.assign({ assignee: 'beto', title: 'Parser', description: '' })
    const next = b.assign({ assignee: 'dani', title: 'Usa el parser', description: '', deps: [mine.id] })
    return { b, t4, t9, mine, next }
  }

  it('su QA a medias se cancela y la entrega vuelve a esperar QA; lo suyo queda para reasignar', () => {
    const { b, t4, t9, mine } = team()
    b.dismiss('fede')
    const left = b.leftBehind('fede')
    expect(left.reviews.map((r) => r.id)).toEqual([t9.id])
    expect(b.task(t9.id).status).toBe('discarded')
    expect(b.task(t4.id).status).toBe('delivered')
    // Ya se puede mandar a otro QA.
    expect(b.toQa(t4.id, 'karla', 'revisa tú').assignee).toBe('karla')
    b.dismiss('beto')
    expect(b.leftBehind('beto').open.map((t) => t.id)).toEqual([mine.id])
    expect(b.reassign(mine.id, 'dani').assignee).toBe('dani')
  })

  it('cancelar libera a quien esperaba; una entrega no se cancela', () => {
    const { b, t4, mine, next } = team()
    expect(b.task(next.id).status).toBe('waiting')
    const released = b.cancel(mine.id, 'ya lo hace otro')
    expect(b.task(mine.id).status).toBe('discarded')
    expect(released.map((t) => t.id)).toEqual([next.id])
    expect(b.task(next.id).deps).toEqual([])
    expect(() => b.cancel(t4.id, '')).toThrow(/solo se cancela una tarea que aún no se entrega/)
  })
})
