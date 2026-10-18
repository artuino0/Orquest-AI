import { describe, expect, it } from 'vitest'
import { arrange, arrangeWidth, widenBoss, bounds, fitCamera, focusRects, freeSpot, GAP, initials, inView, overlaps, reveal, SIZES, startingPanels, toWorld, visibleRect, zoomAt, type Panel } from '../src/renderer/src/canvas/layout'

const panel = (id: string, x: number, y: number, w = 400, h = 300, kind: Panel['kind'] = 'employee'): Panel => ({ id, kind, x, y, w, h, z: 1 })

describe('lienzo', () => {
  it('un panel nuevo sale al lado del que lo abre, sin tapar a nadie', () => {
    const office = panel('office', 0, 0, 960, 600, 'office')
    const p = freeSpot([office], { w: 400, h: 300 }, office)
    expect(p).toEqual({ x: 960 + GAP, y: 0 })
    // Si a la derecha ya hay alguien, busca el hueco más cercano.
    const right = panel('a', 960 + GAP, 0, 400, 600)
    const q = freeSpot([office, right], { w: 400, h: 300 }, office)
    expect([office, right].some((r) => overlaps({ ...q, w: 400, h: 300 }, r))).toBe(false)
  })

  it('aunque el plano esté lleno alrededor, siempre encuentra lugar', () => {
    const taken: Panel[] = []
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) taken.push(panel(`${i}-${j}`, i * 420 - 2000, j * 320 - 2000))
    const p = freeSpot(taken, { w: 400, h: 300 }, undefined, { x: 0, y: 0 })
    expect(taken.some((r) => overlaps({ ...p, w: 400, h: 300 }, r))).toBe(false)
  })

  it('el zoom deja quieto lo que está bajo el cursor', () => {
    const cam = { x: 100, y: 50, zoom: 1 }
    const under = toWorld(cam, { x: 400, y: 300 })
    const z = zoomAt(cam, 1.5, { x: 400, y: 300 })
    expect(toWorld(z, { x: 400, y: 300 })).toEqual(under)
    expect(zoomAt(cam, 9, { x: 0, y: 0 }).zoom).toBe(2)
  })

  it('«Ver todo» encuadra todos los paneles', () => {
    const all = bounds([panel('a', -500, -200), panel('b', 900, 700)])!
    const cam = fitCamera(all, { w: 1400, h: 800 })
    const v = visibleRect(cam, { w: 1400, h: 800 })
    expect(v.x).toBeLessThanOrEqual(all.x)
    expect(v.y).toBeLessThanOrEqual(all.y)
    expect(v.x + v.w).toBeGreaterThanOrEqual(all.x + all.w)
    expect(v.y + v.h).toBeGreaterThanOrEqual(all.y + all.h)
  })

  it('traer un panel a la vista mueve la cámara lo justo', () => {
    const cam = { x: 0, y: 0, zoom: 1 }
    const view = { w: 1000, h: 800 }
    const far = panel('x', 1500, 100)
    expect(inView(far, cam, view)).toBe(false)
    const moved = reveal(cam, far, view)
    expect(inView(far, moved, view)).toBe(true)
    expect(moved.zoom).toBe(1)
  })

  it('«Ordenar» los pone en renglones sin encimarse', () => {
    const panels = [panel('e1', 50, 900), panel('office', 3000, 3000, 960, 600, 'office'), panel('boss', -700, 40, 416, 688, 'boss'), panel('e2', 0, 0)]
    const spots = arrange(panels, 1800)
    const placed = panels.map((p) => ({ ...p, ...spots[p.id] }))
    for (const a of placed) for (const b of placed) if (a !== b) expect(overlaps(a, b)).toBe(false)
    // La oficina va primero.
    expect(spots.office.x).toBeLessThan(spots.boss.x)
    expect(Math.max(...placed.map((p) => p.x + p.w)) - Math.min(...placed.map((p) => p.x))).toBeLessThanOrEqual(1800 + 960)
  })

  it('«Ordenar» deja el conjunto con la forma de la vista', () => {
    const panels = Array.from({ length: 8 }, (_, i) => panel(`p${i}`, i * 50, 0, 600, 400))
    const wide = arrangeWidth(panels, { w: 1600, h: 900 })
    const spots = arrange(panels, wide)
    const all = bounds(panels.map((p) => ({ ...p, ...spots[p.id] })))!
    // Ni una tira ni una torre: cerca de 16:9.
    expect(all.w / all.h).toBeGreaterThan(1)
    expect(all.w / all.h).toBeLessThan(3)
  })

  it('un jefe guardado angosto se ensancha sin encimarse con su vecino', () => {
    const boss = panel('boss', 0, 0, 480, 704, 'boss')
    const office = panel('office', 512, 0, 960, 592, 'office')
    const below = panel('e1', 0, 736)
    const [b, o, e] = widenBoss([boss, office, below])
    expect(b.w).toBe(SIZES.boss.w)
    expect(overlaps(b, o)).toBe(false)
    expect(e.x).toBe(0)
  })

  it('un proyecto nuevo arranca con el jefe y la oficina, sin encimarse', () => {
    const [boss, office] = startingPanels()
    expect(boss.kind).toBe('boss')
    expect(office.w).toBe(SIZES.office.w)
    expect(overlaps(boss, office)).toBe(false)
  })

  it('enfocar reparte la vista entre los paneles elegidos', () => {
    const cam = { x: 0, y: 0, zoom: 1 }
    const rects = focusRects([panel('a', 0, 0, 600, 400), panel('b', 0, 0, 300, 400)], cam, { w: 1216, h: 800 })
    expect(rects.a.w).toBeGreaterThan(rects.b.w)
    expect(rects.a.x + rects.a.w).toBeLessThanOrEqual(rects.b.x)
    expect(rects.b.x + rects.b.w).toBeLessThanOrEqual(1216)
  })

  it('las letras de cada proyecto', () => {
    expect(initials('orquest-web')).toBe('OW')
    expect(initials('herdr')).toBe('HE')
    expect(initials('flow_erp')).toBe('FE')
  })
})
