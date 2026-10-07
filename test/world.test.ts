import { describe, expect, it } from 'vitest'
import {
  assignDesks,
  deskAt,
  departmentFor,
  getRoom,
  MAP_H,
  MAP_W,
  ROOMS,
  route,
  roomAt,
  type Point,
} from '../src/renderer/src/world/layout'
import { Actor, entrance } from '../src/renderer/src/world/behavior'

const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < MAP_W && p.y < MAP_H

describe('plano', () => {
  it('los cuartos no se enciman y caben en el mapa', () => {
    for (const a of ROOMS) {
      expect(inside({ x: a.x, y: a.y }) && inside({ x: a.x + a.w - 1, y: a.y + a.h - 1 })).toBe(true)
      for (const b of ROOMS) {
        if (a === b) continue
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlap, `${a.id} y ${b.id}`).toBe(false)
      }
    }
  })

  it('cada puerta da a un pasillo, fuera de todo cuarto', () => {
    for (const r of ROOMS) {
      expect(roomAt(r.door)?.id).toBe(r.id)
      expect(roomAt({ x: r.door.x, y: r.corridorY })).toBeUndefined()
    }
  })

  it('el puesto decide el departamento', () => {
    expect(departmentFor('QA')).toBe('qa')
    expect(departmentFor('diseño')).toBe('desarrollo')
  })

  it('los escritorios quedan dentro del cuarto, sin muros ni la puerta', () => {
    for (const r of ROOMS.filter((x) => x.kind === 'department')) {
      for (let i = 0; i < 8; i++) {
        const { desk, seat } = deskAt(r, i)
        for (const p of [desk, seat]) {
          expect(p.x).toBeGreaterThan(r.x)
          expect(p.x).toBeLessThan(r.x + r.w - 1)
          expect(p.y).toBeGreaterThan(r.y)
          expect(p.y).toBeLessThan(r.y + r.h - 1)
          expect(p.x).not.toBe(r.door.x)
        }
      }
    }
  })

  it('nadie cambia de escritorio cuando entra o sale alguien', () => {
    const first = assignDesks([
      { id: 'a', role: 'backend' },
      { id: 'b', role: 'backend' },
      { id: 'c', role: 'qa' },
    ])
    const prev = new Map([...first].map(([id, d]) => [id, d.index]))
    const second = assignDesks(
      [
        { id: 'd', role: 'backend' },
        { id: 'b', role: 'backend' },
        { id: 'c', role: 'qa' },
      ],
      prev,
    )
    expect(second.get('b')!.index).toBe(first.get('b')!.index)
    expect(second.get('c')!.room.id).toBe('qa')
    expect(second.get('d')!.index).toBe(first.get('a')!.index)
  })
})

describe('rutas', () => {
  it('va de Recepción a QA cruzando por puertas y pasillos', () => {
    const to = deskAt(getRoom('qa'), 0).seat
    const pts = route(entrance(), to)
    expect(pts[0]).toEqual(entrance())
    expect(pts.at(-1)).toEqual(to)
    // Solo se mueve en horizontal o vertical.
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y).toBe(true)
    }
    expect(pts).toContainEqual(getRoom('recepcion').door)
    expect(pts).toContainEqual(getRoom('qa').door)
  })

  it('nunca cruza un cuarto que no es origen ni destino', () => {
    const from = deskAt(getRoom('desarrollo'), 5).seat
    const to = deskAt(getRoom('frontend'), 2).seat
    const pts = route(from, to)
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      const n = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
      for (let k = 0; k <= n; k++) {
        const p = { x: a.x + Math.sign(b.x - a.x) * k, y: a.y + Math.sign(b.y - a.y) * k }
        const r = roomAt(p)
        if (r) expect(['desarrollo', 'frontend']).toContain(r.id)
      }
    }
  })
})

describe('Actor', () => {
  it('entra por Recepción, camina a su escritorio y ahí trabaja', () => {
    const desk = deskAt(getRoom('backend'), 1)
    const a = new Actor('x', { desk })
    expect(a.pos).toEqual(entrance())
    expect(a.pose).toBe('walk')
    for (let i = 0; i < 200; i++) a.update(0.1)
    expect(a.pos).toEqual(desk.seat)
    a.setState('working')
    expect(a.pose).toBe('type')
    expect(a.look.monitor).toBe('blink')
  })

  it('bloqueado muestra alerta; al irse camina a la salida y desaparece', () => {
    const a = new Actor('x', { desk: deskAt(getRoom('qa'), 0) })
    for (let i = 0; i < 200; i++) a.update(0.1)
    a.setState('blocked')
    expect(a.look.bubble).toBe('alert')
    a.setState('exited')
    expect(a.gone).toBe(false)
    for (let i = 0; i < 200; i++) a.update(0.1)
    expect(a.gone).toBe(true)
  })

  it('esperando dependencia camina al escritorio de quien bloquea', () => {
    const dep = deskAt(getRoom('backend'), 0)
    const a = new Actor('x', { desk: deskAt(getRoom('frontend'), 0) })
    a.setState('waiting', { dependencyDesk: dep })
    for (let i = 0; i < 200; i++) a.update(0.1)
    expect(a.pos).toEqual({ x: dep.seat.x + 1, y: dep.seat.y })
    expect(a.look.bubble).toBe('clock')
  })
})
