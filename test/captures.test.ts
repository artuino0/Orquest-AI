import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listCaptures, readCapture } from '../src/core/captures.js'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })))

describe('capturas de un empleado', () => {
  it('salen las imágenes que dejó en su oficina, también en carpetas ignoradas, y nada más', async () => {
    const office = mkdtempSync(join(tmpdir(), 'orquest-capturas-'))
    dirs.push(office)
    const git = (...a: string[]) => execFileSync('git', a, { cwd: office })
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 't@t')
    git('config', 'user.name', 't')
    mkdirSync(join(office, 'public'))
    writeFileSync(join(office, 'public', 'logo.png'), 'logo') // ya estaba en el repo: no es captura
    writeFileSync(join(office, '.gitignore'), '.playwright-cli/\nnode_modules/\n')
    git('add', '.')
    git('commit', '-qm', 'inicio')

    mkdirSync(join(office, '.playwright-cli'))
    writeFileSync(join(office, '.playwright-cli', 'alta de cliente.png'), 'PNG1') // ignorada por git
    mkdirSync(join(office, 'capturas'))
    writeFileSync(join(office, 'capturas', 'error-401.jpg'), 'JPG') // nueva
    writeFileSync(join(office, 'notas.md'), 'no es imagen')
    mkdirSync(join(office, 'node_modules', 'x'), { recursive: true })
    writeFileSync(join(office, 'node_modules', 'x', 'icono.png'), 'no cuenta')

    const list = await listCaptures(office, ['capturas/error-401.jpg', '../fuera.png'])
    expect(list.map((c) => c.path).sort()).toEqual(['.playwright-cli/alta de cliente.png', 'capturas/error-401.jpg'])

    // Al entregar, sus capturas quedan en un commit: siguen contando, por la carpeta o por lo que su rama añade.
    const main = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: office }).toString().trim()
    mkdirSync(join(office, 'docs', 'capturas', 'T3'), { recursive: true })
    writeFileSync(join(office, 'docs', 'capturas', 'T3', 'movil-catalogo.png'), 'PNG2')
    writeFileSync(join(office, 'resultado.png'), 'PNG3')
    git('add', 'docs', 'resultado.png')
    git('commit', '-qm', 'T3: entrega')
    expect((await listCaptures(office)).map((c) => c.path)).toContain('docs/capturas/T3/movil-catalogo.png')
    expect((await listCaptures(office)).map((c) => c.path)).not.toContain('resultado.png')
    expect((await listCaptures(office, [], main)).map((c) => c.path)).toContain('resultado.png')
    // El logo que ya venía en el repo no es captura de nadie.
    expect((await listCaptures(office, [], main)).map((c) => c.path)).not.toContain('public/logo.png')

    const img = await readCapture(office, '.playwright-cli/alta de cliente.png')
    expect(img.type).toBe('image/png')
    expect(Buffer.from(img.bytes).toString()).toBe('PNG1')
    expect((await readCapture(office, 'capturas/error-401.jpg')).type).toBe('image/jpeg')
    await expect(readCapture(office, '../fuera.png')).rejects.toThrow(/dentro de su oficina/)
    await expect(readCapture(office, 'notas.md')).rejects.toThrow(/Solo se pueden abrir imágenes/)
  })
})
