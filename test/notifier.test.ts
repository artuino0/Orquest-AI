import { describe, expect, it } from 'vitest'
import { alertsBetween, BLOCKED_HOLD_MS, sendExpo, type ProjectView } from '../src/core/notifier.js'

const base = (): ProjectView => ({
  root: 'C:/p/tienda',
  project: 'tienda',
  tasks: [{ id: 'T1', status: 'in_progress', title: 'API del carrito', assignee: 'lupita' }],
  questions: [],
  reviews: [],
  employees: [
    { id: 'jefe', state: 'idle' },
    { id: 'lupita', state: 'working' },
  ],
  names: { jefe: 'Don Ramón', lupita: 'Lupita' },
})

describe('qué se le avisa al celular', () => {
  it('lo que necesita al usuario, sin detalle de fábrica; con detalle si lo pide', () => {
    const before = base()
    const after = base()
    after.tasks[0].status = 'approved'
    after.questions.push({ id: 'P1', status: 'open', text: '¿Qué base de datos?' })
    after.reviews.push({ employeeId: 'lupita', status: 'ready' })
    const plain = alertsBetween(before, after)
    expect(plain.map((a) => [a.key, a.title, a.body])).toEqual([
      ['inbox:T1', 'Entrega lista para integrar', 'T1 de Lupita · tienda'],
      ['question:P1', 'Don Ramón te pregunta algo', 'tienda'],
      ['review:lupita', 'La versión de Lupita está lista para verla', 'tienda'],
    ])
    // De fábrica no sale el contenido del proyecto (título de la tarea, la pregunta).
    expect(JSON.stringify(plain)).not.toMatch(/carrito|base de datos/)
    const full = alertsBetween(before, after, true)
    expect(full[0].body).toBe('T1 de Lupita: API del carrito')
    expect(full[1].body).toBe('¿Qué base de datos?')
    expect(full[0].to).toEqual({ root: 'C:/p/tienda', screen: 'inbox', id: 'T1' })
  })

  it('alguien detenido espera un momento (el jefe pudo autorizarlo); no poder trabajar avisa una vez', () => {
    const before = base()
    const after = base()
    after.employees[1] = { id: 'lupita', state: 'blocked' }
    expect(alertsBetween(before, after)).toEqual([expect.objectContaining({ key: 'blocked:lupita', title: 'Lupita te necesita', hold: BLOCKED_HOLD_MS })])
    const failing = base()
    failing.employees[1] = { id: 'lupita', state: 'idle', problem: 'You’ve hit your usage limit.' }
    expect(alertsBetween(before, failing).map((a) => a.title)).toEqual(['Lupita no puede trabajar'])
    expect(alertsBetween(failing, failing)).toEqual([])
  })

  it('al abrir un proyecto no se avisa de lo que ya estaba', () => {
    const now = base()
    now.questions.push({ id: 'P1', status: 'open', text: 'x' })
    expect(alertsBetween(undefined, now)).toEqual([])
    expect(alertsBetween(now, now)).toEqual([])
  })
})

describe('mandar por Expo', () => {
  it('un mensaje por aviso y celular; los celulares que ya no existen se devuelven', async () => {
    const sent: unknown[] = []
    const post = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      sent.push(...body)
      return new Response(JSON.stringify({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] }), { status: 200 })
    }) as typeof fetch
    const alerts = alertsBetween(base(), { ...base(), questions: [{ id: 'P1', status: 'open', text: 'x' }] })
    const r = await sendExpo(['ExponentPushToken[a]', 'ExponentPushToken[b]'], alerts, post)
    expect(sent).toEqual([
      expect.objectContaining({ to: 'ExponentPushToken[a]', title: 'Don Ramón te pregunta algo', data: { root: 'C:/p/tienda', screen: 'question', id: 'P1' } }),
      expect.objectContaining({ to: 'ExponentPushToken[b]' }),
    ])
    expect(r).toEqual({ gone: ['ExponentPushToken[b]'] })
  })

  it('sin red no truena', async () => {
    const post = (async () => {
      throw new Error('sin red')
    }) as typeof fetch
    const alerts = alertsBetween(base(), { ...base(), questions: [{ id: 'P1', status: 'open', text: 'x' }] })
    expect(await sendExpo(['ExponentPushToken[a]'], alerts, post)).toEqual({ gone: [], error: 'sin red' })
  })
})
