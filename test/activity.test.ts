import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { describeActivity } from '../src/core/activity.js'
import { listDocuments, readDocument } from '../src/core/documents.js'

describe('qué está haciendo una CLI, leído de su pantalla', () => {
  it('reconoce el último paso que anuncia', () => {
    expect(describeActivity('● Read(src/api.ts)\n  ⎿ 120 lines\n✻ Cogitating… (12s · ↓ 1.2k tokens)')).toEqual({ label: 'Leyendo', detail: 'src/api.ts', seconds: 12 })
    expect(describeActivity('● Read(a.ts)\n● Bash(npm test)\n✶ Baking… (1m 5s · esc to interrupt)')).toEqual({ label: 'Ejecutando', detail: 'npm test', seconds: 65 })
    expect(describeActivity('● Update(src/form.vue)\n· Moseying… (3s)').label).toBe('Escribiendo')
    expect(describeActivity('● Calling orquest…\n✻ Bootstrapping… (2s)')).toEqual({ label: 'Usando el tablero', seconds: 2 })
    expect(describeActivity('● Update Todos\n  ⎿ ☐ Migrar\n✻ Planning… (4s)').label).toBe('Planeando')
    expect(describeActivity('• Ran git status\n  Working (8s • esc to interrupt)')).toEqual({ label: 'Ejecutando', detail: 'git status', seconds: 8 })
  })

  it('sin paso anunciado, dice si piensa, redacta o solo trabaja', () => {
    expect(describeActivity('✻ Cogitating… (5s · ↓ 138 tokens · thinking)')).toEqual({ label: 'Pensando', seconds: 5 })
    expect(describeActivity('● Leí el proyecto. Propongo tres puestos\n✻ Composing… (9s)').label).toBe('Redactando')
    expect(describeActivity('algo que no se reconoce')).toEqual({ label: 'Trabajando' })
    expect(describeActivity('')).toEqual({ label: 'Trabajando' })
  })

  it('recorta lo que es muy largo', () => {
    const a = describeActivity(`● Bash(${'x'.repeat(200)})\n✻ Working… (1s)`)
    expect(a.detail!.length).toBeLessThanOrEqual(48)
  })
})

const dirs: string[] = []
// En Windows git puede tardar en soltar la carpeta: se reintenta en vez de tumbar la prueba.
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })))

describe('documentos del proyecto', () => {
  it('lista planes y notas, lo nuevo marcado, y no deja salir del repo', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'orquest-docs-'))
    dirs.push(repo)
    const git = (...a: string[]) => execFileSync('git', a, { cwd: repo })
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 't@t')
    git('config', 'user.name', 't')
    writeFileSync(join(repo, 'README.md'), '# tienda\n')
    writeFileSync(join(repo, 'index.ts'), 'export {}\n')
    git('add', '.')
    git('commit', '-qm', 'inicio')
    mkdirSync(join(repo, 'docs'))
    writeFileSync(join(repo, 'docs', 'plan de fase 1.md'), '# Plan\n1. Catálogo\n')
    writeFileSync(join(repo, 'README.md'), '# tienda\ncambio\n')
    mkdirSync(join(repo, 'node_modules', 'x'), { recursive: true })
    writeFileSync(join(repo, 'node_modules', 'x', 'README.md'), 'no cuenta')

    const docs = await listDocuments(repo)
    expect(docs.map((d) => [d.path, d.status]).sort()).toEqual([['README.md', 'cambiado'], ['docs/plan de fase 1.md', 'nuevo']])
    expect(await readDocument(repo, 'docs/plan de fase 1.md')).toContain('Catálogo')
    await expect(readDocument(repo, '../fuera.md')).rejects.toThrow(/dentro del proyecto/)
    await expect(readDocument(repo, 'index.ts')).rejects.toThrow(/documentos de texto/)
    await expect(readDocument(repo, 'docs/no-existe.md')).rejects.toThrow(/Ya no existe/)
  })
})
