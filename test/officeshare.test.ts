import { describe, expect, it } from 'vitest'
import { castFor, OfficeShare } from '../src/core/officeshare.js'

describe('la oficina de píxel para el celular', () => {
  it('reparte personajes como el escritorio: el jefe el 3; nombre de mujer, de mujer; sin repetir', () => {
    const cast = castFor(['jefe', 'lupita', 'beto', 'carla', 'nico'], { jefe: 'Jefe', lupita: 'Lupita', beto: 'Beto', carla: 'Carla', nico: 'Nico' })
    expect(cast.jefe).toBe('CHAR3')
    expect(['CHAR2', 'CHAR4', 'CHAR5']).toContain(cast.lupita)
    expect(['CHAR2', 'CHAR4', 'CHAR5']).toContain(cast.carla)
    expect(['CHAR1', 'CHAR7', 'CHAR8', 'CHAR6']).toContain(cast.beto)
    expect(new Set(Object.values(cast)).size).toBe(5)
  })

  it('da lo que dibujó el escritorio y lo que pasó desde la última vez; sin él, lo arma', () => {
    const share = new OfficeShare()
    const input = () => ({ employees: [{ id: 'jefe', state: 'working' as const, role: 'jefe', provider: 'claude' as const }], names: { jefe: 'Don Ramón' }, tasks: [], hints: {} })
    const built = share.get('C:/p', 0, input)
    expect(built.estado).toMatchObject({ people: [expect.objectContaining({ id: 'jefe', name: 'Don Ramón' })], sprites: { jefe: 'CHAR3' } })
    share.setState('C:/p', { type: 'estado', people: [], sprites: { jefe: 'CHAR6' } })
    share.addEvent('C:/p', { agent: 'jefe', type: 'asignada' })
    const first = share.get('C:/p', 0, input)
    expect(first.estado.sprites).toEqual({ jefe: 'CHAR6' })
    expect(first.eventos).toHaveLength(1)
    expect(share.get('C:/p', first.ultimo, input).eventos).toEqual([])
  })
})
