import { beforeEach, describe, expect, it } from 'vitest'
import { Actor, entrance } from '../src/renderer/src/world/behavior'
import { applyTool, itemAt, toolRect } from '../src/renderer/src/world/editor'
import { assignDesks, bossQueue, plan, route, setMap, waitingSpots } from '../src/renderer/src/world/layout'
import {
  buildPlan,
  DOOR,
  emptyMap,
  exampleMap,
  floorAt,
  isOfficeMap,
  mapIssues,
  paintFloor,
  paintWall,
  placeItem,
  resizeMap,
  route as routeIn,
  wallAt,
  wallFacing,
  wallHeight,
  type OfficeMap,
  type Point,
} from '../src/renderer/src/world/map'

beforeEach(() => setMap(exampleMap()))

const walkable = (p: Point) => !!plan().walk[p.y * plan().map.w + p.x]

/** Todas las casillas por las que pasa una ruta. */
function cells(pts: Point[]): Point[] {
  const out: Point[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const n = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    for (let k = 1; k <= n; k++) out.push({ x: a.x + Math.sign(b.x - a.x) * k, y: a.y + Math.sign(b.y - a.y) * k })
  }
  return out
}

describe('oficina de ejemplo', () => {
  it('es una oficina completa y chica: no le falta nada', () => {
    expect(mapIssues(plan())).toEqual([])
    expect([plan().map.w, plan().map.h]).toEqual([22, 20])
    // Dos bloques de perfil: seis mirando a la derecha frente a seis mirando a la izquierda; el jefe mira al frente.
    expect(plan().desks.filter((d) => d.faces === 'right')).toHaveLength(6)
    expect(plan().desks.filter((d) => d.faces === 'left')).toHaveLength(6)
    for (const d of plan().desks.filter((x) => x.faces === 'right')) {
      // Cada quien tiene enfrente, del otro lado de los dos escritorios, a su par.
      expect(plan().desks.some((o) => o.faces === 'left' && o.seat.y === d.seat.y && o.seat.x === d.seat.x + 3)).toBe(true)
    }
    expect(plan().boss).toMatchObject({ faces: 'down', desk: { x: 4, y: 3 }, seat: { x: 4, y: 2 } })
    expect(plan().cafe).toHaveLength(8)
    expect(plan().arcades).toHaveLength(3)
    expect(plan().queue).toHaveLength(2)
  })

  it('el escritorio estorba el paso y su silla queda libre para llegar', () => {
    for (const desk of [...plan().desks, plan().boss!]) {
      expect(walkable(desk.desk), 'el escritorio estorba').toBe(false)
      expect(walkable(desk.seat), 'la silla no').toBe(true)
    }
  })

  it('no hay áreas: cualquier rol se sienta en el primer puesto libre', () => {
    const got = assignDesks([
      { id: 'a', role: 'backend' },
      { id: 'b', role: 'qa' },
      { id: 'c', role: 'diseño' },
      { id: 'jefe', role: 'jefe' },
    ])
    expect(['a', 'b', 'c'].map((id) => got.get(id)!.index)).toEqual([0, 1, 2])
    expect(got.get('jefe')).toBe(plan().boss)
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
        { id: 'd', role: 'frontend' },
        { id: 'b', role: 'backend' },
        { id: 'c', role: 'qa' },
      ],
      prev,
    )
    expect(second.get('b')!.index).toBe(first.get('b')!.index)
    expect(second.get('c')!.index).toBe(first.get('c')!.index)
    expect(second.get('d')!.index).toBe(first.get('a')!.index)
  })

  it('nadie comparte escritorio: quien no alcanza puesto espera de pie, cada quien en su lugar', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ id: `e${i}`, role: 'backend' }))
    const got = assignDesks(many)
    expect(many.slice(0, 12).map((e) => got.get(e.id)!.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    const standing = many.slice(12).map((e) => got.get(e.id)!)
    expect(standing.every((d) => d.virtual)).toBe(true)
    expectApart(standing.map((d) => d.seat))
  })
})

/** Nadie queda encima de otro ni en el lugar de alguien: una persona mide dos casillas y media de alto. */
function expectApart(spots: Point[]) {
  const { map, busy, reach } = plan()
  spots.forEach((a, i) => {
    expect(busy[a.y * map.w + a.x], `${a.x},${a.y} es lugar de alguien`).toBe(0)
    expect(reach[a.y * map.w + a.x], `${a.x},${a.y} no se alcanza`).toBe(1)
    for (const b of spots.slice(i + 1)) expect(a.x === b.x && Math.abs(a.y - b.y) <= 2, `${a.x},${a.y} y ${b.x},${b.y} se enciman`).toBe(false)
  })
}

describe('sin encimarse', () => {
  it('quien espera a otro se para cerca, fuera de su lugar y del de los vecinos', () => {
    const blocker = plan().desks[7]
    const spots = waitingSpots([
      { id: 'a', near: blocker.seat },
      { id: 'b', near: blocker.seat },
      { id: 'c', near: blocker.seat },
    ])
    const got = ['a', 'b', 'c'].map((id) => spots.get(id)!)
    expectApart(got)
    for (const s of got) expect(Math.abs(s.x - blocker.seat.x) + Math.abs(s.y - blocker.seat.y)).toBeLessThanOrEqual(6)
  })

  it('la fila del jefe usa las marcas y, cuando se acaban, lugares libres cerca', () => {
    const queue = [0, 1, 2, 3].map((i) => bossQueue(i))
    expect(queue.slice(0, 2)).toEqual(plan().queue)
    expectApart(queue.slice(2))
    expect(new Set(queue.map((q) => `${q.x},${q.y}`)).size).toBe(4)
  })

  it('de perfil nadie queda delante de otro: en su columna el siguiente está dos casillas abajo', () => {
    const seats = plan().desks.map((d) => d.seat)
    for (const a of seats) for (const b of seats) if (a !== b) expect(a.x === b.x && Math.abs(a.y - b.y) < 2).toBe(false)
  })
})

describe('muros', () => {
  /** Oficina de 8×8 con muro al fondo, a los lados y una división a media altura con puerta. */
  function walls(): OfficeMap {
    const m = emptyMap(8, 8)
    paintFloor(m, { x: 0, y: 0, w: 8, h: 8 }, 'madera')
    paintWall(m, { x: 0, y: 0, w: 8, h: 1 }, 'pared')
    paintWall(m, { x: 0, y: 0, w: 1, h: 8 }, 'pared')
    paintWall(m, { x: 7, y: 0, w: 1, h: 8 }, 'pared')
    paintWall(m, { x: 0, y: 4, w: 5, h: 1 }, 'pared')
    paintWall(m, { x: 5, y: 4, w: 3, h: 1 }, 'ventanal')
    paintWall(m, { x: 3, y: 4, w: 1, h: 1 }, DOOR)
    return m
  }

  it('corre a los lados o de arriba abajo', () => {
    const m = walls()
    expect(wallFacing(m, 3, 0)).toBe('frente')
    expect(wallFacing(m, 0, 2)).toBe('canto')
    expect(wallFacing(m, 0, 4)).toBe('frente')
  })

  it('la pared es baja donde tiene piso detrás; al fondo y en vidrio es alta', () => {
    const m = walls()
    expect(wallHeight(m, 3, 0)).toBe('alta')
    expect(wallHeight(m, 1, 4)).toBe('baja')
    expect(wallHeight(m, 6, 4)).toBe('alta')
    // El tramo es bajo entero, también donde un muro de canto le cae encima.
    expect(wallHeight(m, 0, 4)).toBe('baja')
    expect(wallHeight(m, 4, 4)).toBe('baja')
  })

  it('una pared de canto sigue a la que tiene arriba', () => {
    const m = walls()
    expect(wallHeight(m, 0, 2)).toBe('alta')
    expect(wallHeight(m, 0, 6)).toBe('alta')
    // Una división suelta que baja de un murete es murete.
    paintWall(m, { x: 2, y: 5, w: 1, h: 2 }, 'pared')
    expect(wallFacing(m, 2, 5)).toBe('canto')
    expect(wallHeight(m, 2, 6)).toBe('baja')
  })
})

describe('rutas', () => {
  it('va de la entrada al jefe solo por donde se camina, en tramos rectos, y entra por su puerta', () => {
    const to = plan().boss!.seat
    const pts = route(entrance(), to)
    expect(pts[0]).toEqual(entrance())
    expect(pts.at(-1)).toEqual(to)
    for (let i = 1; i < pts.length; i++) expect(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y).toBe(true)
    for (const c of cells(pts)) expect(walkable(c), `${c.x},${c.y}`).toBe(true)
    expect(cells(pts).filter((c) => wallAt(plan().map, c.x, c.y) === DOOR)).toEqual([{ x: 7, y: 7 }])
  })

  it('prefiere el camino con menos vueltas', () => {
    const m = emptyMap(10, 10)
    paintFloor(m, { x: 0, y: 0, w: 10, h: 10 }, 'madera')
    const pts = routeIn(buildPlan(m), { x: 0, y: 0 }, { x: 6, y: 5 })
    expect(pts).toHaveLength(3)
  })

  it('rodea un muro y, si lo encierran, va derecho en vez de quedarse atorado', () => {
    const m = emptyMap(9, 5)
    paintFloor(m, { x: 0, y: 0, w: 9, h: 5 }, 'madera')
    paintWall(m, { x: 4, y: 0, w: 1, h: 4 }, 'pared')
    const around = routeIn(buildPlan(m), { x: 1, y: 0 }, { x: 7, y: 0 })
    expect(cells(around)).toContainEqual({ x: 4, y: 4 })
    paintWall(m, { x: 4, y: 4, w: 1, h: 1 }, 'pared')
    expect(routeIn(buildPlan(m), { x: 1, y: 0 }, { x: 7, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 7, y: 0 },
    ])
  })
})

describe('Actor', () => {
  it('entra por la entrada, camina a su escritorio y ahí trabaja', () => {
    const desk = plan().desks[1]
    const a = new Actor('x', { desk })
    expect(a.pos).toEqual(entrance())
    expect(a.pose).toBe('walk')
    for (let i = 0; i < 400; i++) a.update(0.1)
    expect(a.pos).toEqual(desk.seat)
    a.setState('working')
    expect(a.pose).toBe('type')
    expect(a.look.monitor).toBe('blink')
  })

  it('bloqueado muestra alerta; al irse camina a la salida y desaparece', () => {
    const a = new Actor('x', { desk: plan().desks[0] })
    for (let i = 0; i < 400; i++) a.update(0.1)
    a.setState('blocked')
    expect(a.look.bubble).toBe('alert')
    a.setState('exited')
    expect(a.gone).toBe(false)
    for (let i = 0; i < 400; i++) a.update(0.1)
    expect(a.gone).toBe(true)
  })

  it('esperando dependencia camina al escritorio de quien bloquea', () => {
    const dep = plan().desks[0]
    const a = new Actor('x', { desk: plan().desks[4] })
    a.setState('waiting', { dependencyDesk: dep })
    for (let i = 0; i < 400; i++) a.update(0.1)
    expect(a.pos).toEqual({ x: dep.seat.x + 1, y: dep.seat.y })
    expect(a.look.bubble).toBe('clock')
  })
})

describe('modo creativo: dibujar la oficina desde cero', () => {
  /** Un cuarto chico: piso, muro del fondo con puerta y lo mínimo para trabajar. */
  function draw(): OfficeMap {
    let m = emptyMap(14, 10)
    m = applyTool(m, { type: 'floor', id: 'madera' }, { x: 0, y: 0 }, { x: 13, y: 9 })
    m = applyTool(m, { type: 'wall', id: 'pared' }, { x: 0, y: 3 }, { x: 13, y: 4 })
    m = applyTool(m, { type: 'door' }, { x: 6, y: 3 }, { x: 6, y: 3 })
    m = applyTool(m, { type: 'item', piece: 'puesto' }, { x: 0, y: 0 }, { x: 3, y: 6 })
    m = applyTool(m, { type: 'item', piece: 'puesto_jefe' }, { x: 0, y: 0 }, { x: 10, y: 6 })
    m = applyTool(m, { type: 'item', piece: 'entrada' }, { x: 0, y: 0 }, { x: 1, y: 1 })
    return m
  }

  it('un lienzo vacío dice por dónde empezar', () => {
    expect(mapIssues(buildPlan(emptyMap()))).toEqual(['Pinta piso: todavía no hay por dónde caminar.'])
  })

  it('lo dibujado se vuelve oficina: puesto, jefe, entrada y camino por la puerta', () => {
    const m = draw()
    // El muro es una línea aunque el arrastre se desvíe una casilla.
    expect(wallAt(m, 13, 3)).toBe('pared')
    expect(wallAt(m, 13, 4)).toBe('')
    expect(wallAt(m, 6, 3)).toBe(DOOR)

    const p = buildPlan(m)
    expect(p.desks).toHaveLength(1)
    // El jefe se sienta detrás de su escritorio, de frente.
    expect(p.boss?.seat).toEqual({ x: 10, y: 5 })
    expect(p.entrance).toEqual({ x: 1, y: 1 })
    const pts = routeIn(p, p.entrance, p.desks[0].seat)
    expect(cells(pts)).toContainEqual({ x: 6, y: 3 })
    // Falta dónde descansar y dónde jugar, pero ya se puede trabajar.
    expect(mapIssues(p)).toEqual([
      'Sin mesas con sillas: quien descanse se queda en la entrada.',
      'Sin maquinitas: quien limpie contexto se queda en la entrada.',
    ])
  })

  it('avisa si un puesto queda encerrado', () => {
    const m = applyTool(draw(), { type: 'door' }, { x: 6, y: 3 }, { x: 6, y: 3 })
    expect(wallAt(m, 6, 3)).toBe('pared')
    expect(mapIssues(buildPlan(m))).toContain('1 puesto no se alcanza desde la entrada.')
    expect(mapIssues(buildPlan(m))).toContain('El escritorio del jefe no se alcanza desde la entrada.')
  })

  it('cada herramienta deja intacto el mapa anterior, para poder deshacer', () => {
    const before = draw()
    const copy = structuredClone(before)
    applyTool(before, { type: 'erase' }, { x: 0, y: 0 }, { x: 13, y: 9 })
    expect(before).toEqual(copy)
  })

  it('borrar quita muebles del área; en una casilla sin muebles quita el muro', () => {
    let m = draw()
    m = applyTool(m, { type: 'erase' }, { x: 2, y: 5 }, { x: 4, y: 7 })
    expect(buildPlan(m).desks).toHaveLength(0)
    expect(buildPlan(m).boss).toBeDefined()
    m = applyTool(m, { type: 'erase' }, { x: 0, y: 3 }, { x: 0, y: 3 })
    expect(wallAt(m, 0, 3)).toBe('')
    expect(floorAt(m, 0, 3)).toBe('madera')
  })

  it('solo hay una entrada y un escritorio del jefe: el nuevo reemplaza al anterior', () => {
    const m = draw()
    placeItem(m, { piece: 'entrada', x: 5, y: 1 })
    placeItem(m, { piece: 'puesto_jefe', x: 6, y: 6 })
    expect(m.items.filter((i) => i.piece === 'entrada')).toEqual([{ piece: 'entrada', x: 5, y: 1 }])
    expect(buildPlan(m).boss?.desk).toEqual({ x: 6, y: 6 })
  })

  it('la pieza se apoya donde está el cursor: su base, al centro', () => {
    expect(itemAt('billar', { x: 5, y: 8 })).toEqual({ piece: 'billar', x: 5, y: 6 })
    expect(itemAt('mesa_cafe', { x: 5, y: 8 })).toEqual({ piece: 'mesa_cafe', x: 4, y: 8 })
    expect(toolRect({ type: 'item', piece: 'billar' }, { x: 0, y: 0 }, { x: 5, y: 8 })).toEqual({ x: 5, y: 6, w: 2, h: 3 })
  })

  it('sin puestos dibujados la gente espera de pie cerca de la entrada', () => {
    const m = draw()
    m.items = m.items.filter((i) => i.piece !== 'puesto' && i.piece !== 'puesto_jefe')
    setMap(m)
    const got = assignDesks([
      { id: 'q', role: 'qa' },
      { id: 'jefe', role: 'jefe' },
    ])
    expect(got.get('q')!.virtual).toBe(true)
    expect(got.get('jefe')!.virtual).toBe(true)
    // Cerca de la entrada, sin taparla ni encimarse.
    expect(got.get('q')!.seat).not.toEqual({ x: 1, y: 1 })
    expectApart([got.get('q')!.seat, got.get('jefe')!.seat])
  })

  it('cambiar el tamaño conserva lo que cabe; un mapa a medias no se carga y uno viejo con zonas sí', () => {
    const m = draw()
    resizeMap(m, 9, 12)
    expect([m.w, m.h, m.floor.length]).toEqual([9, 12, 108])
    expect(m.items.map((i) => i.piece)).toEqual(['puesto', 'entrada'])
    expect(isOfficeMap(m)).toBe(true)
    expect(isOfficeMap({ ...m, zones: [{ kind: 'backend', x: 0, y: 0, w: 2, h: 2 }] })).toBe(true)
    expect(isOfficeMap({ ...m, floor: [] })).toBe(false)
    expect(isOfficeMap(null)).toBe(false)
  })
})
