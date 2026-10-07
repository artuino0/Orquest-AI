import { describe, expect, it } from 'vitest'
import { Board, RuleError } from '../src/core/board.js'

function team() {
  const b = new Board()
  const all = () => true
  b.propose(
    [
      { role: 'backend', provider: 'claude' },
      { role: 'frontend', provider: 'codex' },
      { role: 'qa', provider: 'claude' },
    ],
    all,
  )
  const slots = b.approve(b.slots.map((s) => ({ id: s.id, role: s.role, provider: s.provider })))
  for (const s of slots) b.hired(b.takeSlot(s.id), { id: s.role, role: s.role, provider: s.provider })
  return b
}

describe('plantilla', () => {
  it('no deja proponer un proveedor sin instalar o sin sesión', () => {
    const b = new Board()
    expect(() => b.propose([{ role: 'backend', provider: 'grok' }], (p) => p !== 'grok')).toThrow(/grok no está instalado/)
  })

  it('no levanta a nadie sin la aprobación del usuario', () => {
    const b = new Board()
    b.propose([{ role: 'backend', provider: 'claude' }], () => true)
    expect(() => b.takeSlot('backend')).toThrow(/espera la aprobación del usuario/)
    b.approve([{ id: b.slots[0].id, role: 'backend', provider: 'codex', model: 'gpt-5' }])
    expect(b.takeSlot('backend')).toMatchObject({ provider: 'codex', model: 'gpt-5', status: 'approved' })
  })

  it('una nueva propuesta reemplaza solo lo pendiente', () => {
    const b = team()
    b.propose([{ role: 'dba', provider: 'claude' }], () => true)
    b.propose([{ role: 'infra', provider: 'claude' }], () => true)
    expect(b.slots.filter((s) => s.status === 'proposed').map((s) => s.role)).toEqual(['infra'])
    expect(b.slots.filter((s) => s.status === 'hired')).toHaveLength(3)
  })
})

describe('tareas y dependencias', () => {
  it('una tarea con dependencias abiertas no arranca y se libera al integrar', () => {
    const b = team()
    const api = b.assign({ assignee: 'backend', title: 'API', description: '' })
    const ui = b.assign({ assignee: 'frontend', title: 'UI', description: '', deps: [api.id] })
    expect(api.status).toBe('ready')
    expect(ui.status).toBe('waiting')
    expect(b.hint('frontend')).toEqual({ state: 'waiting', blockedBy: 'backend' })
    expect(() => b.deliver('frontend', { report: 'x', screenshots: [] })).toThrow(/sigue esperando a T1/)

    b.start('backend')
    b.deliver('backend', { report: 'listo', screenshots: [] })
    expect(b.hint('backend')).toEqual({ state: 'delivering' })
    b.review(api.id, 'approve')
    expect(b.inbox().map((t) => t.id)).toEqual([api.id])
    expect(b.merged(api.id).map((t) => t.id)).toEqual([ui.id])
    expect(ui.status).toBe('ready')
  })

  it('rechaza dependencias circulares con el ciclo', () => {
    const b = team()
    const a = b.assign({ assignee: 'backend', title: 'A', description: '' })
    const c = b.assign({ assignee: 'frontend', title: 'B', description: '', deps: [a.id] })
    expect(() => b.setDeps(a.id, [c.id])).toThrow('Dependencia circular: T1 → T2 → T1.')
    expect(() => b.setDeps(a.id, [a.id])).toThrow(/circular/)
  })

  it('rechaza empleados y dependencias que no existen', () => {
    const b = team()
    expect(() => b.assign({ assignee: 'nadie', title: 'x', description: '' })).toThrow(RuleError)
    expect(() => b.assign({ assignee: 'backend', title: 'x', description: '', deps: ['T99'] })).toThrow(/T99/)
  })
})

describe('QA', () => {
  it('si QA rechaza, la tarea regresa al mismo empleado con el reporte', () => {
    const b = team()
    const t = b.assign({ assignee: 'backend', title: 'API', description: '' })
    b.start('backend')
    b.deliver('backend', { report: 'v1', screenshots: [] })
    const review = b.toQa(t.id, 'qa', 'prueba el login')
    expect(t.status).toBe('in_qa')
    b.start('qa')
    expect(() => b.deliver('qa', { report: 'falla', screenshots: [] })).toThrow(/veredicto/)
    b.deliver('qa', { report: 'el login falla con 500', screenshots: [], verdict: 'fail' })
    expect(review.status).toBe('done')
    expect(t).toMatchObject({ status: 'in_progress', assignee: 'backend', returns: 1 })
    expect(t.qa?.report).toContain('500')
    expect(b.current('backend')?.id).toBe(t.id)
  })

  it('QA debe ser de QA y nadie revisa lo suyo', () => {
    const b = team()
    const t = b.assign({ assignee: 'backend', title: 'API', description: '' })
    b.start('backend')
    b.deliver('backend', { report: 'v1', screenshots: [] })
    expect(() => b.toQa(t.id, 'frontend', '')).toThrow(/no de QA/)
  })

  it('si QA aprueba, vuelve con el jefe', () => {
    const b = team()
    const t = b.assign({ assignee: 'backend', title: 'API', description: '' })
    b.start('backend')
    b.deliver('backend', { report: 'v1', screenshots: [] })
    b.toQa(t.id, 'qa', '')
    b.start('qa')
    b.deliver('qa', { report: 'ok', screenshots: [], verdict: 'pass' })
    expect(t.status).toBe('delivered')
    expect(b.review(t.id, 'approve').status).toBe('approved')
  })
})

describe('persistencia', () => {
  it('al restaurar conserva el tablero y nadie sigue en la oficina', () => {
    const b = team()
    b.assign({ assignee: 'backend', title: 'API', description: '' })
    const r = Board.restore(b.snapshot())
    expect(r.tasks).toHaveLength(1)
    expect(r.staff.every((m) => !m.online)).toBe(true)
    // Y numera sin repetir.
    r.propose([{ role: 'dba', provider: 'claude' }], () => true)
    expect(r.slots.at(-1)!.id).toBe('S4')
  })
})
