import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canHire, detectProvider, detectRequirements, findBinary, isReady, keyringHas, runCli } from '../src/core/detect.js'
import { PROVIDERS } from '../src/core/providers.js'

const WIN = process.platform === 'win32'

/**
 * CLI de mentira en `dir`. Contesta la versión y, si se le pregunta por la
 * sesión, dice que sí solo cuando existe el archivo `sesion` junto a ella. En
 * Windows es un .cmd, como los lanzadores que deja npm. No llama a ningún otro
 * programa: la prueba la corre con el PATH reducido a su carpeta.
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
      : `#!/bin/sh\nif [ "$1" = "${first}" ]; then\n  if [ -f "\${0%/*}/sesion" ]; then echo '${o.yes}'; else echo '${o.no}'; exit 1; fi\nelse echo '${o.version}'; fi\n`,
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

  it('sabe si hay una entrada en el almacén de credenciales del sistema, sin leerla', async () => {
    const answers = (stdout: string, code = 0) => async () => ({ stdout, stderr: '', code })
    // Windows, en inglés y en español: el encabezado nombra lo buscado; si existe, su renglón lo repite.
    expect(await keyringHas('gemini', 'antigravity', 'win32', answers('Currently stored credentials for gemini:antigravity:\r\n\r\n    Target: gemini:antigravity\r\n    Type: Generic\r\n    User: antigravity\r\n'))).toBe(true)
    expect(await keyringHas('gemini', 'antigravity', 'win32', answers('Credenciales almacenadas actualmente para gemini:antigravity:\r\n\r\n    Destino: gemini:antigravity\r\n    Tipo: Genérico\r\n'))).toBe(true)
    expect(await keyringHas('gemini', 'antigravity', 'win32', answers('Currently stored credentials for gemini:antigravity:\r\n\r\n* NONE *\r\n'))).toBe(false)
    // macOS: el código de salida dice si está. Linux: contesta la dirección de la entrada, o ninguna.
    expect(await keyringHas('gemini', 'antigravity', 'darwin', answers('keychain: "login.keychain-db"', 0))).toBe(true)
    expect(await keyringHas('gemini', 'antigravity', 'darwin', answers('', 44))).toBe(false)
    expect(await keyringHas('gemini', 'antigravity', 'linux', answers("([objectpath '/org/freedesktop/secrets/collection/login/7'], @ao [])"))).toBe(true)
    expect(await keyringHas('gemini', 'antigravity', 'linux', answers('(@ao [], @ao [])'))).toBe(false)
    // Sin la herramienta no se sabe: no es un «no».
    for (const os of ['win32', 'darwin', 'linux'] as const) expect(await keyringHas('gemini', 'antigravity', os, answers('', -1))).toBeNull()
    // Lo que se le pregunta al sistema: la entrada por su nombre, nunca su secreto.
    const asked: string[][] = []
    const spy = async (bin: string, args: string[]) => (asked.push([bin, ...args]), { stdout: '', stderr: '', code: 1 })
    for (const os of ['win32', 'darwin', 'linux'] as const) await keyringHas('gemini', 'antigravity', os, spy)
    expect(asked[0]).toEqual(['cmdkey', '/list:gemini:antigravity'])
    expect(asked.flat().join(' ')).not.toMatch(/-w\b|-g\b|secret-tool|GetSecret/)
  })

  it('Antigravity guarda su sesión en el almacén del sistema: sin su archivo, igual se detecta', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orq-agy-'))
    const home = await mkdtemp(join(tmpdir(), 'orq-agy-home-'))
    const oldPath = process.env.PATH
    try {
      await fakeCli(dir, 'agy', { version: '1.3.3', ask: 'nada', yes: '', no: '' })
      process.env.PATH = dir
      // Máquina nueva: no hay ningún archivo de Gemini. El almacén es el que sabe.
      expect((await detectProvider(PROVIDERS.antigravity, home, async () => true)).session).toBe(true)
      expect((await detectProvider(PROVIDERS.antigravity, home, async () => false)).session).toBe(false)
      expect((await detectProvider(PROVIDERS.antigravity, home, async () => null)).session).toBe(false)
      // Sin almacén (o sin poder preguntarle), su archivo cifrado también cuenta.
      await mkdir(join(home, '.gemini', 'antigravity-cli'), { recursive: true })
      await writeFile(join(home, '.gemini', 'antigravity-cli', 'authstore.enc'), 'x')
      expect((await detectProvider(PROVIDERS.antigravity, home, async () => null)).session).toBe(true)
    } finally {
      process.env.PATH = oldPath
      await rm(dir, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })

  it('una CLI que no existe o no arranca contesta código -1, sin lanzar', async () => {
    expect((await runCli(join(tmpdir(), 'no-existe-orquest'), ['--version'])).code).toBe(-1)
  })

  it('sin una CLI usable no se puede contratar', () => {
    expect(canHire([])).toBe(false)
    expect(canHire([{ id: 'codex', name: 'Codex', installed: true, session: false }])).toBe(false)
    expect(canHire([{ id: 'grok', name: 'Grok', installed: true, session: null }])).toBe(true)
  })

  it('avisa si falta git, que hace falta para abrir un proyecto', async () => {
    // En esta máquina sí está (las pruebas lo usan): sale instalado y con su versión.
    const [git] = await detectRequirements()
    expect(git).toMatchObject({ id: 'git', name: 'Git', installed: true })
    expect(git.version).toMatch(/^\d+\.\d+/)
    expect(git.install.url).toContain('git-scm.com')
    // Sin git en el PATH (ni en las carpetas de su instalador) sale como faltante, sin tronar.
    if (!WIN) {
      const empty = await mkdtemp(join(tmpdir(), 'orquest-sin-git-'))
      expect((await withPath(empty, () => detectRequirements()))[0]).toMatchObject({ installed: false, version: undefined })
    }
  })
})
