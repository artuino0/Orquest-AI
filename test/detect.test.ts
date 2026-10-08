import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canHire, detectProvider, findBinary, isReady, runCli } from '../src/core/detect.js'
import { PROVIDERS } from '../src/core/providers.js'

const WIN = process.platform === 'win32'

/**
 * CLI de mentira en `dir`. Contesta la versión y, si se le pregunta por la
 * sesión, dice que sí solo cuando existe el archivo `sesion` junto a ella. En
 * Windows es un .cmd, como los lanzadores que deja npm.
 */
async function fakeCli(dir: string, name: string, o: { version: string; ask: string; yes: string; no: string }): Promise<string> {
  const path = join(dir, WIN ? `${name}.cmd` : name)
  const [first] = o.ask.split(' ')
  // Dentro de un bloque de cmd los paréntesis del texto hay que escaparlos.
  const cmd = (text: string) => text.replace(/[()]/g, '^$&')
  await writeFile(
    path,
    WIN
      ? `@echo off\r\nif "%1"=="${first}" (\r\n  if exist "%~dp0sesion" (echo ${cmd(o.yes)}) else (echo ${cmd(o.no)}& exit /b 1)\r\n) else (echo ${cmd(o.version)})\r\n`
      : `#!/bin/sh\nif [ "$1" = "${first}" ]; then\n  if [ -f "$(dirname "$0")/sesion" ]; then echo '${o.yes}'; else echo '${o.no}'; exit 1; fi\nelse echo '${o.version}'; fi\n`,
  )
  await chmod(path, 0o755)
  return path
}

async function withPath<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const old = process.env.PATH
  process.env.PATH = dir
  try {
    return await fn()
  } finally {
    process.env.PATH = old
  }
}

describe('detección de CLIs', () => {
  it('encuentra el binario y su versión, y le pregunta a la propia CLI por la sesión', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orquest detect-')) // con espacio: así vienen muchas rutas
    const home = join(dir, 'home')
    await mkdir(home)
    const bin = await fakeCli(dir, 'codex', { version: 'codex-cli 9.9.9', ask: 'login status', yes: 'Logged in using ChatGPT', no: 'Not logged in' })

    await withPath(dir, async () => {
      expect(await findBinary('codex')).toBe(bin)
      expect(await detectProvider(PROVIDERS.codex, home)).toMatchObject({ installed: true, version: '9.9.9', session: false, login: 'codex login' })

      await writeFile(join(dir, 'sesion'), '')
      const logged = await detectProvider(PROVIDERS.codex, home)
      expect(logged).toMatchObject({ session: true, account: 'ChatGPT' })
      expect(isReady(logged)).toBe(true)

      const none = await detectProvider(PROVIDERS.grok, home)
      expect(none).toMatchObject({ installed: false, session: null })
      expect(none.install?.url).toBeTruthy()
    })
  })

  it('un archivo de sesión viejo no engaña: manda lo que diga la CLI', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orquest-detect-'))
    const home = join(dir, 'home')
    await mkdir(join(home, '.codex'), { recursive: true })
    await writeFile(join(home, '.codex', 'auth.json'), '{}')
    await fakeCli(dir, 'codex', { version: 'codex-cli 1.0.0', ask: 'login status', yes: 'Logged in using ChatGPT', no: 'Not logged in' })
    await withPath(dir, async () => {
      expect((await detectProvider(PROVIDERS.codex, home)).session).toBe(false)
    })
  })

  it('sin comando de sesión se mira el archivo; una carpeta de credenciales vacía no cuenta', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orquest-detect-'))
    const home = join(dir, 'home')
    await mkdir(join(home, '.kimi', 'credentials'), { recursive: true })
    await fakeCli(dir, 'kimi', { version: 'kimi 0.9.0', ask: 'nada', yes: '', no: '' })
    await fakeCli(dir, 'grok', { version: 'grok 1.0.41 (4220f3b224a6)', ask: 'nada', yes: '', no: '' })
    await withPath(dir, async () => {
      expect(await detectProvider(PROVIDERS.kimi, home)).toMatchObject({ version: '0.9.0', session: false })
      await writeFile(join(home, '.kimi', 'credentials', 'token.json'), '{}')
      expect((await detectProvider(PROVIDERS.kimi, home)).session).toBe(true)
      // Grok no tiene forma conocida de comprobarse: instalada, sesión sin saber.
      expect(await detectProvider(PROVIDERS.grok, home)).toMatchObject({ installed: true, version: '1.0.41', session: null })
    })
    await rm(dir, { recursive: true, force: true })
  })

  it('una CLI que no existe o no arranca contesta código -1, sin lanzar', async () => {
    expect((await runCli(join(tmpdir(), 'no-existe-orquest'), ['--version'])).code).toBe(-1)
  })

  it('sin una CLI usable no se puede contratar', () => {
    expect(canHire([])).toBe(false)
    expect(canHire([{ id: 'codex', name: 'Codex', installed: true, session: false }])).toBe(false)
    expect(canHire([{ id: 'grok', name: 'Grok', installed: true, session: null }])).toBe(true)
  })
})
