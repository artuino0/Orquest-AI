import { describe, expect, it } from 'vitest'
import type { Task } from '../src/core/board.js'
import { officeEvents, officeState } from '../src/core/officefeed.js'

const task = (over: Partial<Task>): Task => ({
  id: 'T-1', kind: 'work', title: 'API de productos', description: '', assignee: 'e1', deps: [], status: 'ready', returns: 0, history: [], ...over,
})
const emp = (id: string, state: 'starting' | 'working' | 'blocked' | 'idle' | 'exited') => ({ id, state, role: 'backend', provider: 'claude' as const })

describe('officeState', () => {
  it('traduce el estado de cada terminal y deja fuera a quien ya cerró', () => {
    const s = officeState({
      employees: [emp('jefe', 'idle'), emp('e1', 'working'), emp('e2', 'blocked'), emp('e3', 'exited'), emp('e4', 'starting')],
      names: { e1: 'Lupita' },
      tasks: [task({ status: 'in_progress' })],
      hints: {},
    })
    expect(s.people.map((p) => [p.id, p.status])).toEqual([['jefe', 'idle'], ['e1', 'working'], ['e2', 'blocked'], ['e4', 'idle']])
    expect(s.people[0].isBoss).toBe(true)
    expect(s.people[1]).toMatchObject({ name: 'Lupita', isBoss: false })
    expect(s.people[2].name).toBe('e2')
    expect(s.activities).toEqual({ e1: { emoji: '⌨️', text: 'API de productos', task: 'T-1' } })
  })

  it('quien entregó y espera el veredicto sale como terminado; quien descansa, como libre', () => {
    const s = officeState({
      employees: [emp('e1', 'idle'), emp('e2', 'working')],
      names: {},
      tasks: [],
      hints: { e1: { state: 'delivering' }, e2: { state: 'gaming' } },
    })
    expect(s.people.map((p) => p.status)).toEqual(['done', 'idle'])
    expect(s.activities).toEqual({})
  })
})

describe('officeEvents', () => {
  it('sin foto anterior no cuenta nada', () => {
    expect(officeEvents(null, [task({})], 1)).toEqual([])
  })

  it('avisa cuando una tarea llega a alguien: nueva o liberada de su espera', () => {
    const nueva = officeEvents([], [task({})], 5)
    expect(nueva).toEqual([{ at: 5, agent: 'e1', type: 'asignada', text: 'T-1 API de productos' }])
    expect(officeEvents([task({ status: 'waiting' })], [task({ status: 'ready' })], 5)).toHaveLength(1)
    // En espera todavía no se le lleva; y lo que ya tenía no se repite.
    expect(officeEvents([], [task({ status: 'waiting' })], 5)).toEqual([])
    expect(officeEvents([task({})], [task({ status: 'in_progress' })], 5)).toEqual([])
  })

  it('entrega, aprobación y regreso', () => {
    const entregada = task({ status: 'delivered', delivery: { at: 1, report: '\nListo el alta\ncon pruebas', screenshots: [] } })
    expect(officeEvents([task({ status: 'in_progress' })], [entregada], 9)).toEqual([{ at: 9, agent: 'e1', type: 'reporte', emoji: '📄', text: 'Listo el alta' }])
    expect(officeEvents([entregada], [task({ status: 'approved' })], 9)[0]).toMatchObject({ type: 'revision', verdict: 'aprobada', text: 'Aprobada' })
    // Integrar lo ya aprobado no vuelve a avisar.
    expect(officeEvents([task({ status: 'approved' })], [task({ status: 'merged' })], 9)).toEqual([])
    const regresada = task({ status: 'ready', returns: 1, history: [{ at: 2, text: 'Faltan pruebas del alta' }] })
    expect(officeEvents([entregada], [regresada], 9)).toEqual([{ at: 9, agent: 'e1', type: 'revision', verdict: 'rechazada', emoji: '😠', text: 'Faltan pruebas del alta' }])
  })
})
