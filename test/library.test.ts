import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultManual, Library } from '../src/core/library.js'
import { claudePermissions, PROVIDERS } from '../src/core/providers.js'
import { StudioStore } from '../src/core/store.js'

describe('expedientes', () => {
  it('Antigravity viene permitido solo en QA, como dice el plan', () => {
    const lib = new Library()
    expect(lib.check('antigravity', undefined, 'qa')).toEqual({ ok: true })
    const no = lib.check('antigravity', undefined, 'backend')
    expect(no.ok).toBe(false)
    expect(!no.ok && no.reason).toContain('solo permite qa; no backend')
    expect(!no.ok && no.reason).toContain('malo escribiendo código')
    expect(lib.check('claude', 'opus', 'backend')).toEqual({ ok: true })
  })

  it('en modo aviso deja pasar con advertencia; el expediente del modelo gana', () => {
    const lib = new Library()
    lib.saveDossier({ provider: 'codex', model: '', allowedRoles: ['backend'], enforce: 'warn', notes: '' })
    lib.saveDossier({ provider: 'codex', model: 'gpt-5-mini', allowedRoles: ['qa'], enforce: 'block', notes: 'solo pruebas' })
    const w = lib.check('codex', 'gpt-5', 'frontend')
    expect(w.ok && w.warning).toContain('solo permite backend')
    expect(lib.check('codex', 'gpt-5-mini', 'backend').ok).toBe(false)
    expect(lib.check('codex', 'gpt-5-mini', 'qa').ok).toBe(true)
  })

  it('el historial cuenta integradas a la primera, rechazos y por puesto', () => {
    const lib = new Library()
    const base = { provider: 'claude' as const, model: 'sonnet', project: '/p' }
    lib.record({ ...base, role: 'backend', taskId: 'T1', outcome: 'delivered' })
    lib.record({ ...base, role: 'backend', taskId: 'T1', outcome: 'merged', firstTry: true })
    lib.record({ ...base, role: 'frontend', taskId: 'T2', outcome: 'qa_fail' })
    lib.record({ ...base, role: 'frontend', taskId: 'T2', outcome: 'merged', firstTry: false })
    lib.record({ ...base, model: 'haiku', role: 'qa', taskId: 'T3', outcome: 'returned' })
    const s = lib.stats('claude', 'sonnet')
    expect(s).toMatchObject({ entregas: 1, integradas: 2, a_la_primera: 1, rechazos_qa: 1, aprobadas_a_la_primera: 50 })
    expect(s.por_puesto.backend).toEqual({ integradas: 1, a_la_primera: 1 })
    expect(lib.stats('claude').regresadas).toBe(1)
    expect(lib.models('claude').sort()).toEqual(['haiku', 'sonnet'])
  })
})

describe('manuales', () => {
  it('cada puesto tiene manual por defecto y se puede reescribir', () => {
    const lib = new Library()
    expect(lib.manual('qa').delivery).toContain('Veredicto')
    expect(lib.manual('desconocido').role).toBe('desarrollo')
    lib.saveManual({ ...defaultManual('frontend'), docs: [' docs/ui.md ', ''], requireScreenshots: true })
    expect(lib.manual('frontend')).toMatchObject({ docs: ['docs/ui.md'], requireScreenshots: true })
  })

  it('los permisos llegan a Claude como reglas de settings y a Codex como sandbox', () => {
    const p = { edit: false, allow: ['npm test'], deny: ['git push', 'git reset --hard'] }
    expect(claudePermissions(p)).toEqual({
      allow: ['mcp__orquest', 'Bash(npm test:*)'],
      deny: ['Edit', 'Write', 'NotebookEdit', 'Bash(git push:*)', 'Bash(git reset --hard:*)'],
    })
    const args = PROVIDERS.claude.mcpArgs!({ url: 'http://x', permissions: p })
    expect(JSON.parse(args[args.indexOf('--settings') + 1]).permissions.deny).toContain('Bash(git reset --hard:*)')
    expect(PROVIDERS.codex.mcpArgs!({ url: 'http://x', permissions: p })).toEqual(expect.arrayContaining(['-s', 'read-only']))
    expect(PROVIDERS.codex.permissionGaps!(p)[0]).toContain('no aplica listas de comandos')
  })
})

describe('persistencia de la biblioteca', () => {
  it('expedientes, manuales e historial sobreviven en SQLite y lo que quita el usuario no vuelve', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'orquest-lib-')), 'studio.db')
    const a = new Library(new StudioStore(path))
    a.saveDossier({ provider: 'antigravity', model: '', allowedRoles: null, enforce: 'warn', notes: 'ahora sí programa' })
    a.saveManual({ ...defaultManual('qa'), permissions: { edit: false, allow: [], deny: ['git push'] } })
    a.record({ provider: 'codex', model: '', role: 'backend', project: '/p', taskId: 'T1', outcome: 'merged', firstTry: true })

    const b = new Library(new StudioStore(path))
    expect(b.check('antigravity', undefined, 'backend')).toEqual({ ok: true })
    expect(b.dossier('antigravity').notes).toBe('ahora sí programa')
    expect(b.manual('qa').permissions.edit).toBe(false)
    expect(b.stats('codex')).toMatchObject({ integradas: 1, a_la_primera: 1, aprobadas_a_la_primera: 100 })
  })
})
