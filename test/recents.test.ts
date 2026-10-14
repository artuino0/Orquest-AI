import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MAX_RECENTS, Recents } from '../src/core/recents.js'

const made: string[] = []
const file = () => {
  const dir = mkdtempSync(join(tmpdir(), 'orq-recientes-'))
  made.push(dir)
  return join(dir, 'recientes.json')
}
afterEach(() => made.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('proyectos recientes en la carpeta de la app', () => {
  it('guarda lo abierto, lo más reciente primero, sin repetir, y sobrevive a reabrir la app', async () => {
    const f = file()
    const r = new Recents(f)
    await r.touch({ path: 'C:\\dev\\tienda', at: 100 })
    await r.touch({ path: 'C:\\dev\\erp', at: 200, group: true })
    await r.touch({ path: 'C:\\dev\\tienda\\', at: 300 })
    const again = new Recents(f)
    expect(await again.all()).toEqual([
      { path: 'C:\\dev\\tienda\\', at: 300 },
      { path: 'C:\\dev\\erp', at: 200, group: true },
    ])
  })

  it('quitar uno lo saca de la lista, sin tocar nada más', async () => {
    const r = new Recents(file())
    await r.touch({ path: '/home/a/uno', at: 1 })
    await r.touch({ path: '/home/a/dos', at: 2 })
    expect((await r.remove('/home/a/uno')).map((x) => x.path)).toEqual(['/home/a/dos'])
  })

  it('aguanta muchas aperturas seguidas y recuerda solo las más nuevas', async () => {
    const r = new Recents(file())
    await Promise.all(Array.from({ length: MAX_RECENTS + 5 }, (_, i) => r.touch({ path: `/p/${i}`, at: i })))
    const list = await r.all()
    expect(list).toHaveLength(MAX_RECENTS)
    expect(list[0].path).toBe(`/p/${MAX_RECENTS + 4}`)
  })

  it('trae lo que guardaba la versión anterior sin pisar lo nuevo; un archivo roto cuenta como vacío', async () => {
    const f = file()
    writeFileSync(f, '{roto')
    const r = new Recents(f)
    expect(await r.all()).toEqual([])
    await r.touch({ path: '/p/nuevo', at: 50 })
    await r.import([{ path: '/p/viejo', at: 10 }, { path: '/p/nuevo', at: 1 }, { nada: 1 }, 'x'])
    expect(await r.all()).toEqual([{ path: '/p/nuevo', at: 50 }, { path: '/p/viejo', at: 10 }])
    expect(JSON.parse(readFileSync(f, 'utf8'))).toHaveLength(2)
  })
})
