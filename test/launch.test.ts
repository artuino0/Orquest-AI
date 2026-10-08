import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveLaunch, shimTarget } from '../src/core/launch.js'

const SCRIPT = `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n)\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n`
const EXE = `@ECHO off\r\nCALL :find_dp0\r\n"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*\r\n`

const dirs: string[] = []
// En Windows git puede tardar en soltar la carpeta: se reintenta en vez de tumbar la prueba.
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })))

describe('lanzadores de npm en Windows', () => {
  it('se lee a qué programa apuntan', () => {
    expect(shimTarget(SCRIPT)).toBe('node_modules\\@openai\\codex\\bin\\codex.js')
    expect(shimTarget(EXE)).toBe('node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe')
    expect(shimTarget('@echo hola')).toBeUndefined()
  })

  it('una CLI que no está se deja con su nombre, para que el error diga cuál falta', async () => {
    expect(await resolveLaunch(['no-existe-orquest'], ['--x'], '')).toEqual({ file: 'no-existe-orquest', args: ['--x'] })
  })

  it.runIf(process.platform === 'win32')('se arranca el programa del paquete, no el .cmd', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orquest-shim-'))
    dirs.push(dir)
    writeFileSync(join(dir, 'miclaude.cmd'), EXE)
    const args = ['--settings', '{"permissions":{"allow":["Bash(npm test)"]}}']
    expect(await resolveLaunch(['miclaude'], args, dir)).toEqual({ file: join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'), args })

    writeFileSync(join(dir, 'micodex.cmd'), SCRIPT)
    writeFileSync(join(dir, 'node.exe'), '')
    const codex = await resolveLaunch(['micodex'], ['-m', 'x'], dir)
    expect(codex).toEqual({ file: join(dir, 'node.exe'), args: [join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'), '-m', 'x'] })
  })
})
