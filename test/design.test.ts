import { describe, expect, it } from 'vitest'
import { designNode, designPage, designSummary, parseDesign, readZip } from '../src/core/design.js'
import { sample } from './trazozip.js'

describe('diseños de Trazo', () => {
  it('lee el zip, comprimido o no', () => {
    const files = readZip(sample())
    expect([...files.keys()]).toContain('pages/p1.json')
    expect(JSON.parse(files.get('trazo.json')!.toString()).name).toBe('Tienda')
  })

  it('un archivo que no es zip se dice claro', () => {
    expect(() => parseDesign(Buffer.from('hola'))).toThrow(/no es un zip/)
  })

  it('el resumen trae páginas, pantallas, componentes y variables', () => {
    const s = designSummary(parseDesign(sample()))
    expect(s).toContain('Diseño «Tienda»')
    expect(s).toContain('- frame «Inicio · Escritorio» #pantalla 1440×900 column gap 24')
    expect(s).toContain('Botón / Primario (btn)')
    expect(s).toContain('#0E1A2B')
  })

  it('el árbol de una página, por id o por nombre', () => {
    const d = parseDesign(sample())
    const tree = designPage(d, 'inicio')
    expect(tree).toContain('  - text «Titular» #titulo 600×48 "Hola"')
    expect(tree).toContain('→ Botón / Primario')
    expect(designPage(d, 'p1')).toBe(tree)
    expect(() => designPage(d, 'otra')).toThrow(/Hay: Inicio/)
  })

  it('el detalle de un nodo trae sus hijos adentro', () => {
    const d = parseDesign(sample())
    const node = JSON.parse(designNode(d, '#pantalla'))
    expect(node.children.map((c: { id: string }) => c.id)).toEqual(['titulo', 'boton'])
    expect(node.children[0].style.size).toBe(40)
    expect(JSON.parse(designNode(d, 'b')).name).toBe('Botón')
    expect(() => designNode(d, 'nada')).toThrow(/No hay un nodo/)
  })
})
