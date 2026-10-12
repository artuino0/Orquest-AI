import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RuleError } from '../src/core/board.js'
import { checkRepo, prepareRepo } from '../src/core/repo.js'
import { currentBranch } from '../src/core/worktree.js'

const dirs: string[] = []
const folder = () => {
  const dir = mkdtempSync(join(tmpdir(), 'orquest-carpeta-'))
  dirs.push(dir)
  return dir
}
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
// En Windows git puede tardar en soltar la carpeta: se reintenta en vez de tumbar la prueba.
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })))

describe('preparar una carpeta para abrirla', () => {
  it('una carpeta suelta se vuelve repositorio con su primer commit y un .gitignore básico', async () => {
    const dir = folder()
    writeFileSync(join(dir, 'index.js'), 'console.log(1)')
    mkdirSync(join(dir, 'node_modules', 'pesado'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'pesado', 'index.js'), 'x')
    writeFileSync(join(dir, '.env'), 'SECRETO=1')
    expect(await checkRepo(dir)).toEqual({ state: 'no-repo', inside: [], gitignore: false })

    await prepareRepo(dir)
    expect(await checkRepo(dir)).toMatchObject({ state: 'ok', gitignore: true })
    expect(await currentBranch(dir)).toBe('main')
    // Entra el proyecto; no las dependencias ni los secretos.
    expect(git(dir, 'ls-files').split('\n').sort()).toEqual(['.gitignore', 'index.js'])
    expect(git(dir, 'log', '--format=%s')).toBe('Primer commit')
  })

  it('un repositorio sin commits recibe el primero y su .gitignore no se toca', async () => {
    const dir = folder()
    git(dir, 'init', '-q', '-b', 'main')
    writeFileSync(join(dir, '.gitignore'), 'tmp/\n')
    writeFileSync(join(dir, 'a.txt'), 'hola')
    expect(await checkRepo(dir)).toEqual({ state: 'no-commits', inside: [], gitignore: true })

    await prepareRepo(dir)
    expect((await checkRepo(dir)).state).toBe('ok')
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('tmp/\n')
    expect(git(dir, 'ls-files').split('\n').sort()).toEqual(['.gitignore', 'a.txt'])
    // Preparar lo que ya está listo no hace nada.
    await prepareRepo(dir)
    expect(git(dir, 'rev-list', '--count', 'HEAD')).toBe('1')
  })

  it('una carpeta vacía también queda lista', async () => {
    const dir = folder()
    await prepareRepo(dir)
    expect((await checkRepo(dir)).state).toBe('ok')
  })

  it('una carpeta con repositorios dentro los lista y no se convierte en uno', async () => {
    const dir = folder()
    for (const name of ['api', 'web']) {
      mkdirSync(join(dir, name))
      git(join(dir, name), 'init', '-q', '-b', 'main')
    }
    mkdirSync(join(dir, 'notas'))
    expect(await checkRepo(dir)).toEqual({ state: 'no-repo', inside: [join(dir, 'api'), join(dir, 'web')], gitignore: false })
    await expect(prepareRepo(dir)).rejects.toThrow(RuleError)
    expect(existsSync(join(dir, '.git'))).toBe(false)

    // Aunque alguien haya corrido `git init` en la carpeta que los agrupa: no se guarda un commit que los envuelva.
    git(dir, 'init', '-q', '-b', 'main')
    expect(await checkRepo(dir)).toMatchObject({ state: 'no-commits', inside: [join(dir, 'api'), join(dir, 'web')] })
    await expect(prepareRepo(dir)).rejects.toThrow(RuleError)
    expect(git(dir, 'status', '--porcelain', '--untracked-files=no')).toBe('')
  })
})
