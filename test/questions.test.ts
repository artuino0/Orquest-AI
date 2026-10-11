import { describe, expect, it } from 'vitest'
import { Board, MAX_OPEN_QUESTIONS, RuleError } from '../src/core/board.js'

/** Tablero con reloj a mano. */
const board = () => {
  let t = 1000
  return Object.assign(new Board(() => (t += 1000)), {})
}

describe('preguntas del jefe al usuario', () => {
  it('quedan pendientes, numeradas, con sus sugerencias y lo que detienen', () => {
    const b = board()
    const { asked } = b.ask([
      { text: '¿Qué pasarela de pagos usamos?', options: ['Stripe', ' Mercado  Pago ', 'Stripe'], recommended: 'stripe', blocks: 'El checkout' },
      { text: '¿Cuál es el dominio de producción?' },
    ])
    expect(asked).toMatchObject([
      { id: 'P1', text: '¿Qué pasarela de pagos usamos?', options: ['Stripe', 'Mercado Pago'], recommended: 'Stripe', blocks: 'El checkout', status: 'open', tasks: [] },
      { id: 'P2', options: [], recommended: undefined, status: 'open' },
    ])
    expect(b.openQuestions().map((q) => q.id)).toEqual(['P1', 'P2'])
  })

  it('la misma pregunta, aún pendiente, no se duplica', () => {
    const b = board()
    b.ask([{ text: '¿Qué pasarela de pagos usamos?' }])
    const again = b.ask([{ text: '¿qué pasarela  de pagos usamos?' }, { text: '¿Va con modo oscuro?' }, { text: '¿Va con modo oscuro?' }])
    expect(again.repeated.map((q) => q.id)).toEqual(['P1'])
    expect(again.asked.map((q) => q.id)).toEqual(['P2'])
    expect(b.openQuestions()).toHaveLength(2)
    // Ya contestada sí se puede volver a preguntar: es otra vuelta.
    b.answer('P1', 'Stripe')
    expect(b.ask([{ text: '¿Qué pasarela de pagos usamos?' }]).asked.map((q) => q.id)).toEqual(['P3'])
  })

  it('una pregunta mal hecha se rechaza diciendo qué le falta', () => {
    const b = board()
    expect(() => b.ask([])).toThrow(RuleError)
    expect(() => b.ask([{ text: '¿Sí?' }])).toThrow(/no se entiende sola/)
    expect(() => b.ask([{ text: '¿Qué base de datos usamos?', options: ['Postgres'] }])).toThrow(/una sola respuesta/)
    expect(() => b.ask([{ text: '¿Qué base de datos usamos?', options: ['a', 'b', 'c', 'd', 'e', 'f'] }])).toThrow(/tope es 5/)
    expect(() => b.ask([{ text: '¿Qué base de datos usamos?', options: ['Postgres', 'SQLite'], recommended: 'Mongo' }])).toThrow(/no está entre sus respuestas/)
    expect(() => b.ask([{ text: '¿Qué base de datos usamos?', tasks: ['T9'] }])).toThrow(RuleError)
    expect(b.questions).toHaveLength(0)
  })

  it('hay un tope de preguntas esperando al usuario', () => {
    const b = board()
    for (let i = 0; i < MAX_OPEN_QUESTIONS; i++) b.ask([{ text: `¿Decisión número ${i} del proyecto?` }])
    expect(() => b.ask([{ text: '¿Una más para el usuario?' }])).toThrow(/tope es 12/)
    b.withdraw('P1', 'Ya no aplica')
    expect(b.ask([{ text: '¿Una más para el usuario?' }]).asked).toHaveLength(1)
  })

  it('contestar o retirar la cierra, y una cerrada no se toca dos veces', () => {
    const b = board()
    b.ask([{ text: '¿Qué pasarela de pagos usamos?' }, { text: '¿Cuál es el dominio de producción?' }])
    expect(b.answer('p1', '  Stripe,  la de siempre ')).toMatchObject({ status: 'answered', answer: 'Stripe, la de siempre' })
    expect(() => b.answer('P1', 'otra')).toThrow(/ya estaba contestada: "Stripe, la de siempre"/)
    expect(() => b.answer('P2', '   ')).toThrow(/vacía/)
    expect(() => b.withdraw('P2', '')).toThrow(/por qué/)
    expect(b.withdraw('P2', 'Salió del README')).toMatchObject({ status: 'withdrawn', note: 'Salió del README' })
    expect(() => b.withdraw('P2', 'otra vez')).toThrow(/retirada/)
    expect(() => b.answer('P7', 'x')).toThrow(/No existe la pregunta P7. Pendientes: ninguna/)
    expect(b.openQuestions()).toHaveLength(0)
  })

  it('sobreviven a guardar y reabrir; un tablero viejo sin preguntas abre igual', () => {
    const b = board()
    b.ask([{ text: '¿Qué pasarela de pagos usamos?', options: ['Stripe', 'Conekta'] }])
    const back = Board.restore(b.snapshot())
    expect(back.openQuestions()).toMatchObject([{ id: 'P1', options: ['Stripe', 'Conekta'] }])
    expect(back.ask([{ text: '¿Cuál es el dominio de producción?' }]).asked[0].id).toBe('P2')

    const old = b.snapshot() as any
    delete old.questions
    delete old.seq.question
    const reopened = Board.restore(old)
    expect(reopened.questions).toEqual([])
    expect(reopened.ask([{ text: '¿Cuál es el dominio de producción?' }]).asked[0].id).toBe('P1')
  })
})
