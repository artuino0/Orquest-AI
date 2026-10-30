import { delimiter } from 'node:path'
import { describe, expect, it } from 'vitest'
import { adoptShellPath, loginShellPath, mergePath, pathFromOutput } from '../src/core/shellpath.js'

describe('PATH del shell del usuario', () => {
  it('lee el PATH entre las marcas aunque la configuración imprima algo', () => {
    expect(pathFromOutput('Bienvenido\n__ORQUEST_PATH__/a:/b__ORQUEST_FIN__\n')).toBe('/a:/b')
    expect(pathFromOutput('nada')).toBeUndefined()
  })

  it('une los dos sin repetir, primero el del shell', () => {
    const j = (...d: string[]) => d.join(delimiter)
    expect(mergePath(j('/home/u/.nvm/bin', '/usr/bin'), j('/usr/bin', '/app/bin'))).toBe(j('/home/u/.nvm/bin', '/usr/bin', '/app/bin'))
  })

  it('se lo pide a un shell real', async () => {
    if (process.platform === 'win32') return
    expect(await loginShellPath('/bin/sh')).toBeTruthy()
  })

  it('un shell que no existe no dice nada', async () => {
    expect(await loginShellPath('/no/existe/sh')).toBeUndefined()
  })

  it('en Windows no toca el PATH', async () => {
    const before = process.env.PATH
    await adoptShellPath('win32', async () => '/otra')
    expect(process.env.PATH).toBe(before)
  })

  it('fuera de Windows suma el del shell', async () => {
    const before = process.env.PATH
    try {
      await adoptShellPath('linux', async () => '/desde/el/shell')
      expect(process.env.PATH?.split(delimiter)[0]).toBe('/desde/el/shell')
    } finally {
      process.env.PATH = before
    }
  })
})
