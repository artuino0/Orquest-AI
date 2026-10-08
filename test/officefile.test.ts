import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readOffice, writeOffice } from '../src/core/officefile.js'

describe('oficina guardada', () => {
  it('guarda y vuelve a leer; sin archivo o con uno dañado no hay oficina', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orquest-oficina-'))
    const path = join(dir, 'estudio', 'oficina.json')
    expect(await readOffice(path)).toBeNull()

    await writeOffice(path, { version: 1, w: 8, h: 8 })
    await writeOffice(path, { version: 1, w: 9, h: 8 })
    expect(await readOffice(path)).toEqual({ version: 1, w: 9, h: 8 })
    // No queda el temporal.
    expect(await readdir(join(dir, 'estudio'))).toEqual(['oficina.json'])

    await writeFile(path, '{"version":1,')
    expect(await readOffice(path)).toBeNull()
  })
})
