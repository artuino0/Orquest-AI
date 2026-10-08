import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Board } from '../src/core/board.js'
import { commitDelivery, createOffice, deliveryDiff, headOf, nothingToMerge } from '../src/core/worktree.js'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'orquest-entrega-'))
  dirs.push(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd }).toString().trim()
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 't@t')
  git(repo, 'config', 'user.name', 't')
  writeFileSync(join(repo, 'README.md'), '# tienda\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'inicio')
  return { repo, git }
}

describe('qué trae una entrega', () => {
  it('lo que el empleado trajo de la principal no cuenta como suyo', async () => {
    const { repo, git } = makeRepo()
    const office = await createOffice(repo, 'ines-qa')
    // Mientras tanto, la principal avanza (la tarea de otro se integró)…
    writeFileSync(join(repo, 'api.ts'), 'export const api = 1\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'T1: API')
    // …e Inés la trae a su oficina para probarla, sin tocar nada.
    git(office.path, '-c', 'user.name=t', '-c', 'user.email=t@t', 'merge', '-q', 'main')

    const main = await headOf(repo)
    const prueba = await commitDelivery(office, 'T7: prueba de humo', main)
    expect(prueba.diffStat).toBe('')
    expect(await deliveryDiff(office, prueba.commit, main)).toBe('')
    expect(await nothingToMerge(repo, prueba.commit)).toBe(true)
    // Medido contra su punto de partida (como antes) salía la API de otro como si fuera suya.
    expect((await commitDelivery(office, 'T7: prueba de humo')).diffStat).toContain('api.ts')

    // Si de verdad cambia algo, eso sí es su entrega, y solo eso.
    writeFileSync(join(office.path, 'prueba.md'), 'pasa\n')
    const real = await commitDelivery(office, 'T8: reporte', main)
    expect(real.diffStat).toContain('prueba.md')
    expect(real.diffStat).not.toContain('api.ts')
    expect(await nothingToMerge(repo, real.commit)).toBe(false)
  })
})

describe('aprobar una entrega sin cambios', () => {
  it('se cierra sin pasar por la bandeja y libera a quien esperaba', () => {
    const b = new Board()
    b.staff.push({ id: 'ines', name: 'Inés', role: 'qa', provider: 'claude', online: true }, { id: 'hugo', name: 'Hugo', role: 'backend', provider: 'claude', online: true })
    const prueba = b.assign({ assignee: 'ines', title: 'Prueba de humo', description: '' })
    const sigue = b.assign({ assignee: 'hugo', title: 'Siguiente', description: '', deps: [prueba.id] })
    expect(sigue.status).toBe('waiting')
    b.start('ines')
    b.deliver('ines', { at: 1, report: 'Todo pasa', screenshots: [] })
    b.review(prueba.id, 'approve')
    const released = b.closeEmpty(prueba.id)
    expect(b.task(prueba.id).status).toBe('done')
    expect(released.map((t) => t.id)).toEqual([sigue.id])
    expect(b.task(sigue.id).status).toBe('ready')
    // Solo vale para lo que el jefe ya aprobó.
    expect(() => b.closeEmpty(sigue.id)).toThrow(/no está aprobada/)
  })
})
