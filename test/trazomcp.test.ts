import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { limitFor, readSkill, TrazoMcp, type TrazoRequest } from '../src/core/trazomcp.js'
import { localOrigin } from '../src/core/mcp.js'

async function skills() {
  const dir = await mkdtemp(join(tmpdir(), 'orquest-skills-'))
  await mkdir(join(dir, 'diseno-trazo', 'reference'), { recursive: true })
  await mkdir(join(dir, 'vacia'))
  await writeFile(join(dir, 'diseno-trazo', 'SKILL.md'), '# Diseño en Trazo')
  await writeFile(join(dir, 'diseno-trazo', 'reference', 'tokens.json'), '{}')
  await writeFile(join(dir, '..', 'fuera.txt'), 'no').catch(() => {})
  return dir
}

const rpc = (id: number | undefined, method: string, params: Record<string, unknown> = {}) => ({ jsonrpc: '2.0', ...(id !== undefined && { id }), method, params })

describe('MCP «trazo» del diseñador', () => {
  it('initialize abre sesión con el nombre y las instrucciones de Trazo', async () => {
    const changes: number[] = []
    const t = new TrazoMcp({ forward: async () => ({ result: {} }), onSessions: (s) => changes.push(s.length) })
    const { reply, session } = await t.handle(rpc(1, 'initialize', { protocolVersion: '2025-03-26', clientInfo: { name: 'claude-code', version: '2.1' } }), undefined, 'dalia-diseno', '/p')
    const r = reply as { result: { serverInfo: unknown; protocolVersion: string; instructions: string } }
    expect(r.result.serverInfo).toEqual({ name: 'trazo', title: 'Trazo', version: '0.0.0' })
    expect(r.result.protocolVersion).toBe('2025-03-26')
    expect(r.result.instructions).toContain('get_context')
    expect(session).toMatch(/^[0-9a-f]{32}$/)
    expect(t.list()[0]).toMatchObject({ client: 'claude-code', run: 'dalia-diseno' })
    t.end(session!)
    expect(t.list()).toEqual([])
    expect(changes).toEqual([1, 0])
  })

  it('las notificaciones no se contestan y lo desconocido es error', async () => {
    const t = new TrazoMcp({ forward: async () => ({ result: {} }) })
    expect((await t.handle(rpc(undefined, 'notifications/initialized'), undefined, 'd', '/p')).reply).toBeNull()
    expect(await t.handle(rpc(2, 'ping'), undefined, 'd', '/p')).toEqual({ reply: { jsonrpc: '2.0', id: 2, result: {} }, session: undefined })
    expect(((await t.handle(rpc(3, 'prompts/list'), undefined, 'd', '/p')).reply as { result: unknown }).result).toEqual({ prompts: [] })
    expect(((await t.handle(rpc(4, 'otra/cosa'), undefined, 'd', '/p')).reply as { error: { code: number } }).error.code).toBe(-32601)
  })

  it('lo del documento se le pasa al editor, con quién llama y de qué proyecto', async () => {
    const seen: TrazoRequest[] = []
    const t = new TrazoMcp({
      forward: async (req) => {
        seen.push(req)
        return req.method === 'tools/call' ? { error: { code: -32602, message: 'mal' } } : { result: { tools: [{ name: 'get_context' }] } }
      },
    })
    const { session } = await t.handle(rpc(1, 'initialize', { clientInfo: { name: 'codex' } }), undefined, 'dalia-diseno', '/p')
    const list = await t.handle(rpc(2, 'tools/list'), session, 'dalia-diseno', '/p')
    expect(list.reply).toEqual({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'get_context' }] } })
    const call = await t.handle([rpc(3, 'tools/call', { name: 'apply_operations' }), rpc(undefined, 'notifications/cancelled')], session, 'dalia-diseno', '/p')
    expect(call.reply).toEqual([{ jsonrpc: '2.0', id: 3, error: { code: -32602, message: 'mal' } }])
    expect(seen.map((r) => [r.method, r.client, r.run, r.project])).toEqual([
      ['tools/list', 'codex', 'dalia-diseno', '/p'],
      ['tools/call', 'codex', 'dalia-diseno', '/p'],
    ])
  })

  it('si no hay editor, el agente recibe el motivo', async () => {
    const t = new TrazoMcp({ forward: async () => Promise.reject(new Error('El editor de Trazo no está abierto')) })
    const r = (await t.handle(rpc(1, 'tools/list'), undefined, 'd', '/p')).reply as { error: { message: string } }
    expect(r.error.message).toContain('no está abierto')
  })

  it('las skills se sirven de su carpeta, sin salirse de ella', async () => {
    const dir = await skills()
    const t = new TrazoMcp({ skills: () => dir, forward: async () => ({ result: { resources: [{ uri: 'trazo://docs/contrato.md' }] } }) })
    const list = (await t.handle(rpc(1, 'resources/list'), undefined, 'd', '/p')).reply as { result: { resources: { uri: string }[] } }
    expect(list.result.resources.map((r) => r.uri)).toEqual(['trazo://docs/contrato.md', 'trazo://skills/diseno-trazo/SKILL.md'])
    const read = (await t.handle(rpc(2, 'resources/read', { uri: 'trazo://skills/diseno-trazo/reference/tokens.json' }), undefined, 'd', '/p')).reply as { result: { contents: { mimeType: string }[] } }
    expect(read.result.contents[0].mimeType).toBe('application/json')
    await expect(readSkill(dir, 'trazo://skills/../fuera.txt')).rejects.toThrow(/no permitida/)
    await expect(readSkill(dir, 'trazo://skills//etc/passwd')).rejects.toThrow(/no permitida/)
    const missing = (await t.handle(rpc(3, 'resources/read', { uri: 'trazo://skills/nada/SKILL.md' }), undefined, 'd', '/p')).reply as { error: { code: number } }
    expect(missing.error.code).toBe(-32002)
  })

  it('tiempos: un permiso espera al usuario, helpers_status a su equipo', () => {
    expect(limitFor({ name: 'apply_operations' })).toBe(180_000)
    expect(limitFor({ name: 'helpers_status' })).toBe(660_000)
    expect(limitFor({ name: 'permission_prompt' })).toBe(3_600_000)
  })

  it('solo orígenes de esta máquina', () => {
    expect(localOrigin(undefined)).toBe(true)
    expect(localOrigin('http://localhost:5173')).toBe(true)
    expect(localOrigin('http://127.0.0.1')).toBe(true)
    expect(localOrigin('https://malo.com')).toBe(false)
    expect(localOrigin('http://127.0.0.1.malo.com')).toBe(false)
  })
})
