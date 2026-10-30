import { deflateRawSync } from 'node:zlib'

/** Un zip mínimo: unos archivos comprimidos y otros tal cual, como los guarda Trazo. */
export function zip(files: Record<string, unknown>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  Object.entries(files).forEach(([name, value], i) => {
    const raw = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))
    const method = i % 2 ? 0 : 8
    const data = method ? deflateRawSync(raw) : raw
    const nameBuf = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, data)
    centrals.push(central, nameBuf)
    offset += local.length + nameBuf.length + data.length
  })
  const dir = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dir, end])
}

/** Un diseño chico: una página con una pantalla, un texto y un botón de componente. */
export const sample = () =>
  zip({
    'trazo.json': { formatVersion: 1, app: 'trazo', name: 'Tienda', pages: ['p1'] },
    'pages/p1.json': {
      name: 'Inicio',
      root: ['pantalla'],
      nodes: [
        ['pantalla', { type: 'frame', name: 'Inicio · Escritorio', w: 1440, h: 900, layout: { direction: 'column', gap: 24 }, children: ['titulo', 'boton'] }],
        ['titulo', { type: 'text', name: 'Titular', w: 600, h: 48, text: 'Hola', style: { size: 40, color: { var: 'color/fg' } } }],
        ['boton', { type: 'instance', name: 'Botón', w: 160, h: 44, component: 'btn' }],
      ],
    },
    'variables.json': { colors: [{ name: 'color/fg', values: { light: '#0E1A2B' } }] },
    'components.json': { components: { btn: { name: 'Botón / Primario', root: ['b'], nodes: { b: { type: 'frame', name: 'Botón', w: 160, h: 44 } } } } },
  })
