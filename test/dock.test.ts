import { describe, expect, it } from 'vitest'
import { dockEntry } from '../src/core/dock'

describe('dock de proyectos', () => {
  it('cuenta quién trabaja y lo que espera al usuario', () => {
    const p = dockEntry(
      'E:\\desarrollo\\tienda-en-linea',
      { tasks: [{ status: 'approved' }, { status: 'in_progress' }], questions: [{ status: 'open' }, { status: 'answered' }] },
      [{ state: 'working' }, { state: 'working' }, { state: 'blocked' }, { state: 'idle', problem: 'sin saldo' }, { state: 'idle' }],
    )
    expect(p).toEqual({ root: 'E:\\desarrollo\\tienda-en-linea', name: 'tienda-en-linea', working: 2, needs: 4 })
  })

  it('quien trabaja o ya salió no cuenta como que no puede trabajar', () => {
    const p = dockEntry('/home/a/flow-erp/', { tasks: [], questions: [] }, [
      { state: 'working', problem: 'viejo' },
      { state: 'exited', problem: 'viejo' },
    ])
    expect(p.name).toBe('flow-erp')
    expect(p.needs).toBe(0)
    expect(p.working).toBe(1)
  })
})
