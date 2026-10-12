import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RuleError } from '../src/core/board.js'
import { fileSides, listDir, readText } from '../src/core/files.js'

const made: string[] = []
function office() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'orq-files-')))
  made.push(dir)
  mkdirSync(join(dir, '.git'))
  mkdirSync(join(dir, 'src', 'vistas'), { recursive: true })
  writeFileSync(join(dir, 'src', 'vistas', 'Carrito.vue'), '<template />\n')
  writeFileSync(join(dir, 'src', 'main.ts'), "console.log('hola')\n")
  writeFileSync(join(dir, 'README.md'), '# Tienda\n')
  writeFileSync(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 1]))
  return dir
}
afterEach(() => made.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('explorador de archivos de una oficina', () => {
  it('lista una carpeta: carpetas primero, sin .git, con rutas desde la oficina', async () => {
    const dir = office()
    expect(await listDir(dir)).toEqual([
      { name: 'src', path: 'src', dir: true },
      { name: 'logo.png', path: 'logo.png', dir: false },
      { name: 'README.md', path: 'README.md', dir: false },
    ])
    expect(await listDir(dir, 'src')).toEqual([
      { name: 'vistas', path: 'src/vistas', dir: true },
      { name: 'main.ts', path: 'src/main.ts', dir: false },
    ])
  })

  it('da el texto de un archivo y avisa de lo que no es texto', async () => {
    const dir = office()
    expect(await readText(dir, 'src/main.ts')).toMatchObject({ text: "console.log('hola')\n", binary: false, truncated: false })
    expect(await readText(dir, 'logo.png')).toMatchObject({ text: '', binary: true })
  })

  it('un archivo muy largo llega cortado y lo dice', async () => {
    const dir = office()
    writeFileSync(join(dir, 'grande.log'), 'x'.repeat(500_000))
    const f = await readText(dir, 'grande.log')
    expect(f.truncated).toBe(true)
    expect(f.text.length).toBe(400_000)
    expect(f.size).toBe(500_000)
  })

  it('nada fuera de la oficina: ni con .. ni con una ruta completa', async () => {
    const dir = office()
    const outside = join(dir, '..', 'orq-fuera.txt')
    writeFileSync(outside, 'secreto')
    made.push(outside)
    await expect(readText(dir, '../orq-fuera.txt')).rejects.toThrow(RuleError)
    await expect(readText(dir, outside)).rejects.toThrow(RuleError)
    await expect(listDir(dir, '..')).rejects.toThrow(RuleError)
    await expect(readText(dir, 'src')).rejects.toThrow(RuleError)
  })

  it('da los dos lados de un cambio: como estaba en git y como está ahora', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'orq-sides-')))
    made.push(dir)
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
    git('init', '-q', '-b', 'main')
    mkdirSync(join(dir, 'src', 'viejo'), { recursive: true })
    writeFileSync(join(dir, 'src', 'a.ts'), 'const a = 1\n')
    writeFileSync(join(dir, 'src', 'viejo', 'b.ts'), 'adiós\n')
    git('add', '-A')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'inicio')
    writeFileSync(join(dir, 'src', 'a.ts'), 'const a = 2\n')
    writeFileSync(join(dir, 'src', 'nuevo.ts'), 'hola\n')
    rmSync(join(dir, 'src', 'viejo'), { recursive: true })
    // Cambiado: los dos lados, con su salto de línea final intacto.
    expect(await fileSides(dir, 'src/a.ts')).toEqual({ before: 'const a = 1\n', after: 'const a = 2\n', binary: false, truncated: false })
    // Nuevo: no había nada. Borrado (con todo y carpeta): ya no hay nada.
    expect(await fileSides(dir, 'src/nuevo.ts')).toMatchObject({ before: '', after: 'hola\n' })
    expect(await fileSides(dir, 'src/viejo/b.ts')).toMatchObject({ before: 'adiós\n', after: '' })
    await expect(fileSides(dir, '../fuera.ts')).rejects.toThrow(RuleError)
  })
})
